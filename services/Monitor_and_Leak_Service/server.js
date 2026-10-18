import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/dbConfig.js";
import { initSocket } from "./config/socket.js";
import userRoutes from "./routes/userRoutes.js";
import waterPackageRoutes from "./routes/waterPackageRoutes.js";
import deviceRoutes from "./routes/deviceRoutes.js";
import readingRoutes from "./routes/readingRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import tariffRoutes from "./routes/tariffRoutes.js";
import billRoutes from "./routes/billRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import forecastRoutes from "./routes/forecastRoutes.js";
import goalRoutes from "./routes/goalRoutes.js";
import billingRequestRoutes from "./routes/billingRequestRoutes.js";
import { startDeviceWatchdog } from "./utils/deviceWatchdog.js";
import { startModelLeakDetection } from "./utils/modelLeakDetection.js";

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Backend is running!");
});

app.use("/api/users", userRoutes);
app.use("/api/water-packages", waterPackageRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/readings", readingRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/tariff", tariffRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/billing-requests", billingRequestRoutes);

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startDeviceWatchdog();
    startModelLeakDetection();
});