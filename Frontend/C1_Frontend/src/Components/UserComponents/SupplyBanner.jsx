import { Link } from "react-router-dom";
import { FiCheckCircle, FiAlertTriangle, FiXOctagon, FiWifiOff, FiLoader } from "react-icons/fi";

const tones = {
    ok: {
        box: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
        Icon: FiCheckCircle,
        icon: "text-emerald-600 dark:text-emerald-400",
    },
    warn: {
        box: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
        Icon: FiAlertTriangle,
        icon: "text-amber-600 dark:text-amber-400",
    },
    off: {
        box: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
        Icon: FiXOctagon,
        icon: "text-red-600 dark:text-red-400",
    },
};
const button =
    "shrink-0 rounded-md text-center bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-black/5 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-white dark:ring-white/10 dark:hover:bg-slate-800";

const since = (d) => {
    if (!d) return "a while";
    const m = Math.round((Date.now() - new Date(d)) / 60000);
    return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};

/* Supply status banner: ON / RESTRICTED / OFF, the reason and the one action that fixes it.
   `status` comes from lib/supplyStatus.js; `onToggle` turns the household tap back on and `onDismiss`
   acknowledges the alert the banner is showing. */
const SupplyBanner = ({ status, device, onToggle, onDismiss, dismissing = false }) => {
    const { box, Icon, icon } = tones[status.tone];
    const a = status.action;
    return (
        <div role="status" className={`mt-5 flex flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center ${box}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
                <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${icon}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold sm:text-base">{status.title}</p>
                    <p className="mt-0.5 text-sm opacity-90">{status.detail}</p>
                    {device.status === "offline" && (
                        <p className="mt-1 inline-flex items-center gap-1.5 text-xs opacity-80">
                            <FiWifiOff className="h-3.5 w-3.5" /> Meter offline for {since(device.lastSeen)}; this is the last known state.
                        </p>
                    )}
                </div>
            </div>
            {status.dismissId && onDismiss && (
                <button
                    type="button"
                    onClick={() => onDismiss(status.dismissId)}
                    disabled={dismissing}
                    className="inline-flex shrink-0 items-center justify-center gap-1 text-sm font-medium underline hover:no-underline disabled:opacity-50"
                >
                    {dismissing && <FiLoader className="h-3.5 w-3.5 animate-spin" />}
                    Dismiss
                </button>
            )}
            {a?.to && (
                <Link to={a.to} className={button}>
                    {a.label}
                </Link>
            )}
            {a?.toggle && (
                <button type="button" onClick={onToggle} className={button}>
                    {a.label}
                </button>
            )}
        </div>
    );
};

export default SupplyBanner;
