import { FiCpu } from "react-icons/fi";

const NoDevice = () => (
    <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <FiCpu className="h-6 w-6" />
        </span>
        <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-300">No water meter linked yet</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Please contact your water provider to get your meter set up.
        </p>
    </div>
);

export default NoDevice;
