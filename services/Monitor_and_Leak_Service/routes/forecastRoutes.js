import express from "express";
import { getForecast, getNetworkForecast } from "../controllers/forecastController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getForecast);
router.get("/network", protect, authorize("admin"), getNetworkForecast);

export default router;
