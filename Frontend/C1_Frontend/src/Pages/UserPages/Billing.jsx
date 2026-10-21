import { useEffect, useState } from "react";
import { FiFileText, FiTrendingUp, FiLayers, FiAlertTriangle, FiCheckCircle, FiCalendar, FiInfo } from "react-icons/fi";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import { apiFetch } from "../../lib/api.js";
import { browserTimeZone } from "../../lib/dayKey.js";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const units = (litres) => (Number(litres || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = 30; // matches the backend's assumed cycle for estimates

const PARTS = [
    { key: "usageCharge", label: "Water charge", dot: "bg-sky-500" },
    { key: "fixedCharge", label: "Service charge", dot: "bg-indigo-400" },
    { key: "vat", label: "VAT", dot: "bg-slate-400" },
];

const statusStyles = {
    unpaid: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    overdue: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};

const Card = ({ children, className = "" }) => (
    <div className={`rounded-sm border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}>{children}</div>
);

const SectionTitle = ({ icon: Icon, children, right }) => (
    <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                <Icon className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{children}</h2>
        </div>
        {right}
    </div>
);

/* Postpaid billing: this cycle (so far + predicted at the end), what the bill is made of,
   amounts due and paid bills. Prepaid connections are pointed to the Plans tab. */
const Billing = () => {
    const { device, mode, bill, estimate, bills, loading, payBill } = useMyWater();
    const toast = useToast();
    const [payingId, setPayingId] = useState(null);
    const [prediction, setPrediction] = useState(undefined); // undefined = loading, null = unavailable

    const deviceId = device?._id;
    const postpaid = mode === "postpaid";
    useEffect(() => {
        if (!deviceId || !postpaid) return;
        let cancelled = false;
        setPrediction(undefined);
        apiFetch(`/api/forecast?device=${deviceId}&tz=${encodeURIComponent(browserTimeZone())}`)
            .then((d) => !cancelled && setPrediction(d?.available && d.billEstimate ? d.billEstimate : null))
            .catch(() => !cancelled && setPrediction(null));
        return () => {
            cancelled = true;
        };
    }, [deviceId, postpaid, bill?._id]);

    if (loading) return <WaterLoader center />;
    if (!device) return <NoDevice />;

    if (!postpaid) {
        return (
            <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">Billing</h1>
                <Card className="mt-5 p-5 text-sm text-slate-500 dark:text-slate-400">
                    Your connection is <span className="font-medium text-slate-700 dark:text-slate-300">prepaid</span>: you top up in advance. Manage it on
                    the <span className="font-medium">Plans</span> tab.
                </Card>
            </div>
        );
    }

    const outstanding = bills.filter((b) => b.status === "unpaid" || b.status === "overdue");
    const past = bills.filter((b) => b.status === "paid");
    const totalDue = outstanding.reduce((s, b) => s + (b.amount || 0), 0);

    const start = bill?.periodStart ? new Date(bill.periodStart) : null;
    const end = prediction?.cycleEnd ? new Date(prediction.cycleEnd) : start ? new Date(start.getTime() + CYCLE_DAYS * DAY_MS) : null;
    const dayOfCycle = start ? Math.min(CYCLE_DAYS, Math.max(1, Math.ceil((Date.now() - start) / DAY_MS))) : null;
    const cyclePct = dayOfCycle ? (100 * dayOfCycle) / CYCLE_DAYS : 0;

    const partsTotal = PARTS.reduce((s, p) => s + (estimate?.[p.key] || 0), 0);
    const nb = estimate?.nextBlock;
    const serviceSameStep = nb?.service && Math.abs(nb.service.unitsToNext - nb.unitsToNext) < 0.01;

    const pay = async (id) => {
        setPayingId(id);
        try {
            await payBill(id);
            toast.success("Payment successful. Full flow restored.");
        } catch (e) {
            toast.error(e.message);
        } finally {
            setPayingId(null);
        }
    };

    return (
        <div>
            {/* Header */}
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">Billing</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Postpaid connection: use water now, pay at the end of each cycle.</p>

            {/* Amount due banner */}
            {outstanding.length > 0 && (
                <div
                    className={`mt-5 flex items-start gap-3 rounded-md border px-4 py-3 ${
                        outstanding.some((b) => b.status === "overdue")
                            ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                    }`}
                >
                    <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="flex-1 text-sm">
                        <span className="font-semibold">{money(totalDue)} due</span>
                        {outstanding.some((b) => b.status === "overdue")
                            ? " — overdue, so your supply is restricted. Pay to restore full flow."
                            : ` — ${outstanding.length === 1 ? "one bill" : `${outstanding.length} bills`} waiting for payment.`}
                    </p>
                </div>
            )}

            {/* This cycle */}
            <Card className="mt-5 p-5">
                <SectionTitle
                    icon={FiFileText}
                    right={
                        start && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                <FiCalendar className="h-3.5 w-3.5" />
                                {shortDate(start)} – {shortDate(end)}
                            </span>
                        )
                    }
                >
                    This billing cycle
                </SectionTitle>

                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-slate-100 dark:sm:divide-slate-800">
                    {/* So far */}
                    <div className="sm:pr-6">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">So far</p>
                        <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{money(estimate?.amount)}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {(bill?.volumeUsed || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} L · {units(bill?.volumeUsed)} units
                        </p>
                    </div>

                    {/* Predicted at cycle end */}
                    <div className="sm:pl-6">
                        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            <FiTrendingUp className="h-3.5 w-3.5" /> Predicted at cycle end
                        </p>
                        {prediction === undefined ? (
                            <p className="mt-2 text-sm text-slate-400">Calculating…</p>
                        ) : prediction ? (
                            <>
                                <p className="mt-1 text-3xl font-bold tracking-tight text-sky-600 dark:text-sky-400">{money(prediction.amount.mid)}</p>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    {Math.round(prediction.projectedLitres.mid).toLocaleString()} L · {units(prediction.projectedLitres.mid)} units by {shortDate(prediction.cycleEnd)}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                    Likely between {money(prediction.amount.low)} and {money(prediction.amount.high)}
                                </p>
                            </>
                        ) : (
                            <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-400 dark:text-slate-500">
                                <FiInfo className="mt-0.5 h-4 w-4 shrink-0" />
                                Available after a few days of usage history.
                            </p>
                        )}
                    </div>
                </div>

                {/* Cycle progress */}
                {dayOfCycle && (
                    <div className="mt-5">
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>
                                Day {dayOfCycle} of about {CYCLE_DAYS}
                            </span>
                            {prediction && <span>{Math.ceil(prediction.daysLeftInCycle)} days left</span>}
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${cyclePct}%` }} />
                        </div>
                    </div>
                )}
                <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                    Updates live with every meter reading. The prediction adds your usage forecast up to the cycle end; you're billed when the cycle closes.
                </p>
            </Card>

            {/* Breakdown */}
            {estimate && partsTotal > 0 && (
                <Card className="mt-4 p-5">
                    <SectionTitle icon={FiLayers}>What your bill so far is made of</SectionTitle>
                    <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Bill breakdown">
                        {PARTS.filter((p) => estimate[p.key] > 0).map((p) => (
                            <div key={p.key} className={p.dot} style={{ width: `${(100 * estimate[p.key]) / partsTotal}%` }} />
                        ))}
                    </div>
                    <dl className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                        {PARTS.map((p) => (
                            <div key={p.key} className="flex items-center justify-between py-2">
                                <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <span className={`h-2 w-2 rounded-full ${p.dot}`} />
                                    {p.label}
                                </dt>
                                <dd className="tabular-nums text-slate-900 dark:text-white">{money(estimate[p.key])}</dd>
                            </div>
                        ))}
                        <div className="flex items-center justify-between py-2 font-semibold">
                            <dt className="text-slate-900 dark:text-white">Total so far</dt>
                            <dd className="tabular-nums text-slate-900 dark:text-white">{money(estimate.amount)}</dd>
                        </div>
                    </dl>
                    {nb && (
                        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                            <span className="font-semibold text-slate-900 dark:text-white">
                                {nb.unitsToNext.toLocaleString(undefined, { maximumFractionDigits: 1 })} units
                            </span>{" "}
                            ({nb.litresToNext.toLocaleString()} L) until the next price block: each unit then costs {money(nb.nextRate)} instead of{" "}
                            {money(nb.rate)}.
                            {serviceSameStep && ` The service charge also rises from ${money(nb.service.now)} to ${money(nb.service.next)} there.`}
                            {nb.service &&
                                !serviceSameStep &&
                                ` The service charge rises from ${money(nb.service.now)} to ${money(nb.service.next)} in ${nb.service.unitsToNext.toLocaleString(undefined, { maximumFractionDigits: 1 })} units.`}
                        </p>
                    )}
                </Card>
            )}

            {/* Amount due */}
            {outstanding.length > 0 && (
                <Card className="mt-4">
                    <div className="p-5 pb-3">
                        <SectionTitle icon={FiAlertTriangle}>Amount due</SectionTitle>
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {outstanding.map((b) => (
                            <li key={b._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-semibold text-slate-900 dark:text-white">{money(b.amount)}</span>
                                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[b.status]}`}>{b.status}</span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {b.periodStart && shortDate(b.periodStart)}
                                        {b.periodEnd && ` – ${shortDate(b.periodEnd)}`} · {b.units} units
                                        {b.dueDate && (
                                            <span className={b.status === "overdue" ? "text-red-600 dark:text-red-400" : ""}> · due {shortDate(b.dueDate)}</span>
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={payingId === b._id}
                                    onClick={() => pay(b._id)}
                                    className="shrink-0 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {payingId === b._id ? "Paying…" : "Pay now"}
                                </button>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* Paid bills */}
            {past.length > 0 && (
                <Card className="mt-4">
                    <div className="p-5 pb-3">
                        <SectionTitle icon={FiCheckCircle}>Paid bills</SectionTitle>
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {past.map((b) => (
                            <li key={b._id} className="flex items-center justify-between gap-3 px-5 py-3">
                                <div className="min-w-0">
                                    <p className="text-sm text-slate-700 dark:text-slate-200">
                                        {b.periodStart && shortDate(b.periodStart)}
                                        {b.periodEnd && ` – ${shortDate(b.periodEnd)}`}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {b.units} units{b.paidAt && ` · paid ${shortDate(b.paidAt)}`}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{money(b.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
};

export default Billing;
