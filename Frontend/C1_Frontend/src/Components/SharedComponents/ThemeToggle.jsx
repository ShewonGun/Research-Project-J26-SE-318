import { FiSun, FiMoon } from "react-icons/fi";
import { useTheme } from "../../Context/ThemeContext.jsx";

const ThemeToggle = ({ className = "" }) => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-sm border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white ${className}`}
        >
            {isDark ? <FiSun className="w-3 h-3" /> : <FiMoon className="w-3 h-3" />}
        </button>
    );
};

export default ThemeToggle;
