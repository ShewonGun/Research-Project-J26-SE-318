import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

// Windowed page list: 1 … 4 5 [6] 7 8 … 20
const pageWindow = (current, count) => {
    const range = [];
    for (let i = Math.max(2, current - 1); i <= Math.min(count - 1, current + 1); i++) range.push(i);

    const out = [1];
    if (range[0] > 2) out.push("…");
    out.push(...range);
    if (range[range.length - 1] < count - 1) out.push("…");
    if (count > 1) out.push(count);
    return out;
};

// Reusable client-side pagination. Renders nothing for a single page.
//   <Pagination page={page} pageSize={10} total={items.length} onChange={setPage} />
const Pagination = ({ page, pageSize, total, onChange }) => {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    if (pageCount <= 1) return null;

    const from = (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    const go = (p) => onChange(Math.max(1, Math.min(pageCount, p)));

    return (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing <span className="font-medium text-slate-700 dark:text-slate-300">{from}–{to}</span> of {total}
            </p>

            <div className="flex items-center gap-1">
                <Arrow disabled={page === 1} onClick={() => go(page - 1)} label="Previous">
                    <FiChevronLeft className="h-4 w-4" />
                </Arrow>

                {pageWindow(page, pageCount).map((p, i) =>
                    p === "…" ? (
                        <span key={`gap-${i}`} className="px-1 text-xs text-slate-400 dark:text-slate-500">
                            …
                        </span>
                    ) : (
                        <button
                            key={p}
                            type="button"
                            onClick={() => go(p)}
                            aria-current={p === page ? "page" : undefined}
                            className={`h-8 min-w-8 rounded-sm px-2 text-xs font-medium transition ${
                                p === page
                                    ? "bg-sky-600 text-white"
                                    : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            }`}
                        >
                            {p}
                        </button>
                    )
                )}

                <Arrow disabled={page === pageCount} onClick={() => go(page + 1)} label="Next">
                    <FiChevronRight className="h-4 w-4" />
                </Arrow>
            </div>
        </div>
    );
};

const Arrow = ({ disabled, onClick, label, children }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-8 w-8 items-center justify-center rounded-sm border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
    >
        {children}
    </button>
);

export default Pagination;
