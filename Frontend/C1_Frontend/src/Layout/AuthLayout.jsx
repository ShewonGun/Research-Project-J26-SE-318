import { useState, useEffect } from "react";
import { FiDroplet } from "react-icons/fi";
import ThemeToggle from "../Components/SharedComponents/ThemeToggle.jsx";
import waterPhoto1 from "../assets/Water-Photo-1.jpg";
import waterPhoto2 from "../assets/Water-Photo-2.jpeg";
import waterPhoto3 from "../assets/Water-Photo-3.jpg";

const slides = [waterPhoto1, waterPhoto2, waterPhoto3];

// Shared shell for the Login/Signup screens — the photo slideshow, brand
// panel, and form frame are identical between the two; only the form
// content (passed as children) and heading copy differ.
const AuthLayout = ({ title, subtitle, footer, children }) => {
    const [slide, setSlide] = useState(0);

    // Auto-advance the background photo every 5 seconds.
    useEffect(() => {
        const id = setInterval(() => {
            setSlide((s) => (s + 1) % slides.length);
        }, 5000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="min-h-screen flex bg-white dark:bg-slate-950">
            {/* ── Left: image / brand panel (hidden on small screens) ── */}
            <div className="relative hidden lg:flex lg:w-[70%] overflow-hidden">
                {/* Background photo slideshow (crossfade) */}
                {slides.map((src, i) => (
                    <img
                        key={i}
                        src={src}
                        alt=""
                        aria-hidden="true"
                        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
                            i === slide ? "opacity-100" : "opacity-0"
                        }`}
                    />
                ))}
                {/* Dark gradient overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-t from-slate-950/85 via-slate-900/45 to-slate-900/25 dark:from-black/90 dark:via-black/55 dark:to-black/40" />

                {/* Content — brand title at top, tagline at the bottom */}
                <div className="relative z-10 flex w-full flex-col justify-between p-10 text-white">
                    <div className="flex items-center gap-3">
                        <div>
                            <FiDroplet className="h-6 w-6" />
                        </div>
                        <span className="text-xl font-semibold tracking-tight">AquaFlow</span>
                    </div>

                    <div className="max-w-md">
                        <h2 className="text-3xl font-semibold leading-snug">
                            Smart water management
                        </h2>
                        <p className="mt-3 text-white/75">
                            Monitor usage, manage prepaid plans, and stay in control from one place.
                        </p>
                    </div>
                </div>

                {/* Slideshow indicators — bottom-right corner */}
                <div className="absolute bottom-10 right-10 z-10 flex gap-2">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setSlide(i)}
                            aria-label={`Show image ${i + 1}`}
                            className={`h-1.5 rounded-full transition-all ${
                                i === slide ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                            }`}
                        />
                    ))}
                </div>
            </div>

            {/* ── Right: form panel ── */}
            <div className="relative flex flex-1 items-center justify-center p-6 sm:p-12">
                {/* Theme toggle */}
                <div className="absolute top-5 right-5">
                    <ThemeToggle />
                </div>

                <div className="w-full max-w-sm">
                    {/* Mobile logo (brand panel hidden on small screens) */}
                    <div className="mb-8 flex items-center gap-3 lg:hidden">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                            <FiDroplet className="h-5 w-5" />
                        </div>
                        <span className="text-lg font-semibold text-slate-800 dark:text-white">AquaFlow</span>
                    </div>

                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h2>
                    <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>

                    {children}

                    {footer}

                    <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
                        Smart Water Monitoring
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;
