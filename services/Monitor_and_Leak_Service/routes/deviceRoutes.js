import express from "express";
import {
    createDevice,
    getDevices,
    getDeviceById,
    updateDevice,
    setValve,
    changeBillingMode,
    deleteDevice,
} from "../controllers/deviceController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect); // all device routes require a logged-in user

router.post("/", createDevice);
router.get("/", getDevices);
router.get("/:id", getDeviceById);
router.put("/:id", updateDevice);
router.put("/:id/valve", setValve);
router.put("/:id/billing-mode", changeBillingMode);
router.delete("/:id", deleteDevice);

export default router;
