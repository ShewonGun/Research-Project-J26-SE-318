// Shared Recharts styling that adapts to light/dark theme
export const getChartTheme = (isDark = false) => {
  return {
    dark: isDark,
    tick: isDark ? "#64748b" : "#94a3b8",
    grid: isDark ? "#1e293b" : "#f1f5f9",
    tooltip: {
      contentStyle: {
        backgroundColor: isDark ? "#0f172a" : "#ffffff",
        border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
        borderRadius: "6px",
        fontSize: "12px",
        padding: "6px 10px",
        boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
      },
      labelStyle: { color: isDark ? "#94a3b8" : "#64748b", marginBottom: 2 },
      itemStyle: { color: isDark ? "#e2e8f0" : "#0f172a" },
    },
  };
};
