"""
Extract + clean NWSDB "Customer Billing Summary For Adjustments" PDFs into anonymised CSVs.

Input : ../nwsdb_raw/*.pdf  — one PDF per domestic connection, monthly bills (2 pages, 23-column table)
Output: nwsdb_monthly.csv    — one row per household per billing month, cleaned + quality flags
        nwsdb_households.csv — one row per household: typical use, zero months, spikes, ...
        private/household_key.csv — account no. → household id (git-ignored; keep it private)

Anonymisation: households get random ids (HH001 …). Names, NIC, addresses, account numbers,
meter numbers, connection ids, balances and payments are NOT written to the outputs. Only the
billing cycle and the route part of the account number (e.g. 10/37/751) are kept as location.

Per billing month (columns of nwsdb_monthly.csv):
  units            consumption in m³ (1 unit = 1,000 L) as billed
  reading          cumulative meter reading (m³); reading_date = the date it was read
  period_days      days since the previous reading
  litres_per_day   units × 1000 / period_days  (blank when the period is unusable)
  water_charge, service_charge, vat_water, sewerage_charge, month_charge  (LKR, as billed)
Quality flags (1 = yes):
  zero_units       nothing billed this month
  zero_run         part of ≥ 3 consecutive zero months (vacant house, supply off or stuck meter)
  code_flag        a reading code is present (C.Code) — meaning not given in the report
  type_flag        bill type or reading type is not 'N' (normal)
  units_mismatch   units ≠ reading − previous reading (estimate, adjustment or meter change)
  meter_reset      reading went down (meter replaced / reset)
  odd_period       billing period < 20 or > 45 days
  spike            units ≥ 2 × the household's median non-zero month (and ≥ 10 m³)
  usable           period, reading and type are all normal → safe for consumption statistics

Usage (from edge-ai/data/nwsdb):  python extract_nwsdb.py
Needs: pip install pdfplumber pandas
"""
import argparse
import re
import secrets
from pathlib import Path

import numpy as np
import pandas as pd
import pdfplumber

HERE = Path(__file__).resolve().parent
COLUMNS = ["bill_ref", "b_type", "r_type", "c_code", "reading", "reading_date", "units", "amt_bf",
           "water_charge", "service_charge", "service_charge_sewerage", "vat_water", "sewerage_charge",
           "vat_sewerage", "installment", "surcharge", "concession", "month_charge", "adjust_1", "adjust_2",
           "total_payment", "prompt_pay", "total_due"]
KEEP = ["bill_month", "b_type", "r_type", "c_code", "reading", "reading_date", "units", "water_charge",
        "service_charge", "vat_water", "sewerage_charge", "surcharge", "concession", "month_charge"]
BILL_REF = re.compile(r"^(\d{4})\s*-\s*(\d{1,2})$")


def num(s):
    s = (s or "").replace(",", "").replace("\n", "").strip()
    return float(s) if s not in ("", "-") else np.nan


def parse_pdf(path):
    """→ (header dict, list of row dicts). Raises ValueError if the layout is unexpected."""
    rows, header = [], {}
    with pdfplumber.open(path) as pdf:
        text = pdf.pages[0].extract_text() or ""
        m = re.search(r"Account No\.\s*:\s*([\d/]+)", text)
        header["account"] = m.group(1) if m else path.stem
        m = re.search(r"Category\s*:\s*(\S+)", text)
        header["category"] = m.group(1) if m else ""
        m = re.search(r"Cycle No\.\s*:\s*(\d+)", text)
        header["cycle"] = m.group(1) if m else ""
        for page in pdf.pages:
            for table in page.extract_tables():
                if not table or len(table[0]) != len(COLUMNS):
                    raise ValueError(f"unexpected table with {len(table[0]) if table else 0} columns")
                for cells in table:
                    ref = (cells[0] or "").strip()
                    if not BILL_REF.match(ref):
                        continue                                  # header row
                    r = dict(zip(COLUMNS, cells))
                    y, mth = BILL_REF.match(ref).groups()
                    r["bill_month"] = f"{y}-{int(mth):02d}"
                    r["reading_date"] = pd.to_datetime((r["reading_date"] or "").replace("\n", ""),
                                                       format="%d/%m/%Y", errors="coerce")
                    for c in ("b_type", "r_type", "c_code"):
                        r[c] = (r[c] or "").replace("\n", "").strip()
                    for c in COLUMNS[4:]:
                        if c != "reading_date":
                            r[c] = num(r[c])
                    r["sewerage_charge"] = np.nansum([r["sewerage_charge"], r["vat_sewerage"]])
                    rows.append({k: r[k] for k in KEEP})
    return header, rows


