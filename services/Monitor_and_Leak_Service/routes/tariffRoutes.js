import express from "express";
import { getTariff, updateTariff } from "../controllers/tariffController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getTariff);
router.put("/", protect, authorize("admin"), updateTariff);

export default router;
