// Daily-goal helpers: progress against the forecast, streaks and simple usage tips.
// Pure functions (no database) so they can be tested on their own. Tips are plain rules over
// numbers the system already has — no model — and are worded as observations, not facts.

export const NEAR_RATIO = 0.9; // expected use within 10 % of the goal counts as "at risk"

// Default goal: a bit below what the household usually uses, rounded to 5 L.
export const suggestGoal = (dailyLitres) => {
    const v = [...dailyLitres].sort((a, b) => a - b);
    if (v.length < 3) return null;
    const mid = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    return Math.max(10, Math.round((mid * 0.9) / 5) * 5);
};

// Where today is heading. expectedToday = used so far + what the forecast says is still to come
// (the forecast's whole-day figure minus what has been used, never below zero).
export const todayProgress = ({ goal, usedToday, forecastToday }) => {
    const expected = forecastToday == null ? null : Math.max(usedToday, forecastToday);
    let state = "unknown";
    if (usedToday > goal) state = "over";
    else if (expected != null) state = expected > goal ? "over" : expected > goal * NEAR_RATIO ? "at_risk" : "on_track";
    return { goal, usedToday, expectedToday: expected, usedPct: Math.min(100, (usedToday / goal) * 100), state };
};

// Each forecast day against the goal: under / near / over.
export const weekOutlook = (forecast, goal) =>
    forecast.map((f) => ({ day: f.day, litres: f.litres, low: f.low, high: f.high, status: f.litres > goal ? "over" : f.litres > goal * NEAR_RATIO ? "near" : "under" }));

// completed = [{ day: "YYYY-MM-DD", litres }] oldest -> newest, only days that have data.
// streak = consecutive most-recent days at or under the goal; underLast7 = such days among the last 7.
export const streaks = (completed, goal) => {
    let streak = 0;
    for (let i = completed.length - 1; i >= 0 && completed[i].litres <= goal; i--) streak++;
    const last7 = completed.slice(-7);
    return { streak, underLast7: last7.filter((d) => d.litres <= goal).length, daysCounted: last7.length };
};

const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? "am" : "pm"}`;

// hourly = 24 numbers: average litres used in each LOCAL hour of the day over the recent days.
export const peakWindow = (hourly, span = 3) => {
    const total = hourly.reduce((s, v) => s + v, 0);
    if (total <= 0) return null;
    let best = { start: 0, litres: -1 };
    for (let s = 0; s < 24; s++) {
        let l = 0;
        for (let k = 0; k < span; k++) l += hourly[(s + k) % 24];
        if (l > best.litres) best = { start: s, litres: l };
    }
    return { start: best.start, end: (best.start + span) % 24, share: best.litres / total };
};

// Up to three ranked tips. Inputs are all optional; a rule is skipped when its input is missing.
//   hourly        24 avg litres per local hour    completed  recent complete days [{ day, litres }]
//   dow           (day string) -> 0..6 weekday     forecast   [{ day, litres, tmax?, holiday? }] starting today
//   goal / expectedToday / usedToday
export const buildTips = ({ hourly, completed = [], dow, forecast = [], goal, expectedToday, usedToday }) => {
    const tips = [];

    if (hourly) {
        const nightLitres = hourly[1] + hourly[2] + hourly[3];
        if (nightLitres > 10)
            tips.push({ priority: 1, kind: "night-flow", text: `Water is being used overnight (about ${nightLitres.toFixed(0)} L between 1 and 4 am on average). A dripping tap or leaking cistern could be the cause — worth a check.` });
        const pk = peakWindow(hourly);
        if (pk && pk.share >= 0.4)
            tips.push({ priority: 3, kind: "peak", text: `${Math.round(pk.share * 100)}% of your water is used between ${hourLabel(pk.start)} and ${hourLabel(pk.end)}. Spreading some tasks (like laundry) outside that window would flatten your use.` });
    }

    if (goal && expectedToday != null && expectedToday > goal)
        tips.push({ priority: 0, kind: "today", text: `Today is heading for about ${expectedToday.toFixed(0)} L, over your ${goal} L goal (${usedToday.toFixed(0)} L used so far).` });

    const over = forecast.filter((f, i) => i > 0 && goal && f.litres > goal);
    if (over.length)
        tips.push({ priority: 2, kind: "week", text: `${over.length === 1 ? "One day" : `${over.length} days`} this week ${over.length === 1 ? "is" : "are"} forecast above your goal (${over.slice(0, 3).map((f) => new Date(`${f.day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" })).join(", ")}). Planning laundry or watering for a lighter day can help.` });

    if (dow && completed.length >= 7) {
        const wk = completed.filter((d) => dow(d.day) >= 1 && dow(d.day) <= 5).map((d) => d.litres);
        const we = completed.filter((d) => dow(d.day) === 0 || dow(d.day) === 6).map((d) => d.litres);
        const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
        if (wk.length >= 4 && we.length >= 2 && avg(we) > avg(wk) * 1.2)
            tips.push({ priority: 4, kind: "weekend", text: `Weekends average ${Math.round((avg(we) / avg(wk) - 1) * 100)}% more water than weekdays (${avg(we).toFixed(0)} L against ${avg(wk).toFixed(0)} L).` });
    }

    const hot = forecast.find((f) => f.tmax != null && f.tmax >= 32);
    if (hot) tips.push({ priority: 5, kind: "heat", text: "Hot weather is forecast — water use usually rises on very hot days." });

    return tips.sort((a, b) => a.priority - b.priority).slice(0, 3).map(({ kind, text }) => ({ kind, text }));
};
