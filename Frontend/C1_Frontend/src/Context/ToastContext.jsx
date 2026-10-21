import { createContext, useContext, useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FiCheckCircle, FiAlertTriangle, FiInfo, FiX } from "react-icons/fi";

const ToastContext = createContext(null);

const config = {
    success: { icon: FiCheckCircle, accent: "text-emerald-500", ring: "ring-emerald-500/20" },
    error: { icon: FiAlertTriangle, accent: "text-red-500", ring: "ring-red-500/20" },
    info: { icon: FiInfo, accent: "text-sky-500", ring: "ring-sky-500/20" },
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);

    const dismiss = useCallback((id) => {
        setToasts((list) => list.filter((t) => t.id !== id));
    }, []);

    const push = useCallback(
        (message, type = "info", duration = 4000) => {
            const id = ++idRef.current;
            setToasts((list) => [...list, { id, message, type }]);
            if (duration) setTimeout(() => dismiss(id), duration);
            return id;
        },
        [dismiss],
    );

    // Stable across renders — components that put `toast` in a useCallback/
    // useEffect dependency array won't re-run just because a toast was shown
    // or dismissed elsewhere in the app.
    const toast = useMemo(
        () => ({
            success: (m, d) => push(m, "success", d),
            error: (m, d) => push(m, "error", d),
            info: (m, d) => push(m, "info", d),
            show: push,
            dismiss,
        }),
        [push, dismiss],
    );

    return (
        <ToastContext.Provider value={toast}>
            {children}

            {/* Toast viewport */}
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end">
                <AnimatePresence initial={false}>
                    {toasts.map((t) => {
                        const c = config[t.type] || config.info;
                        const Icon = c.icon;
                        return (
                            <motion.div
                                key={t.id}
                                layout
                                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3.5 py-3 shadow-lg ring-1 ${c.ring} dark:border-slate-800 dark:bg-slate-900`}
                                role="status"
                            >
                                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${c.accent}`} />
                                <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{t.message}</p>
                                <button
                                    type="button"
                                    onClick={() => dismiss(t.id)}
                                    aria-label="Dismiss"
                                    className="shrink-0 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <FiX className="h-4 w-4" />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within a ToastProvider");
    return ctx;
};
