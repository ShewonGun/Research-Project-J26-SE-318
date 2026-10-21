import { useState } from "react";
import { FiUser, FiLock, FiShield, FiEdit2, FiX } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import PasswordInput from "../../Components/SharedComponents/PasswordInput.jsx";

const initials = (name) => (name?.trim()?.[0] || "A").toUpperCase();

const inputCls =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50";

const Profile = () => {
    const stored = JSON.parse(localStorage.getItem("user") || "null");
    const toast = useToast();
    const [user, setUser] = useState(stored);

    // Profile form
    const [name, setName] = useState(stored?.name || "");
    const [phone, setPhone] = useState(stored?.phone || "");
    const [address, setAddress] = useState(stored?.address || "");
    const [savingProfile, setSavingProfile] = useState(false);
    const [editingProfile, setEditingProfile] = useState(false);

    // Password form
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [savingPw, setSavingPw] = useState(false);

    const profileDirty =
        name.trim() !== (user?.name || "") ||
        (phone || "") !== (user?.phone || "") ||
        (address || "") !== (user?.address || "");

    const saveProfile = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Name cannot be empty.");
            return;
        }
        setSavingProfile(true);
        try {
            const data = await apiFetch("/api/users/profile", {
                method: "PUT",
                body: { name: name.trim(), phone, address },
            });
            setUser(data.user);
            localStorage.setItem("user", JSON.stringify(data.user));
            setEditingProfile(false);
            toast.success("Profile updated.");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingProfile(false);
        }
    };

    const cancelEditProfile = () => {
        setName(user?.name || "");
        setPhone(user?.phone || "");
        setAddress(user?.address || "");
        setEditingProfile(false);
    };

    const savePassword = async (e) => {
        e.preventDefault();
        if (password.length < 6) {
            toast.error("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirm) {
            toast.error("Passwords do not match.");
            return;
        }
        setSavingPw(true);
        try {
            await apiFetch("/api/users/profile", { method: "PUT", body: { password } });
            setPassword("");
            setConfirm("");
            toast.success("Password changed.");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingPw(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Profile</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Manage your admin account and password.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Identity card */}
            <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-20 lg:self-start">
                <div className="flex flex-col items-center text-center">
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 text-2xl font-semibold text-white">
                        {initials(user?.name)}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{user?.name || "Admin"}</p>
                    <p className="mt-0.5 max-w-full truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                    <span className="mt-3 flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
                        <FiShield className="h-3 w-3" /> Admin
                    </span>
                </div>

                <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-xs text-slate-400 dark:text-slate-500">Phone</dt>
                        <dd className="truncate font-medium text-slate-900 dark:text-white">{user?.phone || "—"}</dd>
                    </div>
                    {user?.createdAt && (
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-xs text-slate-400 dark:text-slate-500">Member since</dt>
                            <dd className="font-medium text-slate-900 dark:text-white">
                                {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                            </dd>
                        </div>
                    )}
                </dl>
            </div>

            {/* Right column: forms */}
            <div className="space-y-4 lg:col-span-2">
            {/* Profile details */}
            <form onSubmit={saveProfile} className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                            <FiUser className="h-4 w-4" />
                        </span>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Personal details</p>
                    </div>
                    {!editingProfile ? (
                        <button
                            type="button"
                            onClick={() => setEditingProfile(true)}
                            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                            <FiEdit2 className="h-3.5 w-3.5" /> Edit
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={cancelEditProfile}
                            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                            <FiX className="h-3.5 w-3.5" /> Cancel
                        </button>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Name</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} disabled={!editingProfile} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Phone</span>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!editingProfile} placeholder="—" className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Address</span>
                        <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!editingProfile} placeholder="—" className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</span>
                        <input value={user?.email || ""} disabled className={inputCls} />
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">Email can't be changed.</span>
                    </label>
                </div>

                {editingProfile && (
                    <div className="mt-5">
                        <button
                            type="submit"
                            disabled={savingProfile || !profileDirty}
                            className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                        >
                            {savingProfile ? "Saving…" : "Save changes"}
                        </button>
                    </div>
                )}
            </form>

            {/* Password */}
            <form onSubmit={savePassword} className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiLock className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Change password</p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">New password</span>
                        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirm password</span>
                        <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={inputCls} />
                    </label>
                </div>

                <div className="mt-5">
                    <button
                        type="submit"
                        disabled={savingPw || !password}
                        className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                        {savingPw ? "Updating…" : "Update password"}
                    </button>
                </div>
            </form>
            </div>
            </div>
        </div>
    );
};

export default Profile;
