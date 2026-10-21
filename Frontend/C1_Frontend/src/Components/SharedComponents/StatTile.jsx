// Shared summary stat tile — label + icon chip + headline value. Used across
// admin/user list pages (Alerts, Billing, Subscriptions, Users) so headline
// numbers stay visually consistent instead of drifting per-page.
const tones = {
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
};

const StatTile = ({ label, value, icon: Icon, tone }) => (
    <div className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
);

export default StatTile;
