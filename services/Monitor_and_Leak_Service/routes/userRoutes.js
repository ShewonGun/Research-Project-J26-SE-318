import express from "express";
import {
    registerUser,
    createAdmin,
    loginUser,
    getProfile,
    updateProfile,
    getUsers,
    getUserById,
    deleteUser,
} from "../controllers/userController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public
router.post("/register", registerUser);
router.post("/login", loginUser);

// Authenticated user's own profile
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);

// Admin only
router.post("/admins", protect, authorize("admin"), createAdmin);
router.get("/", protect, authorize("admin"), getUsers);
router.get("/:id", protect, authorize("admin"), getUserById);
router.delete("/:id", protect, authorize("admin"), deleteUser);

export default router;
