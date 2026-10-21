// "YYYY-MM-DD" for a date in the BROWSER's local time zone. Usage totals from the
// API are grouped by local day (api.js sends this browser's time zone), so charts
// must look their days up with local keys too — `toISOString()` is UTC and would
// put early-morning readings on the wrong day.
export const dayKey = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

export const browserTimeZone = () => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
};
