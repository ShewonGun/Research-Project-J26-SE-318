import mongoose from "mongoose";

/**
 * A household's request to move a connection between prepaid and postpaid.
 * Users can't switch on their own — an admin approves or rejects the request,
 * and only approval actually changes Device.billingMode.
 */
const billingModeRequestSchema = new mongoose.Schema(
    {
        device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        // Snapshot of the mode when the request was made.
        fromMode: { type: String, enum: ["prepaid", "postpaid"], required: true },
        toMode: { type: String, enum: ["prepaid", "postpaid"], required: true },
        reason: { type: String, trim: true, maxlength: 500 }, // household's note
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "cancelled"],
            default: "pending",
        },
        adminNote: { type: String, trim: true, maxlength: 500 }, // reason for the decision
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        decidedAt: { type: Date },
    },
    { timestamps: true }
);

billingModeRequestSchema.index({ device: 1, status: 1 });

const BillingModeRequest = mongoose.model("BillingModeRequest", billingModeRequestSchema);

export default BillingModeRequest;
