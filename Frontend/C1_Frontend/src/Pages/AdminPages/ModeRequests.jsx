import { useState, useEffect, useCallback, useRef } from "react";
import { FiClock, FiCheckCircle, FiXCircle, FiArrowRight } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "../../lib/api.js";
import { connectSocket } from "../../lib/socket.js";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import StatTile from "../../Components/SharedComponents/StatTile.jsx";
import SearchInput from "../../Components/SharedComponents/SearchInput.jsx";
import { useModalDismiss } from "../../Components/SharedComponents/useModalDismiss.js";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";
import { useToast } from "../../Context/ToastContext.jsx";

const PAGE_SIZE = 6;

const filters = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "cancelled", label: "Withdrawn" },
    { key: "all", label: "All" },
];

const statusStyles = {
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    rejected: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const relativeTime = (date) => {
    if (!date) return "";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

// Approve / reject dialog with an optional note shown to the household.
const DecisionModal = ({ decision, loading, onConfirm, onCancel }) => {
    const [note, setNote] = useState("");
    const open = !!decision;
    const panelRef = useModalDismiss(open, onCancel);
    useEffect(() => setNote(""), [decision]);

    const approve = decision?.action === "approve";
    const req = decision?.request;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
                    onClick={onCancel}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <motion.div
                        ref={panelRef}
                        tabIndex={-1}
                        className="w-full max-w-sm rounded-sm border border-slate-200 bg-white p-5 shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {approve ? "Approve request" : "Reject request"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {approve
                                ? `Switch "${req?.device?.name}" from ${req?.fromMode} to ${req?.toMode} now.`
                                : `Keep "${req?.device?.name}" on ${req?.fromMode}.`}{" "}
                            {approve && req?.toMode === "prepaid" && "Supply stays closed until the household buys a plan."}
                        </p>
                        <label className="mt-4 block text-xs font-medium text-slate-600 dark:text-slate-300">
                            Note to household (optional)
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={500}
                                rows={3}
                                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                        </label>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={loading}
                                className="rounded-sm px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => onConfirm(note.trim())}
                                disabled={loading}
                                className={`rounded-sm px-3.5 py-1.5 text-sm font-medium text-white transition disabled:opacity-60 ${
                                    approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                                }`}
                            >
                                {loading ? "Please wait…" : approve ? "Approve" : "Reject"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const ModeRequests = () => {
    const toast = useToast();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("pending");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [decision, setDecision] = useState(null); // { action, request }
    const [deciding, setDeciding] = useState(false);
    const lastLoadAt = useRef(0);

    useEffect(() => setPage(1), [filter, search]);

    const load = useCallback(async (silent = false) => {
        lastLoadAt.current = Date.now();
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch("/api/billing-requests");
            setRequests(data.requests || []);
        } catch (err) {
            if (!silent) toast.error(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        const socket = connectSocket();
        const onChange = () => {
            if (Date.now() - lastLoadAt.current < 1500) return;
            load(true);
        };
        socket?.on("billing-request:changed", onChange);
        // Safety-net poll in case a socket event is ever missed/disconnected.
        const id = setInterval(() => load(true), 60000);
        return () => {
            socket?.off("billing-request:changed", onChange);
            clearInterval(id);
        };
    }, [load]);

    const decide = async (note) => {
        if (!decision) return;
        setDeciding(true);
        try {
            await apiFetch(`/api/billing-requests/${decision.request._id}/${decision.action}`, {
                method: "PUT",
                body: { note },
            });
            toast.success(decision.action === "approve" ? "Request approved." : "Request rejected.");
            setDecision(null);
            await load(true);
        } catch (err) {
            toast.error(err.message);
            setDecision(null);
            load(true);
        } finally {
            setDeciding(false);
        }
    };

    const count = (status) => requests.filter((r) => r.status === status).length;
    const q = search.trim().toLowerCase();
    const shown = requests
        .filter((r) => filter === "all" || r.status === filter)
        .filter(
            (r) =>
                !q ||
                [r.user?.name, r.user?.email, r.user?.accountNumber, r.device?.name, r.device?.deviceId].some((v) =>
                    v?.toLowerCase().includes(q)
                )
        );
    const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (loading) return <WaterLoader center />;

    return (
        <div>
            <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Mode Requests</h1>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    Households asking to switch between prepaid and postpaid.
                </p>
            </div>

            <StaggerGrid className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StaggerItem><StatTile label="Pending" value={count("pending")} icon={FiClock} tone="violet" /></StaggerItem>
                <StaggerItem><StatTile label="Approved" value={count("approved")} icon={FiCheckCircle} tone="emerald" /></StaggerItem>
                <StaggerItem><StatTile label="Rejected" value={count("rejected")} icon={FiXCircle} tone="red" /></StaggerItem>
            </StaggerGrid>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
                    {filters.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setFilter(f.key)}
                            className={`rounded-sm px-3 py-1 text-xs font-medium transition ${
                                filter === f.key
                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            {f.label}
                            {f.key === "pending" && count("pending") > 0 && (
                                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                                    {count("pending")}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <SearchInput value={search} onChange={setSearch} placeholder="Search by household or device…" className="w-full sm:w-64" />
            </div>

            {shown.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {q ? `No requests match "${search}".` : "No requests here."}
                    </p>
                </div>
            ) : (
                <div className="mt-4 space-y-3">
                    {paged.map((r) => (
                        <div key={r._id} className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-900 dark:text-white">
                                        {r.user?.name || "Unknown user"}
                                        {r.user?.accountNumber && (
                                            <span className="ml-2 font-mono text-xs font-normal text-slate-400 dark:text-slate-500">
                                                #{r.user.accountNumber}
                                            </span>
                                        )}
                                    </p>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                        {r.device?.name || "—"} · <span className="font-mono">{r.device?.deviceId}</span>
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[r.status]}`}>
                                    {r.status === "cancelled" ? "withdrawn" : r.status}
                                </span>
                            </div>

                            <div className="mt-3 flex items-center gap-2 text-sm">
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {r.fromMode}
                                </span>
                                <FiArrowRight className="h-3.5 w-3.5 text-slate-400" />
                                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium capitalize text-sky-700 dark:bg-sky-950/50 dark:text-sky-400">
                                    {r.toMode}
                                </span>
                                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{relativeTime(r.createdAt)}</span>
                            </div>

                            {r.reason && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">“{r.reason}”</p>}

                            {r.status === "pending" ? (
                                <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setDecision({ action: "reject", request: r })}
                                        className="rounded-sm border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDecision({ action: "approve", request: r })}
                                        className="rounded-sm bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                                    >
                                        Approve
                                    </button>
                                </div>
                            ) : (
                                r.decidedAt && (
                                    <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                        {r.decidedBy?.name ? `By ${r.decidedBy.name} · ` : ""}
                                        {new Date(r.decidedAt).toLocaleString()}
                                        {r.adminNote && ` · ${r.adminNote}`}
                                    </p>
                                )
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onChange={setPage} />

            <DecisionModal decision={decision} loading={deciding} onConfirm={decide} onCancel={() => setDecision(null)} />
        </div>
    );
};

export default ModeRequests;
