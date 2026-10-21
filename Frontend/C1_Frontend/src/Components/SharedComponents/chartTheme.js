import { useTheme } from "../../Context/ThemeContext.jsx";

// Shared Recharts styling that adapts to light/dark theme. Returns axis/grid
// colors plus ready-to-spread Tooltip props.
export const useChartTheme = () => {
    const { theme } = useTheme();
    const dark = theme === "dark";
    return {
        dark,
        tick: dark ? "#64748b" : "#94a3b8", // slate-500 / slate-400
        grid: dark ? "#1e293b" : "#f1f5f9", // slate-800 / slate-100
        tooltip: {
            contentStyle: {
                background: dark ? "#0f172a" : "#ffffff",
                border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`,
                borderRadius: "8px",
                fontSize: "12px",
                padding: "6px 10px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
            },
            labelStyle: { color: dark ? "#94a3b8" : "#64748b", marginBottom: 2 },
            itemStyle: { color: dark ? "#e2e8f0" : "#0f172a" },
        },
    };
};
