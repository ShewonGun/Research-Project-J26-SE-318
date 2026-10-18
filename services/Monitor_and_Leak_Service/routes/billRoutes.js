import express from "express";
import { getCurrentBill, getBills, runBilling, payBill } from "../controllers/billController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/current", getCurrentBill);
router.get("/", getBills);
router.post("/run", authorize("admin"), runBilling);
router.put("/:id/pay", payBill);

export default router;
