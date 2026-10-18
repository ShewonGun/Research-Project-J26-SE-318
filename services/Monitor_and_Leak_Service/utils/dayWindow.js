// Calendar-day helpers for usage totals.
//
// Readings are stored as UTC instants. To show "today" / "Mon" / "Tue" the way a
// household experiences them, usage is grouped by LOCAL day in the caller's time
// zone (the browser sends its IANA zone as ?tz=Asia/Colombo). No/invalid zone →
// "UTC", which is exactly how totals were grouped before.

export const resolveTimeZone = (tz) => {
    if (!tz || typeof tz !== "string") return "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return tz;
    } catch {
        return "UTC";
    }
};

const dayFmt = (timeZone) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }); // → YYYY-MM-DD

// The window "today and the previous (days-1) calendar days" in `timeZone`:
//   startKey — first local day in the window, as YYYY-MM-DD
//   since    — a safe UTC lower bound for the timestamp index (one day of slack;
//              rows before startKey are dropped by the day filter afterwards)
export const dayWindow = (timeZone, days) => {
    const [y, m, d] = dayFmt(timeZone).format(new Date()).split("-").map(Number);
    const startKey = new Date(Date.UTC(y, m - 1, d - (days - 1))).toISOString().slice(0, 10);
    const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
    return { startKey, since };
};
