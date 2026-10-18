import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
    {
        // Hardware identifier reported by the ESP32 (e.g. MAC-based id).
        deviceId: {
            type: String,
            required: [true, "Device id is required"],
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            trim: true,
            default: "Water Meter",
        },
        // Household this device belongs to.
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        location: {
            type: String,
            trim: true,
        },
        // How this connection is billed:
        //   prepaid  → buy a WaterPackage up front; telemetry draws it down.
        //   postpaid → water flows freely; usage accrues to a monthly Bill.
        billingMode: {
            type: String,
            enum: ["prepaid", "postpaid"],
            default: "prepaid",
        },
        // Provider (utility) gate — set by admins and prepaid-quota enforcement.
        // May throttle. This is the authoritative supply valve.
        adminValveState: {
            type: String,
            enum: ["open", "closed", "throttled"],
            default: "open",
        },
        // Household tap — set by the consumer. On/off only.
        userValveState: {
            type: String,
            enum: ["open", "closed"],
            default: "open",
        },
        // Percentage of flow allowed when the provider gate is throttled (0–100).
        throttlePercent: {
            type: Number,
            min: 0,
            max: 100,
            default: 100,
        },
        status: {
            type: String,
            enum: ["online", "offline"],
            default: "offline",
        },
        lastSeen: {
            type: Date,
        },
    },
    { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Water flows only if BOTH valves allow it. Either side closed → no flow.
// The provider gate takes precedence for throttling.
deviceSchema.virtual("effectiveValveState").get(function () {
    if (this.adminValveState === "closed" || this.userValveState === "closed") return "closed";
    if (this.adminValveState === "throttled") return "throttled";
    return "open";
});

// The effective flow percentage the device should apply.
deviceSchema.virtual("effectiveThrottle").get(function () {
    const s = this.effectiveValveState;
    if (s === "closed") return 0;
    if (s === "throttled") return this.throttlePercent;
    return 100;
});

const Device = mongoose.model("Device", deviceSchema);

export default Device;
