import express from "express";
import {
    createPackage,
    getPackages,
    getPackageById,
    updatePackage,
    deletePackage,
} from "../controllers/waterPackageController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: browse available packages
router.get("/", getPackages);
router.get("/:id", getPackageById);

// Admin only: manage packages
router.post("/", protect, authorize("admin"), createPackage);
router.put("/:id", protect, authorize("admin"), updatePackage);
router.delete("/:id", protect, authorize("admin"), deletePackage);

export default router;
