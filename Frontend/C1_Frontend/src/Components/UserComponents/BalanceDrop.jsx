import { motion } from "motion/react";

// A creative water-balance visual: the litre figures sit beside a wide reservoir
// panel whose animated water level rises/falls with the share of plan remaining,
// filling the width of the card with measurement ticks like a real tank gauge.
const BalanceDrop = ({ remaining, total, ratio, low, expiresAt }) => {
    const clamped = Math.max(0, Math.min(1, ratio || 0));
    const pct = Math.round(clamped * 100);
    const water = low ? "#f59e0b" : "#0ea5e9";

    return (
        <div className="mt-4 flex flex-1 flex-col gap-4">
            <style>{`
                @keyframes bdFlow { to { transform: translateX(-50%); } }
                @keyframes bdRise { 0% { transform: translateY(0); opacity: 0; } 25% { opacity: .6; } 100% { transform: translateY(-70px); opacity: 0; } }
                .bd-wave1 { animation: bdFlow 3s linear infinite; }
                .bd-wave2 { animation: bdFlow 5s linear infinite; }
                .bd-bubble { animation: bdRise ease-in infinite; }
                @media (prefers-reduced-motion: reduce) { .bd-wave1,.bd-wave2,.bd-bubble { animation: none; } }
            `}</style>

            {/* Figures */}
            <div className="flex flex-col justify-center">
                <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">{Number(remaining).toFixed(0)}</span>
                    <span className="text-sm text-slate-400 dark:text-slate-500">L</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">of {Number(total).toLocaleString()} L</p>
                <p className={`mt-2 text-sm font-semibold ${low ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"}`}>
                    {pct}% remaining
                </p>
                {expiresAt && (
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        Valid until {new Date(expiresAt).toLocaleDateString()}
                    </p>
                )}
            </div>

            {/* Reservoir panel */}
            <div className="relative min-h-37.5 flex-1 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
                {/* Measurement ticks */}
                {[75, 50, 25].map((v) => (
                    <div key={v} className="absolute inset-x-0 flex items-center gap-2 px-3" style={{ bottom: `${v}%` }}>
                        <div className="h-px flex-1 border-t border-dashed border-slate-200/80 dark:border-slate-700/70" />
                        <span className="text-[10px] text-slate-300 dark:text-slate-600">{v}</span>
                    </div>
                ))}

                {/* Water — level springs on change */}
                <motion.div
                    className="absolute inset-x-0 bottom-0"
                    style={{ backgroundColor: water }}
                    initial={{ height: "0%" }}
                    animate={{ height: `${clamped * 100}%` }}
                    transition={{ type: "spring", stiffness: 90, damping: 18 }}
                >
                    {/* Animated crest (two layered waves) */}
                    <svg className="bd-wave2 absolute -top-3.25 left-0 h-4 w-[200%]" viewBox="0 0 200 20" preserveAspectRatio="none">
                        <path d="M0,12 q25,-8 50,0 t50,0 t50,0 t50,0 L200,20 L0,20 Z" fill={water} opacity="0.55" />
                    </svg>
                    <svg className="bd-wave1 absolute -top-3.25 left-0 h-4 w-[200%]" viewBox="0 0 200 20" preserveAspectRatio="none">
                        <path d="M0,10 q25,8 50,0 t50,0 t50,0 t50,0 L200,20 L0,20 Z" fill={water} />
                    </svg>

                    {/* Rising bubbles */}
                    {clamped > 0 &&
                        [
                            { x: "12%", s: 5, dur: "4s", d: "0s" },
                            { x: "28%", s: 3, dur: "3.2s", d: "1.4s" },
                            { x: "48%", s: 6, dur: "4.6s", d: "0.6s" },
                            { x: "66%", s: 4, dur: "3.6s", d: "2.1s" },
                            { x: "84%", s: 3, dur: "4.2s", d: "1s" },
                        ].map((b, i) => (
                            <span
                                key={i}
                                className="bd-bubble absolute bottom-1 rounded-full bg-white/40"
                                style={{ left: b.x, width: b.s, height: b.s, animationDuration: b.dur, animationDelay: b.d }}
                            />
                        ))}
                </motion.div>

                {/* Corner reading */}
                <span className="absolute right-3 top-2.5 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold text-slate-900 backdrop-blur-sm dark:bg-slate-900/50 dark:text-white">
                    {pct}%
                </span>
            </div>
        </div>
    );
};

export default BalanceDrop;
