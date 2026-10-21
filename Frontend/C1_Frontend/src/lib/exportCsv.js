// Download an array of flat objects as a CSV file (fully client-side).
// Column headers are taken from the keys of the first row. Values are escaped
// per RFC 4180, and a BOM is prepended so Excel reads UTF-8 correctly.
const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportCsv = (filename, rows) => {
    if (!rows || rows.length === 0) return false;
    const headers = Object.keys(rows[0]);
    const body = [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ].join("\n");

    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
};

// Today's date as YYYY-MM-DD, handy for filenames.
export const dateStamp = () => new Date().toISOString().slice(0, 10);

// Wrap a plain date string (e.g. "2026-09-30") so spreadsheet apps keep it as
// literal text instead of auto-detecting it as a date and reformatting it per
// the system locale (or collapsing it to a serial number).
export const csvDateText = (isoDate) => `="${isoDate}"`;
