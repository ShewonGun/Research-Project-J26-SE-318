import express from "express";
import { getGoal, setGoal, clearGoal } from "../controllers/goalController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getGoal);
router.put("/", setGoal);
router.delete("/", clearGoal);

export default router;
