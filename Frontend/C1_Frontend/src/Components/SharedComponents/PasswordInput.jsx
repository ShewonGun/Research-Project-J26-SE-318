import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

// Password field with a show/hide toggle. Spreads through any input props
// (value, onChange, placeholder, autoComplete, required…). `className` styles
// the underlying input; the toggle button is overlaid on the right.
const PasswordInput = ({ className = "", ...props }) => {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <input
                {...props}
                type={visible ? "text" : "password"}
                className={`${className} pr-10`}
            />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            >
                {visible ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
            </button>
        </div>
    );
};

export default PasswordInput;
