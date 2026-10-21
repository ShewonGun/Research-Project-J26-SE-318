import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../lib/api.js";
import { connectSocket } from "../lib/socket.js";

// If we just refreshed (e.g. because our own action changed something), an
// incoming socket event for that same change is almost always just an echo of
// what we already have — skip it to avoid double-fetching.
const ECHO_WINDOW_MS = 1500;

const MyWaterContext = createContext(null);

// Provides the household's primary device + its billing state (prepaid
// subscription OR postpaid bill) + 7-day usage, polled live, plus helpers to
// control the valve and pay bills. Shared across consumer pages.
export const MyWaterProvider = ({ children }) => {
    const [device, setDevice] = useState(null);
    const [sub, setSub] = useState(null); // prepaid
    const [bill, setBill] = useState(null); // postpaid: current open cycle
    const [estimate, setEstimate] = useState(null); // postpaid: live charge so far
    const [bills, setBills] = useState([]); // postpaid: history
    const [usage, setUsage] = useState(null);
    const [alerts, setAlerts] = useState([]); // active/acknowledged leak alerts
    const [modeRequests, setModeRequests] = useState([]); // prepaid ⇄ postpaid requests, newest first
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const lastRefreshAt = useRef(0);
    const deviceId = device?._id;
    const billIdRef = useRef(null); // open cycle's id, read by the live bill listener
    billIdRef.current = bill?._id ? String(bill._id) : null;

    const refresh = useCallback(async (silent = false) => {
        lastRefreshAt.current = Date.now();
        if (!silent) setLoading(true);
        try {
            const devData = await apiFetch("/api/devices");
            const primary = (devData.devices || [])[0] || null;
            setDevice(primary);

            if (primary) {
                const postpaid = primary.billingMode === "postpaid";
                const [subData, usageData, currentData, billsData, alertsData, requestsData] = await Promise.all([
                    postpaid
                        ? Promise.resolve({ subscriptions: [] })
                        : apiFetch(`/api/subscriptions?device=${primary._id}`).catch(() => ({ subscriptions: [] })),
                    apiFetch(`/api/readings/usage?device=${primary._id}&days=7`).catch(() => ({ daily: [], total: 0 })),
                    postpaid
                        ? apiFetch(`/api/bills/current?device=${primary._id}`).catch(() => ({ bill: null, estimate: null }))
                        : Promise.resolve({ bill: null, estimate: null }),
                    postpaid
                        ? apiFetch(`/api/bills?device=${primary._id}`).catch(() => ({ bills: [] }))
                        : Promise.resolve({ bills: [] }),
                    apiFetch(`/api/alerts?device=${primary._id}&status=active,acknowledged`).catch(() => ({ alerts: [] })),
                    apiFetch(`/api/billing-requests?device=${primary._id}`).catch(() => ({ requests: [] })),
                ]);
                setSub((subData.subscriptions || [])[0] || null);
                setUsage(usageData);
                setBill(currentData.bill || null);
                setEstimate(currentData.estimate || null);
                setBills(billsData.bills || []);
                setAlerts(alertsData.alerts || []);
                setModeRequests(requestsData.requests || []);
            } else {
                setSub(null);
                setUsage(null);
                setBill(null);
                setEstimate(null);
                setBills([]);
                setAlerts([]);
                setModeRequests([]);
            }
            setError("");
        } catch (err) {
            if (!silent) setError(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        // Safety-net poll in case a socket event is ever missed/disconnected —
        // the socket subscription below is what actually keeps this live.
        const id = setInterval(() => refresh(true), 60000);
        return () => clearInterval(id);
    }, [refresh]);

    // Once we know which device is ours, join its room and refetch the whole
    // bundle whenever something meaningful changes (valve state, a new/cleared
    // alert). Raw per-reading updates deliberately don't trigger this — only
    // FlowChart needs that frequency.
    useEffect(() => {
        if (!deviceId) return;
        const socket = connectSocket();
        if (!socket) return;

        const onChange = () => {
            if (Date.now() - lastRefreshAt.current < ECHO_WINDOW_MS) return;
            refresh(true);
        };

        // Postpaid: every reading pushes the open cycle's running litres + live
        // charge — patch it in place. A different bill id means the cycle was
        // just closed and a new one opened, so refetch to pick up the new bill.
        const onBill = (data) => {
            if (data.deviceId !== String(deviceId)) return;
            if (billIdRef.current && billIdRef.current !== data.bill._id) {
                refresh(true);
                return;
            }
            setBill((prev) => ({ ...prev, ...data.bill }));
            setEstimate(data.estimate);
        };

        socket.emit("device:join", deviceId);
        socket.on("bill:updated", onBill);
        socket.on("device:updated", onChange);
        socket.on("alert:new", onChange);
        socket.on("alert:updated", onChange);
        socket.on("billing-request:changed", onChange);

        return () => {
            socket.emit("device:leave", deviceId);
            socket.off("bill:updated", onBill);
            socket.off("device:updated", onChange);
            socket.off("alert:new", onChange);
            socket.off("alert:updated", onChange);
            socket.off("billing-request:changed", onChange);
        };
    }, [deviceId, refresh]);

    // Both depend on the device *id*, not the object — `device` gets a new
    // reference on every refresh, and nothing here needs more than the id.
    const setValve = useCallback(
        async (state) => {
            if (!deviceId) return;
            const data = await apiFetch(`/api/devices/${deviceId}/valve`, { method: "PUT", body: { state } });
            setDevice((d) => ({ ...d, ...data.device }));
        },
        [deviceId]
    );

    const payBill = useCallback(async (id) => {
        await apiFetch(`/api/bills/${id}/pay`, { method: "PUT" });
        await refresh(true);
    }, [refresh]);

    // Ask to switch prepaid ⇄ postpaid. The switch itself needs admin approval, so
    // this only files a request. Throws (with the server's guardrail message) if
    // a request isn't allowed right now.
    const requestMode = useCallback(async (billingMode, reason) => {
        if (!deviceId) return;
        await apiFetch(`/api/devices/${deviceId}/billing-mode`, { method: "PUT", body: { billingMode, reason } });
        await refresh(true);
    }, [deviceId, refresh]);

    const cancelModeRequest = useCallback(async (id) => {
        await apiFetch(`/api/billing-requests/${id}`, { method: "DELETE" });
        await refresh(true);
    }, [refresh]);

    const acknowledgeAlert = useCallback(async (id) => {
        await apiFetch(`/api/alerts/${id}/acknowledge`, { method: "PUT" });
        await refresh(true);
    }, [refresh]);

    const pendingModeRequest = modeRequests.find((r) => r.status === "pending") || null;
    // Most recent admin decision — shown so the household sees the outcome.
    const lastModeDecision = modeRequests.find((r) => r.status === "approved" || r.status === "rejected") || null;

    const mode = device?.billingMode === "postpaid" ? "postpaid" : "prepaid";

    const value = { device, mode, sub, bill, estimate, bills, usage, alerts, loading, error, refresh, setValve, payBill, requestMode, cancelModeRequest, pendingModeRequest, lastModeDecision, acknowledgeAlert };
    return <MyWaterContext.Provider value={value}>{children}</MyWaterContext.Provider>;
};

export const useMyWater = () => {
    const ctx = useContext(MyWaterContext);
    if (!ctx) throw new Error("useMyWater must be used within a MyWaterProvider");
    return ctx;
};
