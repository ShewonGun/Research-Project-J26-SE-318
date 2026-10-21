// AquaFlow water loading screen: a droplet that continuously fills with rising,
// waving water. Uses the same SVG clip + wave technique as WaterPulse so it stays
// on-brand. `fullscreen` renders a centered boot splash; otherwise it's inline.
const DROP = "M50 6 C 62 34, 86 54, 86 78 A 36 36 0 1 1 14 78 C 14 54, 38 34, 50 6 Z";

const WaterLoader = ({ fullscreen = false, page = false, center = false, label = "Loading", showWordmark, size }) => {
    const big = fullscreen || page; // boot splash + `page` use the large droplet + wordmark; `center` stays small
    const wordmark = showWordmark ?? big;
    const w = size ?? (big ? 104 : 72);
    const h = Math.round(w * 1.2);
    const content = (
        <div className="flex flex-col items-center">
            <style>{`
                @keyframes wlWave { to { transform: translateX(-100px); } }
                @keyframes wlRise { 0%, 100% { transform: translateY(82px); } 50% { transform: translateY(16px); } }
                @keyframes wlBub  { 0% { transform: translateY(0); opacity: 0; } 25% { opacity: .7; } 100% { transform: translateY(-46px); opacity: 0; } }
                @keyframes wlDots { 0%, 20% { opacity: .2; } 50% { opacity: 1; } 80%, 100% { opacity: .2; } }
                .wl-wave1 { animation: wlWave 2.6s linear infinite; }
                .wl-wave2 { animation: wlWave 4.4s linear infinite; }
                .wl-rise  { animation: wlRise 3.4s ease-in-out infinite; }
                .wl-bub   { animation: wlBub 3s ease-in infinite; }
                .wl-dot   { animation: wlDots 1.4s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) {
                    .wl-wave1, .wl-wave2, .wl-rise, .wl-bub, .wl-dot { animation: none; }
                    .wl-rise { transform: translateY(40px); }
                }
            `}</style>

            <svg width={w} height={h} viewBox="0 0 100 120" role="img" aria-label="Loading">
                <defs>
                    <clipPath id="wl-drop">
                        <path d={DROP} />
                    </clipPath>
                    <linearGradient id="wl-water" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#38bdf8" />
                        <stop offset="1" stopColor="#0284c7" />
                    </linearGradient>
                </defs>

                {/* Empty interior */}
                <path d={DROP} className="fill-slate-100 dark:fill-slate-800" />

                {/* Rising, waving water */}
                <g clipPath="url(#wl-drop)">
                    <g className="wl-rise">
                        <path
                            className="wl-wave2"
                            d="M0,12 C25,22 75,2 100,12 C125,22 175,2 200,12 L200,300 L0,300 Z"
                            fill="url(#wl-water)"
                            opacity="0.55"
                        />
                        <path
                            className="wl-wave1"
                            d="M0,12 C25,2 75,22 100,12 C125,2 175,22 200,12 L200,300 L0,300 Z"
                            fill="url(#wl-water)"
                        />
                        {/* Bubbles rising through the body */}
                        <circle className="wl-bub" cx="38" cy="60" r="2.5" fill="#ffffff" opacity="0.5" style={{ animationDelay: "0s" }} />
                        <circle className="wl-bub" cx="60" cy="66" r="2" fill="#ffffff" opacity="0.5" style={{ animationDelay: "1.1s" }} />
                        <circle className="wl-bub" cx="50" cy="58" r="1.6" fill="#ffffff" opacity="0.5" style={{ animationDelay: "2s" }} />
                    </g>
                </g>

                {/* Droplet outline */}
                <path d={DROP} fill="none" strokeWidth="2.5" className="stroke-sky-500/70 dark:stroke-sky-400/70" />
            </svg>

            {wordmark && (
                <p className="mt-5 text-base font-semibold tracking-tight text-slate-900 dark:text-white">AquaFlow</p>
            )}
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                {label}
                <span className="wl-dot" style={{ animationDelay: "0s" }}>.</span>
                <span className="wl-dot" style={{ animationDelay: "0.2s" }}>.</span>
                <span className="wl-dot" style={{ animationDelay: "0.4s" }}>.</span>
            </p>
        </div>
    );

    if (fullscreen) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                {content}
            </div>
        );
    }
    // `page` (large + wordmark) and `center` (small, animation only) both sit in
    // the middle of the content area.
    if (page || center) {
        return <div className="flex min-h-[65vh] items-center justify-center">{content}</div>;
    }
    return <div className="flex items-center justify-center py-12">{content}</div>;
};

export default WaterLoader;
