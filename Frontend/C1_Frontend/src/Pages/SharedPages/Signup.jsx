import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiLoader } from "react-icons/fi";
import { useToast } from "../../Context/ToastContext.jsx";
import PasswordInput from "../../Components/SharedComponents/PasswordInput.jsx";
import AuthLayout from "../../Layout/AuthLayout.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const NIC_RE = /^(\d{9}[VX]|\d{12})$/i; // old (9 digits + V/X) or new (12 digits)
const PHONE_RE = /^\+?\d{9,15}$/;

const fieldCls = (hasError) =>
    `w-full rounded-sm border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:bg-white focus:ring-4 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800 ${
        hasError
            ? "border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500"
            : "border-slate-200 bg-slate-50 focus:border-sky-500 focus:ring-sky-500/10 dark:border-slate-700"
    }`;

const Signup = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [nic, setNic] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState({});

    const emailValid = EMAIL_RE.test(email);
    const emailError = touched.email && email && !emailValid ? "Enter a valid email address." : "";
    const nicValid = NIC_RE.test(nic.trim());
    const nicError = touched.nic && nic && !nicValid ? "Invalid NIC (9 digits + V/X, or 12 digits)." : "";
    const phoneClean = phone.replace(/[\s-]/g, "");
    const phoneValid = PHONE_RE.test(phoneClean);
    const phoneError = touched.phone && phone && !phoneValid ? "Enter a valid phone number." : "";
    const passwordError = touched.password && password && password.length < 6 ? "Password must be at least 6 characters." : "";
    const confirmError = confirmPassword && password !== confirmPassword ? "Passwords do not match." : "";

    const handleSubmit = async (e) => {
        e.preventDefault();
        setTouched({ email: true, nic: true, phone: true, address: true, password: true, confirmPassword: true });
        if (!emailValid || !nicValid || !phoneValid || !address.trim() || password.length < 6 || password !== confirmPassword) return;

        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Public sign-up creates a household (consumer) account.
                body: JSON.stringify({ name, email, password, nic: nic.trim().toUpperCase(), phone: phoneClean, address: address.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.message || "Sign up failed");
                return;
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            toast.success("Account created. Welcome to AquaFlow!");
            navigate("/app", { replace: true });
        } catch {
            toast.error("Unable to reach the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Create account"
            subtitle="Create your AquaFlow account."
            footer={
                <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                    Already have an account?{" "}
                    <Link to="/login" className="font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                        Sign in
                    </Link>
                </p>
            }
        >
            <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
                <div>
                    <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Full name
                    </label>
                    <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Perera"
                        className={fieldCls(false)}
                    />
                </div>

                <div>
                    <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                        placeholder="admin@aquaflow.lk"
                        className={fieldCls(!!emailError)}
                    />
                    {emailError && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{emailError}</p>}
                </div>

                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="min-w-0">
                    <label htmlFor="nic" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        NIC number
                    </label>
                    <input
                        id="nic"
                        type="text"
                        required
                        value={nic}
                        onChange={(e) => setNic(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, nic: true }))}
                        placeholder="NIC number"
                        className={fieldCls(!!nicError)}
                    />
                    {nicError && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{nicError}</p>}
                </div>

                <div className="min-w-0">
                    <label htmlFor="phone" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Phone number
                    </label>
                    <input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                        placeholder="077 123 4567"
                        className={fieldCls(!!phoneError)}
                    />
                    {phoneError && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{phoneError}</p>}
                </div>
                </div>

                <div>
                    <label htmlFor="address" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Address
                    </label>
                    <input
                        id="address"
                        type="text"
                        autoComplete="street-address"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, address: true }))}
                        placeholder="12 Lake Road, Colombo"
                        className={fieldCls(touched.address && !address.trim())}
                    />
                    {touched.address && !address.trim() && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Address is required.</p>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="min-w-0">
                    <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Password
                    </label>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                        placeholder="••••••••"
                        className={fieldCls(!!passwordError)}
                    />
                    {passwordError && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{passwordError}</p>}
                </div>

                <div className="min-w-0">
                    <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Confirm password
                    </label>
                    <PasswordInput
                        id="confirmPassword"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={fieldCls(!!confirmError)}
                    />
                    {confirmError && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{confirmError}</p>}
                </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-sm bg-linear-to-r from-cyan-500 to-blue-600 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-all hover:from-cyan-600 hover:to-blue-700 hover:shadow-blue-600/40 focus:ring-4 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-blue-600/25"
                >
                    {loading && <FiLoader className="h-5 w-5 animate-spin" />}
                    {loading ? "Creating account…" : "Create account"}
                </button>
            </form>
        </AuthLayout>
    );
};

export default Signup;
