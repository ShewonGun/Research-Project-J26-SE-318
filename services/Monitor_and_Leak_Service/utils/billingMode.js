import Subscription from "../models/Subscription.js";
import Bill from "../models/Bill.js";

// Guardrails that keep billing consistent across a prepaid ⇄ postpaid switch.
//   → postpaid : blocked while a prepaid plan is still active.
//   → prepaid  : blocked while any bill is unpaid/overdue.
// Returns an error message, or null if the switch is allowed.
export const billingModeBlocker = async (device, toMode) => {
    if (toMode === "postpaid") {
        const activeSub = await Subscription.findOne({ device: device._id, status: "active" });
        if (activeSub) {
            return "An active prepaid plan must be used up or cancelled before switching to postpaid.";
        }
    } else {
        const outstanding = await Bill.countDocuments({
            device: device._id,
            status: { $in: ["unpaid", "overdue"] },
        });
        if (outstanding > 0) return "Outstanding bills must be settled before switching to prepaid.";
    }
    return null;
};

// Perform the switch (caller has already checked billingModeBlocker) and save.
//   → postpaid : flows freely — provider gate restored.
//   → prepaid  : the un-invoiced open cycle is discarded and the gate is closed
//                until a plan is bought.
export const applyBillingMode = async (device, toMode) => {
    if (toMode === "postpaid") {
        device.billingMode = "postpaid";
        device.adminValveState = "open";
        device.throttlePercent = 100;
    } else {
        await Bill.deleteMany({ device: device._id, status: "open" });
        device.billingMode = "prepaid";
        device.adminValveState = "closed";
        device.throttlePercent = 0;
    }
    await device.save();
    return device;
};
