import express from "express";
import { ingestReading, getDeviceState, getReadings, getFlowSeries, getUsage, getNetworkUsage } from "../controllers/readingController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: devices push telemetry (identified by deviceId in the body).
router.post("/", ingestReading);
// Public: a device reads its own current valve state on connect (no reading logged).
router.get("/state", getDeviceState);

// Private: query telemetry.
router.get("/", protect, getReadings);
router.get("/series", protect, getFlowSeries);
router.get("/network-usage", protect, authorize("admin"), getNetworkUsage);
router.get("/usage", protect, getUsage);

export default router;
