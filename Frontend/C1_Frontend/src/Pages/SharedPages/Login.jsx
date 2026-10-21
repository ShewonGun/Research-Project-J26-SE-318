import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiLoader } from "react-icons/fi";
import { useToast } from "../../Context/ToastContext.jsx";
import PasswordInput from "../../Components/SharedComponents/PasswordInput.jsx";
import AuthLayout from "../../Layout/AuthLayout.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const fieldCls = (hasError) =>
    `w-full rounded-sm border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:bg-white focus:ring-4 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800 ${
        hasError
            ? "border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500"
            : "border-slate-200 bg-slate-50 focus:border-sky-500 focus:ring-sky-500/10 dark:border-slate-700"
    }`;

const Login = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState({});

    const emailValid = EMAIL_RE.test(email);
    const emailError = touched.email && email && !emailValid ? "Enter a valid email address." : "";

    const handleSubmit = async (e) => {
        e.preventDefault();
        setTouched({ email: true });
        if (!emailValid) return;

        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.message || "Login failed");
                return;
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            toast.success(`Welcome back${data.user?.name ? `, ${data.user.name.split(" ")[0]}` : ""}!`);
            // Route by role: admins to the console, households to their app.
            navigate(data.user?.role === "admin" ? "/dashboard" : "/app", { replace: true });
        } catch {
            toast.error("Unable to reach the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Sign in"
            subtitle="Sign in to your account."
            footer={
                <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                    Don&apos;t have an account?{" "}
                    <Link to="/signup" className="font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                        Sign up
                    </Link>
                </p>
            }
        >
            <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
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

                <div>
                    <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Password
                    </label>
                    <PasswordInput
                        id="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={fieldCls(false)}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-sm bg-linear-to-r from-cyan-500 to-blue-600 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-all hover:from-cyan-600 hover:to-blue-700 hover:shadow-blue-600/40 focus:ring-4 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-blue-600/25"
                >
                    {loading && <FiLoader className="h-5 w-5 animate-spin" />}
                    {loading ? "Signing in…" : "Sign in"}
                </button>
            </form>
        </AuthLayout>
    );
};

export default Login;
