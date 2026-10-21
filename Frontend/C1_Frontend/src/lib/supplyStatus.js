// Supply status for the household banner: is water ON, RESTRICTED or OFF, why, and the one action
// that fixes it. Mirrors the backend rules: the provider gate (adminValveState) is closed by a burst
// shut-off, an exhausted/expired prepaid plan or an unpaid postpaid bill, and throttled for a low
// balance or an overdue bill; the household tap (userValveState) can't be reopened while a leak
// alert is open (safety lock).
//
// Returns { tone: "ok" | "warn" | "off", title, detail, action, covers, dismissId } — `covers` lists the
// Home page notices ("low", "overdue", "alerts") the banner already explains, so they aren't shown
// twice; `dismissId` is the active alert the banner can dismiss (acknowledge) in their place.

const openStatuses = ["active", "acknowledged"];
const timeOf = (d) => new Date(d).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

export const supplyStatus = ({ device, mode, sub, bills = [], alerts = [] }) => {
    const postpaid = mode === "postpaid";
    const overdue = postpaid && bills.some((b) => b.status === "overdue");
    const planActive = sub && sub.status === "active";
    const openAlerts = alerts.filter((a) => openStatuses.includes(a.status));
    const shutOff = openAlerts.find((a) => a.autoAction === "valve-closed");
    const reduced = openAlerts.find((a) => a.autoAction === "valve-throttled"); // AI micro-leak response
    const unseen = openAlerts.filter((a) => a.status === "active"); // not yet dismissed
    const leak = unseen[0];
    const more = unseen.length > 1 ? ` (+${unseen.length - 1} more alert${unseen.length > 2 ? "s" : ""})` : "";
    const alertsLink = { label: "View alert", to: "/app/alerts" };

    if (device.adminValveState === "closed") {
        if (shutOff) {
            return {
                tone: "off",
                title: shutOff.type === "burst" ? "Water is OFF: burst detected" : "Water is OFF: leak detected",
                detail: `The supply was shut off automatically at ${timeOf(shutOff.startedAt || shutOff.createdAt)} to ${
                    shutOff.type === "burst" ? "prevent flooding" : "limit water loss"
                }. Check your pipes, mark the leak fixed, then ask your provider to restore the supply.`,
                action: alertsLink,
                covers: ["alerts"],
                dismissId: shutOff.status === "active" ? shutOff._id : null,
            };
        }
        if (!postpaid && !planActive) {
            return {
                tone: "off",
                title: "Water is OFF: no active plan",
                detail: sub?.status === "expired" ? "Your prepaid plan has expired." : "Your prepaid balance has run out.",
                action: { label: "Browse plans", to: "/app/plans" },
                covers: ["low"],
            };
        }
        if (overdue) {
            return {
                tone: "off",
                title: "Water is OFF: overdue bill",
                detail: "The supply was disconnected after the grace period. Paying the bill restores it.",
                action: { label: "Pay now", to: "/app/billing" },
                covers: ["overdue"],
            };
        }
        return { tone: "off", title: "Water is OFF", detail: "Your provider has closed the supply. Contact them to restore it.", action: null, covers: [] };
    }

    if (device.userValveState === "closed") {
        const open = openAlerts[0];
        return open
            ? {
                  tone: "off",
                  title: "Water is OFF: you turned it off",
                  detail: "A leak alert is still open. Mark the leak fixed before turning the water back on.",
                  action: alertsLink,
                  covers: ["alerts"],
                  dismissId: open.status === "active" ? open._id : null,
              }
            : { tone: "off", title: "Water is OFF: you turned it off", detail: "Turn it back on any time.", action: { label: "Turn water on", toggle: true }, covers: [] };
    }

    if (device.adminValveState === "throttled") {
        const pct = device.throttlePercent ?? 100;
        if (reduced) {
            return {
                tone: "warn",
                title: `Water is RESTRICTED to ${pct}%: leak detected`,
                detail: `The supply was reduced automatically at ${timeOf(reduced.startedAt || reduced.createdAt)} to limit water loss. Find and fix the leak, mark it fixed, then ask your provider to restore full flow.`,
                action: alertsLink,
                covers: ["alerts"],
                dismissId: reduced.status === "active" ? reduced._id : null,
            };
        }
        if (overdue) {
            return { tone: "warn", title: `Water is RESTRICTED to ${pct}%`, detail: "You have an overdue bill.", action: { label: "Pay now", to: "/app/billing" }, covers: ["overdue"] };
        }
        if (!postpaid && planActive) {
            return {
                tone: "warn",
                title: `Water is RESTRICTED to ${pct}%`,
                detail: `Your balance is low (${Math.round(sub.volumeRemaining)} L left). Top up to restore full flow.`,
                action: { label: "Top up", to: "/app/plans" },
                covers: ["low"],
            };
        }
        return { tone: "warn", title: `Water is RESTRICTED to ${pct}%`, detail: "Your provider has reduced the supply.", action: null, covers: [] };
    }

    if (leak) {
        return {
            tone: "warn",
            title: `Water is ON: possible ${leak.type === "burst" ? "burst" : "leak"}`,
            detail: `${leak.message ? `${leak.message} ` : ""}Check taps, toilets and pipes, and turn the water off if you find a leak.${more}`,
            action: alertsLink,
            covers: ["alerts"],
            dismissId: leak._id,
        };
    }

    return {
        tone: "ok",
        title: "Water is ON",
        detail: !postpaid && planActive ? `Supply normal · ${Math.round(sub.volumeRemaining)} L left on your plan` : "Supply normal",
        action: null,
        covers: [],
    };
};