def load_key(path):
    if path.exists():
        return dict(pd.read_csv(path, dtype=str)[["account", "household_id"]].values)
    return {}


def clean(df):
    df = df.sort_values(["household_id", "bill_month"]).drop_duplicates(["household_id", "bill_month"], keep="last")
    g = df.groupby("household_id")
    df["period_days"] = g["reading_date"].diff().dt.days
    df["reading_delta"] = g["reading"].diff()
    df["zero_units"] = (df["units"] == 0).astype(int)
    run_id = (df["zero_units"] != g["zero_units"].shift()).cumsum()
    run_len = df.groupby(["household_id", run_id])["zero_units"].transform("size")
    df["zero_run"] = ((df["zero_units"] == 1) & (run_len >= 3)).astype(int)
    df["code_flag"] = (df["c_code"] != "").astype(int)
    df["type_flag"] = ((df["b_type"] != "N") | (df["r_type"] != "N")).astype(int)
    df["units_mismatch"] = (df["reading_delta"].notna() & (df["reading_delta"] != df["units"])).astype(int)
    df["meter_reset"] = (df["reading_delta"] < 0).astype(int)
    df["odd_period"] = (df["period_days"].notna() & ((df["period_days"] < 20) | (df["period_days"] > 45))).astype(int)
    med = df[df["units"] > 0].groupby("household_id")["units"].median()
    df["household_median_units"] = df["household_id"].map(med)
    df["spike"] = ((df["units"] >= 2 * df["household_median_units"]) & (df["units"] >= 10)).astype(int)
    df["usable"] = (df["period_days"].notna() & (df["odd_period"] == 0) & (df["meter_reset"] == 0)
                    & (df["type_flag"] == 0) & (df["zero_run"] == 0)).astype(int)
    df["litres_per_day"] = np.where(df["usable"] == 1, df["units"] * 1000 / df["period_days"], np.nan).round(1)
    return df.drop(columns=["reading_delta"])


