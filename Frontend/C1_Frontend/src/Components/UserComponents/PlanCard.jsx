import { FiDroplet, FiCheck } from "react-icons/fi";

// A prepaid-plan card built from the site's own design language: a sky icon-chip
// header, litres as the hero, a tidy details list, and a clean sky button.
// `highlight` marks the best-value plan.
const PlanCard = ({ pkg, disabled, buying, highlight, onBuy }) => {
    const perLiter = pkg.volumeLiters ? pkg.price / pkg.volumeLiters : 0;

    return (
        <div
            className={`flex flex-col rounded-sm border bg-white p-5 transition hover:shadow-sm dark:bg-slate-900 ${
                highlight ? "border-sky-300 ring-1 ring-sky-200 dark:border-sky-800 dark:ring-sky-900" : "border-slate-200 dark:border-slate-800"
            }`}
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiDroplet className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">{pkg.name}</span>
                </div>
                {highlight && (
                    <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        Best value
                    </span>
                )}
            </div>

            {/* Litres hero */}
            <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{pkg.volumeLiters.toLocaleString()}</span>
                <span className="text-sm text-slate-400 dark:text-slate-500">litres</span>
            </div>

            {/* Details */}
            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                <div className="flex items-center justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Price</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">Rs. {pkg.price.toLocaleString()}</dd>
                </div>
                <div className="flex items-center justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Validity</dt>
                    <dd className="text-slate-700 dark:text-slate-300">{pkg.validityDays} days</dd>
                </div>
                <div className="flex items-center justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Per litre</dt>
                    <dd className="text-slate-700 dark:text-slate-300">Rs {perLiter.toFixed(2)}</dd>
                </div>
            </dl>

            {/* Buy */}
            <button
                type="button"
                disabled={disabled || buying}
                onClick={onBuy}
                className={`mt-5 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
                    disabled
                        ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                        : "bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60"
                }`}
            >
                {buying ? (
                    "Processing…"
                ) : disabled ? (
                    <>
                        <FiCheck className="h-4 w-4" /> Plan active
                    </>
                ) : (
                    "Buy plan"
                )}
            </button>
        </div>
    );
};

export default PlanCard;
