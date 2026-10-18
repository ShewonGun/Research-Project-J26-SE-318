import express from "express";
import { getAlerts, acknowledgeAlert, resolveAlert } from "../controllers/alertController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getAlerts);
router.put("/:id/acknowledge", acknowledgeAlert);
router.put("/:id/resolve", resolveAlert);

export default router;
