import mongoose from "mongoose";

// One tier's contribution to a finalized bill (snapshot for the receipt).
const breakdownSchema = new mongoose.Schema(
    {
        from: Number,
        to: Number, // null → open-ended top block
        units: Number,
        rate: Number,
        cost: Number,
    },
    { _id: false }
);

/**
 * A postpaid bill for one device over one billing cycle.
 *
 * Lifecycle:
 *   open      → the running cycle; telemetry adds to `volumeUsed`.
 *   unpaid    → cycle closed by the admin; `amount`/`dueDate` finalized.
 *   overdue   → still unpaid past `dueDate` (supply gets throttled, then closed).
 *   paid      → settled by the household.
 */
const billSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },

        periodStart: { type: Date, default: Date.now },
        periodEnd: { type: Date }, // set when the cycle is closed

        volumeUsed: { type: Number, default: 0 }, // litres accumulated this cycle

        // Filled in at close (snapshot of the tariff applied).
        units: { type: Number },
        usageCharge: { type: Number },
        fixedCharge: { type: Number },
        amount: { type: Number }, // total payable, LKR
        breakdown: { type: [breakdownSchema], default: [] },

        status: {
            type: String,
            enum: ["open", "unpaid", "overdue", "paid"],
            default: "open",
        },
        dueDate: { type: Date },
        paidAt: { type: Date },
    },
    { timestamps: true }
);

// Fast lookup of a device's open bill during ingestion, and of unpaid bills.
billSchema.index({ device: 1, status: 1 });

const Bill = mongoose.model("Bill", billSchema);

export default Bill;
