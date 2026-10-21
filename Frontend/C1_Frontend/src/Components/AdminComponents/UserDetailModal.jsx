import { FiX, FiCpu } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { useModalDismiss } from "../SharedComponents/useModalDismiss.js";

const Field = ({ label, value, mono }) => (
    <div className="min-w-0">
        <dt className="text-[11px] text-slate-400 dark:text-slate-500">{label}</dt>
        <dd className={`mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-white ${mono ? "font-mono" : ""}`}>
            {value || "—"}
        </dd>
    </div>
);

const statusStyles = {
    online: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    offline: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

// Read-only profile of one user, with the connections assigned to them.
const UserDetailModal = ({ user, devices = [], onClose }) => {
    const open = !!user;
    const panelRef = useModalDismiss(open, onClose);
    const admin = user?.role === "admin";

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <motion.div
                        ref={panelRef}
                        tabIndex={-1}
                        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm border border-slate-200 bg-white p-5 shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 text-base font-semibold text-white">
                                    {(user.name || "?").slice(0, 1).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                    <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{user.name}</h2>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                                aria-label="Close"
                            >
                                <FiX className="h-4 w-4" />
                            </button>
                        </div>

                        <span
                            className={`mt-3 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                admin
                                    ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400"
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                        >
                            {admin ? "Admin" : "Household"}
                        </span>

                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                            {!admin && <Field label="Account number" value={user.accountNumber} mono />}
                            {!admin && <Field label="NIC" value={user.nic} mono />}
                            <Field label="Phone" value={user.phone} />
                            <Field
                                label="Joined"
                                value={user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : ""}
                            />
                            {!admin && (
                                <div className="col-span-2">
                                    <Field label="Address" value={user.address} />
                                </div>
                            )}
                        </dl>

                        {!admin && (
                            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">Connections</p>
                                {devices.length === 0 ? (
                                    <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-400">No connection assigned yet.</p>
                                ) : (
                                    <ul className="mt-2 space-y-2">
                                        {devices.map((d) => (
                                            <li
                                                key={d._id}
                                                className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 px-3 py-2 dark:border-slate-800"
                                            >
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    <FiCpu className="h-4 w-4 shrink-0 text-slate-400" />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{d.name || "Water Meter"}</p>
                                                        <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">{d.deviceId}</p>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium capitalize text-sky-700 dark:bg-sky-950/50 dark:text-sky-400">
                                                        {d.billingMode}
                                                    </span>
                                                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[d.status] || statusStyles.offline}`}>
                                                        {d.status}
                                                    </span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default UserDetailModal;
