import { io } from "socket.io-client";
import { API_URL } from "./api.js";

let socket = null;

// Lazily create (or return) the shared Socket.IO connection, authenticated
// with the current JWT. Safe to call repeatedly — later calls just return the
// existing connection. Call once the user is known to be logged in.
export const connectSocket = () => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    if (socket) return socket;
    socket = io(API_URL, { auth: { token } });
    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    socket?.disconnect();
    socket = null;
};
