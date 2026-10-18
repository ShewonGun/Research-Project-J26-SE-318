import express from "express";
import {
    getBillingRequests,
    approveBillingRequest,
    rejectBillingRequest,
    cancelBillingRequest,
} from "../controllers/billingRequestController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getBillingRequests);
router.put("/:id/approve", authorize("admin"), approveBillingRequest);
router.put("/:id/reject", authorize("admin"), rejectBillingRequest);
router.delete("/:id", cancelBillingRequest);

export default router;
