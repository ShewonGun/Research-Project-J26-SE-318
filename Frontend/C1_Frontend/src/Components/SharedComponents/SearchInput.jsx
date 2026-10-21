import { FiSearch, FiX } from "react-icons/fi";

// Text search box shared by admin list pages (Devices, Users, Subscriptions,
// Billing) — a controlled input with a search icon and a clear button.
const SearchInput = ({ value, onChange, placeholder = "Search…", className = "" }) => (
    <div className={`relative ${className}`}>
        <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-sm border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-8 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800"
        />
        {value && (
            <button
                type="button"
                onClick={() => onChange("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
            >
                <FiX className="h-3.5 w-3.5" />
            </button>
        )}
    </div>
);

export default SearchInput;