def summarise(df, households):
    rows = []
    for hh, d in df.groupby("household_id"):
        u = d[d["usable"] == 1]
        z = d["zero_units"].values
        longest = max((len(s) for s in "".join(map(str, z)).split("0") if s), default=0)
        rows.append({
            "household_id": hh, **households[hh],
            "months": len(d), "first_month": d["bill_month"].min(), "last_month": d["bill_month"].max(),
            "usable_months": len(u),
            "median_units_month": d.loc[d["units"] > 0, "units"].median(),
            "median_litres_per_day": u["litres_per_day"].median(),
            "mean_litres_per_day": round(u["litres_per_day"].mean(), 1),
            "p90_litres_per_day": u["litres_per_day"].quantile(0.9),
            "zero_months": int(z.sum()), "longest_zero_run": longest,
            "spikes": int(d["spike"].sum()), "code_months": int(d["code_flag"].sum()),
            "mismatch_months": int(d["units_mismatch"].sum()), "meter_resets": int(d["meter_reset"].sum()),
        })
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default=str(HERE.parent / "nwsdb_raw"))
    ap.add_argument("--out", default=str(HERE))
    ap.add_argument("--key", default=str(HERE / "private" / "household_key.csv"),
                    help="account → household id mapping (keep private; reused across runs)")
    a = ap.parse_args()
    out, key_path = Path(a.out), Path(a.key)
    key_path.parent.mkdir(parents=True, exist_ok=True)

    key = load_key(key_path)
    files = sorted(Path(a.raw).glob("*.pdf"))
    accounts, parsed, failed = [], [], []
    for f in files:
        try:
            h, rows = parse_pdf(f)
            if not rows:
                raise ValueError("no bill rows found")
            accounts.append(h["account"])
            parsed.append((h, rows))
        except Exception as e:                                    # keep going; report at the end
            failed.append((f.name, str(e)))

    # Random, stable ids: new accounts get the next free number in a random order.
    new = [acc for acc in dict.fromkeys(accounts) if acc not in key]
    order = sorted(new, key=lambda _: secrets.randbelow(1 << 30))
    used = {int(v[2:]) for v in key.values()}
    nxt = (max(used) if used else 0) + 1
    for acc in order:
        key[acc] = f"HH{nxt:03d}"
        nxt += 1
    pd.DataFrame(sorted(key.items(), key=lambda kv: kv[1]), columns=["account", "household_id"]).to_csv(key_path, index=False)

    records, households = [], {}
    for h, rows in parsed:
        hh = key[h["account"]]
        route = "/".join(h["account"].split("/")[:3])
        households[hh] = {"category": h["category"], "cycle": h["cycle"], "route": route}
        for r in rows:
            records.append({"household_id": hh, "route": route, "cycle": h["cycle"], **r})
    df = clean(pd.DataFrame(records))
    df["reading_date"] = df["reading_date"].dt.date
    cols = ["household_id", "route", "cycle", "bill_month", "reading_date", "period_days", "reading", "units",
            "litres_per_day", "water_charge", "service_charge", "vat_water", "sewerage_charge", "surcharge",
            "concession", "month_charge", "b_type", "r_type", "c_code", "zero_units", "zero_run", "code_flag",
            "type_flag", "units_mismatch", "meter_reset", "odd_period", "spike", "usable"]
    df[cols].to_csv(out / "nwsdb_monthly.csv", index=False)
    hs = summarise(df, households)
    hs.to_csv(out / "nwsdb_households.csv", index=False)

    # ── Summary ──
    u = df[df["usable"] == 1]
    print(f"PDFs: {len(files)}  parsed: {len(parsed)}  failed: {len(failed)}")
    for name, err in failed:
        print(f"  FAILED {name}: {err}")
    print(f"Households: {df['household_id'].nunique()}  bill-months: {len(df)}  usable: {len(u)} "
          f"({len(u) / len(df):.0%})  {df['bill_month'].min()} → {df['bill_month'].max()}")
    print("Flags (bill-months): " + ", ".join(f"{c} {int(df[c].sum())}" for c in
          ["zero_units", "zero_run", "code_flag", "type_flag", "units_mismatch", "meter_reset", "odd_period", "spike"]))
    print(f"Reading codes seen: {df.loc[df['c_code'] != '', 'c_code'].value_counts().to_dict()}  "
          f"bill/read types: {df.groupby(['b_type', 'r_type']).size().to_dict()}")
    q = u["litres_per_day"].quantile([0.1, 0.25, 0.5, 0.75, 0.9]).round(0)
    print(f"Litres/day per household-month (usable): p10 {q[0.1]:.0f}  p25 {q[0.25]:.0f}  median {q[0.5]:.0f}  "
          f"p75 {q[0.75]:.0f}  p90 {q[0.9]:.0f}")
    print(f"Households' median litres/day: median {hs['median_litres_per_day'].median():.0f}, "
          f"range {hs['median_litres_per_day'].min():.0f}–{hs['median_litres_per_day'].max():.0f}")
    print(f"Saved → {out / 'nwsdb_monthly.csv'}, {out / 'nwsdb_households.csv'}  (key: {key_path} — keep private)")


if __name__ == "__main__":
    main()
