import { useState, useEffect, useCallback } from "react";
import { FiPlus } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import WaterPackageCard from "../../Components/AdminComponents/WaterPackageCard.jsx";
import AddWaterPackageModal from "../../Components/AdminComponents/AddWaterPackageModal.jsx";
import ConfirmationBox from "../../Components/SharedComponents/ConfirmationBox.jsx";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import SearchInput from "../../Components/SharedComponents/SearchInput.jsx";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";

const PAGE_SIZE = 8;

const WaterPackages = () => {
    const toast = useToast();
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null); // package pending delete confirmation
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    useEffect(() => setPage(1), [search]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch("/api/water-packages");
            setPackages(data.packages || []);
        } catch (err) {
            if (!silent) toast.error(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setModalOpen(true);
    };

    const openEdit = (pkg) => {
        setEditing(pkg);
        setModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setDeleteLoading(true);
        try {
            await apiFetch(`/api/water-packages/${deleting._id}`, { method: "DELETE" });
            setDeleting(null);
            await load(true);
            toast.success("Package deleted.");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setDeleteLoading(false);
        }
    };

    if (loading) return <WaterLoader center />;

    const q = search.trim().toLowerCase();
    const shown = !q ? packages : packages.filter((p) => [p.name, p.description].some((v) => v?.toLowerCase().includes(q)));
    const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Water Packages</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Manage prepaid water plans.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 rounded-sm bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                    <FiPlus className="h-4 w-4" /> New package
                </button>
            </div>

            {packages.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                    <p className="text-sm text-slate-500 dark:text-slate-400">No packages yet.</p>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="mt-2 text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                        Create your first package
                    </button>
                </div>
            ) : (
                <>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search by name or description…" className="mt-5 max-w-sm" />

                    {shown.length === 0 ? (
                        <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                            <p className="text-sm text-slate-500 dark:text-slate-400">No packages match "{search}".</p>
                        </div>
                    ) : (
                        <>
                            <StaggerGrid className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                                {paged.map((pkg) => (
                                    <StaggerItem key={pkg._id}>
                                        <WaterPackageCard pkg={pkg} onEdit={openEdit} onDelete={setDeleting} />
                                    </StaggerItem>
                                ))}
                            </StaggerGrid>
                            <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onChange={setPage} />
                        </>
                    )}
                </>
            )}

            <AddWaterPackageModal
                open={modalOpen}
                editing={editing}
                onClose={() => setModalOpen(false)}
                onSaved={() => load(true)}
            />

            <ConfirmationBox
                open={!!deleting}
                title="Delete package"
                message={deleting ? `Delete "${deleting.name}"? This cannot be undone.` : ""}
                confirmText="Delete"
                tone="danger"
                loading={deleteLoading}
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
};

export default WaterPackages;
