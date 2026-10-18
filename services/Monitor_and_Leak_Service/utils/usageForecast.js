// Usage-forecast helpers: turn the model's per-day litres into a prepaid run-out date and a
// postpaid bill estimate. Pure functions (no database) so they can be tested on their own.
//
// A forecast is a list of days starting TODAY: [{ litres, low, high }, ...] (7 days). Beyond that
// the mean of the 7 days is used as a flat daily rate. `low`/`high` are the model's 80 % range.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const CYCLE_DAYS = 30; // postpaid cycles are closed by an admin, so a 30-day cycle is assumed
const MAX_DAYS = 365;

// "YYYY-MM-DD" of `date` in `timeZone`.
export const localDayKey = (date, timeZone) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// Fraction of the local day still ahead of `now` (0..1).
export const fractionOfDayLeft = (now, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
        .formatToParts(now)
        .reduce((o, p) => ({ ...o, [p.type]: Number(p.value) }), {});
    return 1 - (parts.hour * 3600 + parts.minute * 60 + parts.second) / 86400;
};

const series = (forecast, key) => forecast.map((d) => Math.max(0, d[key]));
const meanOf = (a) => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);

// Days from `now` until `balance` litres are used up, at the daily litres in `perDay`
// (perDay[0] = today, of which `usedToday` is already gone from the balance).
export const daysUntilEmpty = (balance, perDay, usedToday, fracLeft) => {
    if (balance <= 0) return 0;
    const rate = meanOf(perDay);
    const restToday = Math.max(0, perDay[0] - usedToday);
    let left = balance;
    let t = 0;
    if (restToday > 0) {
        if (left <= restToday) return (left / restToday) * fracLeft;
        left -= restToday;
    }
    t += fracLeft;
    for (let i = 1; i < perDay.length; i++) {
        if (perDay[i] > 0 && left <= perDay[i]) return t + left / perDay[i];
        left -= perDay[i];
        t += 1;
    }
    if (rate <= 0) return MAX_DAYS;
    return Math.min(MAX_DAYS, t + left / rate);
};

// Prepaid: when does the balance run out? `earliest` assumes the model's high usage, `latest` its low.
export const buildRunOut = ({ balance, expiresAt, forecast, usedToday, now, timeZone }) => {
    const frac = fractionOfDayLeft(now, timeZone);
    const at = (days) => new Date(now.getTime() + days * DAY_MS);
    const mid = daysUntilEmpty(balance, series(forecast, "litres"), usedToday, frac);
    const early = daysUntilEmpty(balance, series(forecast, "high"), usedToday, frac);
    const late = daysUntilEmpty(balance, series(forecast, "low"), usedToday, frac);
    let date = at(mid);
    let limitedBy = "volume";
    if (expiresAt && new Date(expiresAt) < date) {
        date = new Date(expiresAt);
        limitedBy = "expiry";
    }
    return {
        balanceLitres: +balance.toFixed(2),
        daysLeft: +Math.max(0, (date - now) / DAY_MS).toFixed(1),
        date,
        earliest: at(early),
        latest: at(late),
        limitedBy,
        expiresAt: expiresAt || null,
    };
};

// Litres expected between `now` and the end of a cycle that ends in `daysLeft` days.
const litresUntil = (perDay, usedToday, fracLeft, daysLeft) => {
    if (daysLeft <= 0) return 0;
    const rate = meanOf(perDay);
    const restToday = Math.max(0, perDay[0] - usedToday);
    let total = restToday * Math.min(1, daysLeft / Math.max(fracLeft, 1e-6));
    let remaining = daysLeft - fracLeft;
    for (let i = 1; remaining > 0 && i < MAX_DAYS; i++) {
        const litres = i < perDay.length ? perDay[i] : rate;
        total += litres * Math.min(1, remaining);
        remaining -= 1;
    }
    return total;
};

// Postpaid: projected volume and bill at the end of the (assumed 30-day) cycle.
export const buildBillEstimate = ({ volumeUsed, periodStart, forecast, usedToday, now, timeZone, tariff, computeBill, cycleDays = CYCLE_DAYS }) => {
    const frac = fractionOfDayLeft(now, timeZone);
    const cycleEnd = new Date(new Date(periodStart).getTime() + cycleDays * DAY_MS);
    const daysLeft = Math.max(0, (cycleEnd - now) / DAY_MS);
    const project = (key) => volumeUsed + litresUntil(series(forecast, key), usedToday, frac, daysLeft);
    const litres = { low: project("low"), mid: project("litres"), high: project("high") };
    const bill = (l) => computeBill(l, tariff);
    const mid = bill(litres.mid);
    return {
        cycleStart: periodStart,
        cycleEnd,
        daysLeftInCycle: +daysLeft.toFixed(1),
        volumeUsedSoFar: +volumeUsed.toFixed(1),
        projectedLitres: { low: +litres.low.toFixed(1), mid: +litres.mid.toFixed(1), high: +litres.high.toFixed(1) },
        amount: { low: bill(litres.low).amount, mid: mid.amount, high: bill(litres.high).amount },
        breakdown: mid.breakdown,
        fixedCharge: mid.fixedCharge,
        assumedCycleDays: cycleDays,
    };
};
