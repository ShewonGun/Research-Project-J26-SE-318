import { useState } from "react";
import { FiX, FiBell, FiSend } from "react-icons/fi";

export default function DigitalTwinAlertModal({ open, onClose, onDispatch }) {
  const [targetType, setTargetType] = useState("Zone");
  const [targetId, setTargetId] = useState("Zone A");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("info");
  const [message, setMessage] = useState("");

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    const alertObj = {
      id: `DTA-${Date.now().toString().slice(-4)}`,
      targetType,
      targetId,
      title: title.trim(),
      message: message.trim(),
      severity,
      status: "active",
      timestamp: new Date().toISOString(),
    };

    onDispatch(alertObj);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
              <FiBell className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Add Local Operator Note
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Stored in this browser only; not automatic telemetry or an external notification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xs p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Target Entity
              </label>
              <select
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value);
                  setTargetId(e.target.value === "Zone" ? "Zone A" : "H001");
                }}
                className="mt-1 w-full rounded-xs border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="Zone">Zone</option>
                <option value="Household">Household</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Target ID
              </label>
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={targetType === "Zone" ? "Zone A" : "H001"}
                required
                className="mt-1 w-full rounded-xs border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Severity Level
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="mt-1 w-full rounded-xs border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Alert Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1 w-full rounded-xs border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Notification Message
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              className="mt-1 w-full rounded-xs border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xs bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xs bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 shadow-xs"
            >
              <FiSend className="h-3.5 w-3.5" /> Save Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
