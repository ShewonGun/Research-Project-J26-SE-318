import { motion } from "motion/react";
import { FiLock } from "react-icons/fi";

// A creative "water tank" control: a rounded tank fills to the flow level with
// moving waves + rising bubbles, and a slide switch opens / shuts the tap.
//   open      → tank fills blue (100%)
//   throttled → fills amber to the throttle %
//   closed    → drains (0%); provider-lock disables the switch
const W = 128;
const H = 176;

const WaterGauge = ({ device, onToggle }) => {
    const locked = device.adminValveState === "closed"; // provider shut — user can't override
    const state = device.effectiveValveState; // open | throttled | closed
    const userOff = device.userValveState === "closed";
    const pct = locked ? 0 : Math.round(device.effectiveThrottle ?? (state === "open" ? 100 : 0));
    const fraction = pct / 100;

    const water =
        locked ? "#94a3b8" : state === "open" ? "#0ea5e9" : state === "throttled" ? "#f59e0b" : "#ef4444";

    const caption = state === "open" ? "Water on" : state === "throttled" ? "Restricted" : "Shut off";
    const helper = locked
        ? "Disabled by your provider"
        : userOff
        ? "Slide to turn on your water"
        : "Slide to shut off your water";

    const on = !userOff && !locked; // switch reflects the household tap
    const levelY = (1 - fraction) * H; // translate the water body down as it empties

    return (
        <div className="flex flex-col items-center">
            <style>{`
                @keyframes wgWave { to { transform: translateX(-120px); } }
                @keyframes wgRise { 0% { transform: translateY(0); opacity: 0; } 25% { opacity: .7; } 100% { transform: translateY(-130px); opacity: 0; } }
                .wg-wave1 { animation: wgWave 3s linear infinite; }
                .wg-wave2 { animation: wgWave 6s linear infinite; }
                .wg-bubble { animation: wgRise 4.5s ease-in infinite; }
                @media (prefers-reduced-motion: reduce) { .wg-wave1,.wg-wave2,.wg-bubble { animation: none; } }
            `}</style>

            <div className="relative" style={{ width: W, height: H }}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                    <defs>
                        <clipPath id="wg-tank">
                            <rect x="0" y="0" width={W} height={H} rx="26" />
                        </clipPath>
                    </defs>

                    {/* Tank interior */}
                    <rect x="0" y="0" width={W} height={H} rx="26" className="fill-slate-50 dark:fill-slate-800/50" />

                    {/* Water (clipped to the tank) — level springs on change */}
                    <g clipPath="url(#wg-tank)">
                        <motion.g
                            initial={{ y: H }}
                            animate={{ y: levelY }}
                            transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        >
                            {state !== "closed" && (
                                <>
                                    <path className="wg-wave2" d="M0,14 C30,4 98,24 120,14 C150,4 218,24 240,14 L240,240 L0,240 Z" fill={water} opacity="0.5" />
                                    <path className="wg-wave1" d="M0,14 C30,24 98,4 120,14 C150,24 218,4 240,14 L240,240 L0,240 Z" fill={water} opacity="0.9" />
                                </>
                            )}
                            {/* Rising bubbles */}
                            {state !== "closed" &&
                                [
                                    { x: 34, r: 3, d: "0s" },
                                    { x: 74, r: 2, d: "1.2s" },
                                    { x: 96, r: 2.5, d: "2.4s" },
                                    { x: 54, r: 2, d: "3.1s" },
                                ].map((b, i) => (
                                    <circle key={i} className="wg-bubble" cx={b.x} cy="150" r={b.r} fill="#ffffff" opacity="0.5" style={{ animationDelay: b.d }} />
                                ))}
                        </motion.g>
                    </g>

                    {/* Tank outline */}
                    <rect x="1" y="1" width={W - 2} height={H - 2} rx="25" fill="none" strokeWidth="2" className="stroke-slate-200 dark:stroke-slate-700" />
                </svg>

                {/* Reading chip */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="rounded-full bg-white/75 px-3 py-1 text-2xl font-bold tracking-tight text-slate-900 backdrop-blur-sm dark:bg-slate-900/60 dark:text-white">
                        {pct}%
                    </span>
                    <span className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">flow</span>
                </div>
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{caption}</p>

            {/* Slide switch */}
            {locked ? (
                <div className="mt-3 flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <FiLock className="h-3.5 w-3.5" /> Locked by provider
                </div>
            ) : (
                <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={onToggle}
                    aria-label={userOff ? "Turn on my water" : "Shut off my water"}
                    className={`mt-3 flex h-9 w-16 items-center rounded-full p-1 transition-colors ${
                        on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                >
                    <motion.span
                        animate={{ x: on ? 28 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md"
                    />
                </button>
            )}

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
    );
};

export default WaterGauge;
