import express from "express";
import {
    purchaseSubscription,
    getSubscriptions,
    getSubscriptionById,
    cancelSubscription,
} from "../controllers/subscriptionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/", purchaseSubscription);
router.get("/", getSubscriptions);
router.get("/:id", getSubscriptionById);
router.delete("/:id", cancelSubscription);

export default router;
