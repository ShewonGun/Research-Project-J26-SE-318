import { motion } from "motion/react";
import { FiPower, FiLock } from "react-icons/fi";

// A modern water-flow orb: a round tap you press to open / shut. The orb is a
// circular tank that fills to the flow level with a gradient body, moving waves,
// bubbles and a glassy sheen; ripples radiate out while water flows.
const SIZE = 128;
const C = SIZE / 2;
const R = 62;

const WaterPulse = ({ device, onToggle }) => {
    const locked = device.adminValveState === "closed";
    const state = device.effectiveValveState; // open | throttled | closed
    const userOff = device.userValveState === "closed";
    const pct = locked ? 0 : Math.round(device.effectiveThrottle ?? (state === "open" ? 100 : 0));
    const fraction = pct / 100;
    const flowing = state !== "closed";

    // Water gradient (top → bottom) by state.
    const grad =
        state === "open" ? ["#38bdf8", "#0284c7"] : state === "throttled" ? ["#fbbf24", "#f59e0b"] : ["#cbd5e1", "#94a3b8"];
    const levelY = (1 - fraction) * SIZE;
    const rippleDur = flowing ? 2.2 / Math.max(fraction, 0.3) : 0;
    const rippleColor = state === "open" ? "border-sky-400/60" : "border-amber-400/60";
    const label = locked ? "LOCKED" : state === "open" ? "ON" : state === "throttled" ? "LOW" : "OFF";

    const caption = state === "open" ? "Water on" : state === "throttled" ? "Restricted" : "Shut off";
    const helper = locked
        ? "Disabled by your provider"
        : userOff
        ? "Tap to turn on your water"
        : "Tap to shut off your water";

    return (
        <div className="flex flex-col items-center">
            <style>{`
                @keyframes wpWave { to { transform: translateX(-128px); } }
                @keyframes wpRise { 0% { transform: translateY(0); opacity: 0; } 25% { opacity: .7; } 100% { transform: translateY(-80px); opacity: 0; } }
                .wp-wave1 { animation: wpWave 2.8s linear infinite; }
                .wp-wave2 { animation: wpWave 5s linear infinite; }
                .wp-bubble { animation: wpRise 3.8s ease-in infinite; }
                @media (prefers-reduced-motion: reduce) { .wp-wave1,.wp-wave2,.wp-bubble { animation: none; } }
            `}</style>

            <div className="relative flex h-52 w-52 items-center justify-center">
                {/* Ripples */}
                {flowing &&
                    [0, 1, 2].map((i) => (
                        <motion.span
                            key={i}
                            className={`absolute inset-0 rounded-full border-2 ${rippleColor}`}
                            initial={{ scale: 0.62, opacity: 0.55 }}
                            animate={{ scale: 1, opacity: 0 }}
                            transition={{ duration: rippleDur, repeat: Infinity, ease: "easeOut", delay: (i * rippleDur) / 3 }}
                        />
                    ))}

                {/* Water orb (tap) */}
                <button
                    type="button"
                    onClick={locked ? undefined : onToggle}
                    disabled={locked}
                    aria-label={userOff ? "Turn on my water" : "Shut off my water"}
                    className={`relative z-10 h-32 w-32 rounded-full transition active:scale-95 ${
                        locked ? "cursor-not-allowed" : "hover:brightness-105"
                    }`}
                >
                    <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
                        <defs>
                            <clipPath id="wp-orb">
                                <circle cx={C} cy={C} r={R} />
                            </clipPath>
                            <linearGradient id="wp-water" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor={grad[0]} />
                                <stop offset="1" stopColor={grad[1]} />
                            </linearGradient>
                        </defs>

                        {/* Empty interior */}
                        <circle cx={C} cy={C} r={R} className="fill-slate-100 dark:fill-slate-800" />

                        {/* Water */}
                        <g clipPath="url(#wp-orb)">
                            <g style={{ transform: `translateY(${levelY}px)`, transition: "transform 0.7s ease" }}>
                                {flowing && (
                                    <>
                                        <path className="wp-wave2" d="M0,14 C32,4 96,24 128,14 C160,4 224,24 256,14 L256,300 L0,300 Z" fill="url(#wp-water)" opacity="0.55" />
                                        <path className="wp-wave1" d="M0,14 C32,24 96,4 128,14 C160,24 224,4 256,14 L256,300 L0,300 Z" fill="url(#wp-water)" />
                                    </>
                                )}
                                {flowing &&
                                    [
                                        { x: 44, r: 3, d: "0s" },
                                        { x: 78, r: 2, d: "1s" },
                                        { x: 94, r: 2.5, d: "2s" },
                                        { x: 60, r: 2, d: "2.8s" },
                                    ].map((b, i) => (
                                        <circle key={i} className="wp-bubble" cx={b.x} cy="110" r={b.r} fill="#ffffff" opacity="0.5" style={{ animationDelay: b.d }} />
                                    ))}
                            </g>
                        </g>

                        {/* Rim */}
                        <circle cx={C} cy={C} r={R} fill="none" strokeWidth="3" className="stroke-slate-200 dark:stroke-slate-700" />
                    </svg>

                    {/* Center label */}
                    <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        {locked ? (
                            <FiLock className={`h-6 w-6 ${flowing ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                        ) : (
                            <FiPower className={`h-6 w-6 ${flowing ? "text-white drop-shadow" : "text-slate-500 dark:text-slate-400"}`} />
                        )}
                        <span className={`mt-1 text-sm font-bold tracking-widest ${flowing ? "text-white drop-shadow" : "text-slate-600 dark:text-slate-300"}`}>
                            {label}
                        </span>
                    </span>
                </button>
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
                {caption}
                {!locked && <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">· {pct}% flow</span>}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
    );
};

export default WaterPulse;
