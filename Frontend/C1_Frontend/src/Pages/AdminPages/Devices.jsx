import { useState, useEffect, useCallback, useRef } from "react";
import { FiPlus } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { connectSocket } from "../../lib/socket.js";
import { useToast } from "../../Context/ToastContext.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import DeviceCard from "../../Components/AdminComponents/DeviceCard.jsx";
import AddDeviceModal from "../../Components/AdminComponents/AddDeviceModal.jsx";
import ConfirmationBox from "../../Components/SharedComponents/ConfirmationBox.jsx";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import SearchInput from "../../Components/SharedComponents/SearchInput.jsx";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";

const PAGE_SIZE = 6;

const Devices = () => {
    const toast = useToast();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [deleting, setDeleting] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const lastLoadAt = useRef(0);

    useEffect(() => setPage(1), [search]);

    const load = useCallback(async (silent = false) => {
        lastLoadAt.current = Date.now();
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch("/api/devices");
            setDevices(data.devices || []);
        } catch (err) {
            if (!silent) toast.error(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        const socket = connectSocket();
        // If we just loaded (e.g. our own create/delete), an incoming socket
        // notification for that same change is just an echo — skip it.
        const onChange = () => {
            if (Date.now() - lastLoadAt.current < 1500) return;
            load(true);
        };
        socket?.on("device:updated", onChange);
        socket?.on("device:list-changed", onChange);
        // Safety-net poll in case a socket event is ever missed/disconnected.
        const id = setInterval(() => load(true), 60000);
        return () => {
            socket?.off("device:updated", onChange);
            socket?.off("device:list-changed", onChange);
            clearInterval(id);
        };
    }, [load]);

    // Replace a single device in place (after valve changes) without a full reload.
    const patchDevice = (updated) =>
        setDevices((list) => list.map((d) => (d._id === updated._id ? { ...d, ...updated } : d)));

    const openCreate = () => {
        setEditing(null);
        setModalOpen(true);
    };

    const openEdit = (device) => {
        setEditing(device);
        setModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setDeleteLoading(true);
        try {
            await apiFetch(`/api/devices/${deleting._id}`, { method: "DELETE" });
            setDeleting(null);
            await load();
            toast.success("Connection deleted.");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setDeleteLoading(false);
        }
    };

    if (loading) return <WaterLoader center />;

    const q = search.trim().toLowerCase();
    const shown = !q
        ? devices
        : devices.filter((d) =>
              [d.name, d.deviceId, d.location, d.owner?.name].some((v) => v?.toLowerCase().includes(q))
          );
    const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Connections</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Monitor meters and control valves remotely.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 rounded-sm bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                    <FiPlus className="h-4 w-4" /> <span className="hidden sm:inline">Register connection</span>
                </button>
            </div>

            {devices.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                    <p className="text-sm text-slate-500 dark:text-slate-400">No connections registered yet.</p>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="mt-2 text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                        Register your first connection
                    </button>
                </div>
            ) : (
                <>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search by name, device ID, location, or owner…" className="mt-5 max-w-sm" />

                    {shown.length === 0 ? (
                        <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                            <p className="text-sm text-slate-500 dark:text-slate-400">No connections match "{search}".</p>
                        </div>
                    ) : (
                        <>
                            <StaggerGrid className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {paged.map((device) => (
                                    <StaggerItem key={device._id}>
                                        <DeviceCard device={device} onEdit={openEdit} onDelete={setDeleting} onUpdated={patchDevice} />
                                    </StaggerItem>
                                ))}
                            </StaggerGrid>
                            <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onChange={setPage} />
                        </>
                    )}
                </>
            )}

            <AddDeviceModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSaved={load} />

            <ConfirmationBox
                open={!!deleting}
                title="Delete device"
                message={deleting ? `Delete "${deleting.name || deleting.deviceId}"? Its readings will remain until they expire.` : ""}
                confirmText="Delete"
                tone="danger"
                loading={deleteLoading}
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
};

export default Devices;
