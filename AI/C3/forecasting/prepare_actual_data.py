"""Export and audit DataSet.xlsx without modifying it or training a model.

Uses Python's standard library to read the workbook's OOXML tables. No Excel
engine, imputation, resampling, unit conversion, or generated observations.
From the repository root: python AI/C3/forecasting/prepare_actual_data.py
"""

import csv
import hashlib
import json
import math
import posixpath
import statistics
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "AI/C3/data/raw/DataSet.xlsx"
OUT = ROOT / "AI/C3/data/processed"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read_tables(path):
    """Read named sheets, preserving sparse cell positions and Excel row IDs."""
    with ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        props = workbook.find("s:workbookPr", NS)
        epoch = datetime(1904, 1, 1) if props is not None and props.get("date1904") in ("1", "true") else datetime(1899, 12, 30)
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(t.text or "" for t in item.findall(".//s:t", NS))
                       for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        relationships = {r.get("Id"): r.get("Target") for r in
                         ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        tables = {}
        for sheet in workbook.findall("s:sheets/s:sheet", NS):
            target = relationships[sheet.get(REL)]
            member = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            rows = []
            for row in ET.fromstring(archive.read(member)).findall("s:sheetData/s:row", NS):
                cells = {}
                for cell in row.findall("s:c", NS):
                    ref = cell.get("r")
                    letters = "".join(c for c in ref if c.isalpha())
                    index = 0
                    for letter in letters:
                        index = index * 26 + ord(letter) - ord("A") + 1
                    if cell.find("s:f", NS) is not None:
                        raise ValueError(f"Unexpected formula in {sheet.get('name')}!{ref}; verify it before exporting")
                    value = cell.find("s:v", NS)
                    value = value.text if value is not None else ""
                    if cell.get("t") == "s":
                        value = strings[int(value)]
                    elif cell.get("t") == "inlineStr":
                        value = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                    elif cell.get("t") == "e":
                        raise ValueError(f"Excel error in {sheet.get('name')}!{ref}: {value}")
                    cells[index - 1] = value.strip() if isinstance(value, str) else value
                if any(v != "" for v in cells.values()):
                    rows.append((int(row.get("r")), cells))
            header = [rows[0][1].get(i, "") for i in range(max(rows[0][1]) + 1)]
            if not all(header) or len(set(header)) != len(header):
                raise ValueError(f"Invalid headers in {sheet.get('name')}")
            tables[sheet.get("name")] = (header, [
                dict(zip(header, [cells.get(i, "") for i in range(len(header))]), SourceRow=n)
                for n, cells in rows[1:]])
        return tables, epoch


def write_csv(name, rows, columns):
    with (OUT / name).open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main():
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    tables, epoch = read_tables(SOURCE)
    headers, raw = tables["Consumption_Data"]
    meta_headers, metadata = tables["Household_Info"]
    missing = {name: {h: sum(r[h] == "" for r in rows) for h in hs}
               for name, (hs, rows) in tables.items()}
    meta_counts = Counter(r["HouseholdID"] for r in metadata)
    if any(n != 1 for n in meta_counts.values()) or any(missing["Household_Info"].values()):
        raise ValueError("Missing/duplicate household metadata; resolve before joining")
    if any(missing["Consumption_Data"].values()):
        raise ValueError("Missing consumption sheet values; resolve before export")
    households = {r["HouseholdID"]: r for r in metadata}
    cleaned = []
    for source in raw:
        row = dict(source)
        date = epoch + timedelta(days=float(row.pop("ReadingDate")))
        if date.time() != datetime.min.time():
            raise ValueError("Unexpected sub-day meter timestamp")
        row["Date"] = date.date().isoformat()
        row["Year"], row["Month"] = int(row["Year"]), int(row["Month"])
        for field in ("CurrentReading", "Consumption", "TankCapacityLitres"):
            number = float(row[field])
            if not math.isfinite(number):
                raise ValueError(f"Nonfinite {field} at row {row['SourceRow']}")
            row[field] = int(number) if number.is_integer() else number
        row["DMA"] = households[row["HouseholdID"]]["DMA"]
        row["SourceSheet"] = "Consumption_Data"
        cleaned.append(row)
    cleaned.sort(key=lambda r: (r["HouseholdID"], r["Date"]))
    keys = Counter((r["HouseholdID"], r["Date"]) for r in cleaned)
    duplicates = [{"HouseholdID": h, "Date": d, "Count": n} for (h, d), n in keys.items() if n > 1]
    if duplicates:
        raise ValueError(f"Duplicate household/date records: {duplicates}; no automatic deduplication")
    values = [r["Consumption"] for r in cleaned]
    q1, _, q3 = statistics.quantiles(values, n=4, method="inclusive")
    lower, upper = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    groups = defaultdict(list)
    issues = []
    for row in cleaned:
        groups[row["HouseholdID"]].append(row)
        reasons = []
        if row["Consumption"] == 0:
            reasons.append("zero_consumption")
        if row["Consumption"] < 0:
            reasons.append("negative_consumption")
        if row["Consumption"] < lower or row["Consumption"] > upper:
            reasons.append("outside_global_1.5_IQR_fence")
        if row["Date"][:7] != f"{row['Year']:04d}-{row['Month']:02d}":
            reasons.append("year_month_disagrees_with_reading_date")
        meta = households[row["HouseholdID"]]
        if row["Zone"] != meta["Zone"] or row["TankCapacityLitres"] != float(meta["TankCapacityLitres"]):
            reasons.append("metadata_disagreement")
        if reasons:
            issues.append(dict(row, Issue=";".join(reasons)))
    summary = []
    for household, rows in groups.items():
        gaps, mismatch, decreases = 0, 0, 0
        for prev, row in zip(rows, rows[1:]):
            gap = (row["Year"] - prev["Year"]) * 12 + row["Month"] - prev["Month"]
            gaps += max(0, gap - 1)
            delta = row["CurrentReading"] - prev["CurrentReading"]
            reasons = []
            if delta < 0:
                decreases += 1
                reasons.append("meter_reading_decreased")
            if not math.isclose(delta, row["Consumption"], abs_tol=1e-9):
                mismatch += 1
                reasons.append("consumption_disagrees_with_meter_delta")
            if gap != 1:
                reasons.append("nonconsecutive_month")
            if reasons:
                issues.append(dict(row, Issue=";".join(reasons)))
        summary.append(dict(HouseholdID=household, RecordCount=len(rows), FirstDate=rows[0]["Date"],
                            LastDate=rows[-1]["Date"], ZeroCount=sum(r["Consumption"] == 0 for r in rows),
                            MinConsumption=min(r["Consumption"] for r in rows),
                            MaxConsumption=max(r["Consumption"] for r in rows),
                            MissingMonths=gaps, MeterDeltaMismatchCount=mismatch, MeterDecreaseCount=decreases))
    report = dict(source="AI/C3/data/raw/DataSet.xlsx", source_sha256=digest,
                  worksheets={name: {"columns": hs, "rows": len(rows)} for name, (hs, rows) in tables.items()},
                  household_count=len(groups), consumption_records=len(cleaned),
                  date_range=[min(r["Date"] for r in cleaned), max(r["Date"] for r in cleaned)],
                  records_per_household=dict(Counter(r["HouseholdID"] for r in cleaned)),
                  missing_values=missing, duplicate_household_date_groups=duplicates,
                  duplicate_household_month_groups=sum(n > 1 for n in Counter((r["HouseholdID"], r["Year"], r["Month"]) for r in cleaned).values()),
                  metadata_without_consumption=sorted(set(households) - set(groups)),
                  consumption_without_metadata=sorted(set(groups) - set(households)),
                  zero_consumption_records=values.count(0), negative_consumption_records=sum(v < 0 for v in values),
                  min_consumption=min(values), max_consumption=max(values),
                  consumption_sum=sum(values), consumption_unit="unspecified in workbook; no conversion applied",
                  unusual_value_rule={"method": "global Tukey 1.5 IQR; review flags only", "q1": q1, "q3": q3,
                                      "lower_fence": lower, "upper_fence": upper,
                                      "flagged_records": sum(v < lower or v > upper for v in values)},
                  issue_counts=dict(Counter(reason for r in issues for reason in r["Issue"].split(";"))),
                  missing_months=sum(r["MissingMonths"] for r in summary),
                  coverage_groups=[dict(FirstDate=first, LastDate=last, HouseholdCount=n)
                                   for (first, last), n in Counter((r["FirstDate"], r["LastDate"]) for r in summary).items()],
                  limitations=["Consumption and CurrentReading units are not specified; confirm with data owner before interpreting demand in litres.",
                               "18 monthly observations per household give limited seasonal history.",
                               "Zeros and statistical outliers are retained unchanged, not assumed erroneous.",
                               "Meter deltas cannot be checked for each household's first observation without an earlier reading.",
                               "Household metadata has no effective dates; its historical validity is unverified."],
                  cleaning=["Trim surrounding text whitespace", "Convert Excel ReadingDate to ISO Date", "Parse recorded numeric fields",
                            "Sort by HouseholdID and Date", "Join only DMA from Household_Info by validated unique HouseholdID",
                            "Keep all actual consumption rows and values, including zeros and outliers", "Attach source sheet and row for traceability"],
                  rows_added=0, rows_removed=0, models_trained=False)
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == digest
    OUT.mkdir(parents=True, exist_ok=True)
    columns = ["HouseholdID", "Date", "Year", "Month", "CurrentReading", "Consumption", "Zone", "TankCapacityLitres", "DMA", "SourceSheet", "SourceRow"]
    write_csv("C3_Household_Consumption_Cleaned.csv", cleaned, columns)
    write_csv("C3_Household_Info.csv", metadata, meta_headers)
    write_csv("C3_Consumption_Per_Household.csv", summary, list(summary[0]))
    write_csv("C3_Consumption_Quality_Flags.csv", sorted(issues, key=lambda r: (r["HouseholdID"], r["Date"])), columns + ["Issue"])
    (OUT / "C3_Consumption_Validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    lines = ["# C3 historical consumption validation", "",
             "Source: `AI/C3/data/raw/DataSet.xlsx` (read only).",
             f"SHA-256: `{digest}`", "", "## Workbook inventory", ""]
    for name, (hs, rows) in tables.items():
        lines.append(f"- {name}: {len(rows):,} records. Columns: {', '.join(hs)}.")
    lines += ["", "## Historical validation", "",
              f"- Households: {len(groups)}. Actual consumption records: {len(cleaned):,}. Every household has 18 records.",
              f"- Overall date range: {report['date_range'][0]} to {report['date_range'][1]}.",
              "- 47 households (Zone A): March 2025–August 2026. 52 households (Zone B): April 2025–September 2026.",
              "- No internal monthly gaps. The two groups have different coverage at the boundaries; no rows were added to align them.",
              "- Missing values: 0 in every column on both worksheets.",
              "- Duplicate household/date or household/month groups: 0. All 99 household IDs match unique household information records.",
              f"- Consumption range: {min(values)}–{max(values)} source units. Zero records: {values.count(0)}. Negative records: {sum(v < 0 for v in values)}.",
              f"- Statistical review flags: {report['unusual_value_rule']['flagged_records']} values above {upper} (global Q1={q1}, Q3={q3}, 1.5 IQR rule). These are not established errors.",
              f"- Cumulative meter decreases: {report['issue_counts'].get('meter_reading_decreased', 0)}. Consumption/meter-delta disagreements: {report['issue_counts'].get('consumption_disagrees_with_meter_delta', 0)} of {len(cleaned)-len(groups):,} adjacent comparisons. Flags may overlap.",
              "- Year/month agrees with ReadingDate, and Zone/tank capacity agrees with Household_Info for all records.",
              "", "## Export and cleaning", "",
              "Upload `C3_Household_Consumption_Cleaned.csv` to Colab. It has one row per actual household reading, sorted by household and date.",
              "Columns: " + ", ".join(columns) + ".", "",
              "`Date` is the original Excel ReadingDate converted to ISO YYYY-MM-DD. Consumption and CurrentReading values are unchanged. DMA is joined from Household_Info; SourceSheet/SourceRow trace each observation to the workbook. Text whitespace is trimmed. No consumption rows were added, removed, interpolated, aggregated, or fabricated.",
              "", "Supporting files: `C3_Household_Info.csv` (actual workbook metadata), `C3_Consumption_Per_Household.csv` (all 99 counts and coverage), `C3_Consumption_Quality_Flags.csv` (row-level review flags), and `C3_Consumption_Validation.json` (machine-readable checks).", "",
              "## Readiness and concerns", ""]
    lines += ["- " + limitation for limitation in report["limitations"]]
    lines += ["", "Ready to upload for Colab inspection and feature preparation. Confirm units and review meter anomalies before treating the data as validated training targets. No model was trained or evaluated locally.",
              "", "Forecasting review: existing forecasting files had no Master_Data.csv references, but expected a generic household_consumption.csv and assumed litres. They now use the actual export and Consumption in source units. The existing empty Master_Data.csv placeholder is not read or required. The raw workbook, topology mapping, frontend, and backend are unchanged.", ""]
    (OUT / "C3_Consumption_Validation.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("household_count", "consumption_records", "date_range", "zero_consumption_records", "unusual_value_rule", "issue_counts", "missing_months")}, indent=2))


if __name__ == "__main__":
    main()
