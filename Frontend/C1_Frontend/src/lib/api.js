import { browserTimeZone } from "./dayKey.js";

const API_URL =import.meta.env.VITE_API_URL || "http://localhost:5000";

const authHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// Thin fetch wrapper: prefixes the API URL, attaches the JWT, sends/parses JSON,
// and throws an Error with the server message on non-2xx responses.
export async function apiFetch(path, { method = "GET", body } = {}) {
    // Usage totals are grouped per calendar day — tell the server which time zone
    // "a day" means for this browser (see backend utils/dayWindow.js).
    if (/^\/api\/readings\/(usage|network-usage)(\?|$)/.test(path) && !path.includes("tz=")) {
        path += `${path.includes("?") ? "&" : "?"}tz=${encodeURIComponent(browserTimeZone())}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data.message || "Request failed");
    }
    return data;
}

export { API_URL };
