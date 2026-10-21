import { useState, useEffect, useCallback } from "react";
import { FiCheck } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";
import PlanCard from "../../Components/UserComponents/PlanCard.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";

const statusStyles = {
    active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    exhausted: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    expired: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const Plans = () => {
    const { device, sub, loading, refresh } = useMyWater();
    const toast = useToast();
    const [packages, setPackages] = useState([]);
    const [history, setHistory] = useState([]);
    const [buyingId, setBuyingId] = useState(null);
    const [extraLoading, setExtraLoading] = useState(true);

    // `silent` skips the full-page loader (used after a purchase refresh).
    // Depends on the device *id*, not the device object — MyWaterContext hands
    // back a brand-new object on every refresh even when nothing changed, so
    // depending on the object itself would silently re-run this on every one
    // of those refreshes (e.g. the 60s fallback poll).
    const deviceId = device?._id;
    const loadExtra = useCallback(async (silent = false) => {
        if (!deviceId) {
            setExtraLoading(false);
            return;
        }
        if (!silent) setExtraLoading(true);
        try {
            const [pkgs, subs] = await Promise.all([
                apiFetch("/api/water-packages?active=true").catch(() => ({ packages: [] })),
                apiFetch(`/api/subscriptions?device=${deviceId}`).catch(() => ({ subscriptions: [] })),
            ]);
            setPackages(pkgs.packages || []);
            setHistory(subs.subscriptions || []);
        } finally {
            if (!silent) setExtraLoading(false);
        }
    }, [deviceId]);

    useEffect(() => {
        loadExtra();
    }, [loadExtra]);

    const active = sub && sub.status === "active";

    // Highlight the plan with the lowest price-per-litre as "Best value".
    const bestValueId =
        packages.length > 1
            ? packages.reduce((best, p) => {
                  const pv = p.volumeLiters ? p.price / p.volumeLiters : Infinity;
                  const bv = best.volumeLiters ? best.price / best.volumeLiters : Infinity;
                  return pv < bv ? p : best;
              }, packages[0])._id
            : null;

    const purchase = async (packageId) => {
        setBuyingId(packageId);
        try {
            await apiFetch("/api/subscriptions", { method: "POST", body: { deviceId: device.deviceId, packageId } });
            await refresh();
            await loadExtra(true);
            toast.success("Plan activated. Your water is on!");
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBuyingId(null);
        }
    };

    if (loading) return <WaterLoader center />;
    if (!device) return <NoDevice />;
    if (extraLoading) return <WaterLoader center />;

    return (
        <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Plans</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Buy or renew your prepaid water plan.</p>

            {/* Current plan */}
            {active && (
                <div className="mt-5 rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Current plan</span>
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">Active</span>
                    </div>
                    <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{sub.package?.name || "Plan"}</p>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(1, sub.volumeRemaining / sub.volumeTotal)) * 100}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{sub.volumeRemaining.toFixed(0)} / {sub.volumeTotal.toLocaleString()} L left</span>
                        {sub.expiresAt && <span>Until {new Date(sub.expiresAt).toLocaleDateString()}</span>}
                    </div>
                </div>
            )}

            {/* Available plans */}
            <div className="mt-6">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{active ? "Other plans" : "Choose a plan"}</h2>
                {active && (
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        You already have an active plan — you can buy a new one once it ends.
                    </p>
                )}
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {packages.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No plans available right now.</p>
                    ) : (
                        packages.map((pkg) => (
                            <PlanCard
                                key={pkg._id}
                                pkg={pkg}
                                disabled={active}
                                buying={buyingId === pkg._id}
                                highlight={pkg._id === bestValueId}
                                onBuy={() => purchase(pkg._id)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* History */}
            {history.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">History</h2>
                    <div className="mt-3 overflow-hidden rounded-sm border border-slate-200 dark:border-slate-800">
                        {history.map((h) => (
                            <div
                                key={h._id}
                                className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 last:border-0 dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{h.package?.name || "Plan"}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {new Date(h.createdAt).toLocaleDateString()} · Rs. {h.price?.toLocaleString()}
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[h.status]}`}>
                                    {h.status === "active" && <FiCheck className="mr-0.5 inline h-3 w-3" />}
                                    {h.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Plans;
