import mongoose from "mongoose";

/**
 * A prepaid subscription: a household buys a WaterPackage for a Device.
 * Consumption (from telemetry) is drawn down against volumeRemaining, and the
 * valve is enforced automatically as the balance runs low / out.
 */
const subscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        device: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Device",
            required: true,
        },
        package: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WaterPackage",
            required: true,
        },
        // Snapshot of the plan at purchase time (packages may change later).
        volumeTotal: { type: Number, required: true }, // litres granted
        volumeRemaining: { type: Number, required: true }, // litres left
        price: { type: Number, required: true }, // LKR paid

        status: {
            type: String,
            enum: ["active", "exhausted", "expired", "cancelled"],
            default: "active",
        },
        startedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
    },
    { timestamps: true }
);

// Fast lookup of a device's active subscription during ingestion.
subscriptionSchema.index({ device: 1, status: 1 });

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
