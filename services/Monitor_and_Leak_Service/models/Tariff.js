import mongoose from "mongoose";

// One rising-block tier. `maxUnits` is the upper bound of the block, in units
// (1 unit = `unitLiters`). The final block uses maxUnits = null (unbounded).
// `rate` is the MARGINAL price per unit for consumption that falls in this block.
const tierSchema = new mongoose.Schema(
    {
        maxUnits: { type: Number, default: null }, // null → open-ended top block
        rate: { type: Number, required: true, min: 0 }, // LKR per unit
    },
    { _id: false }
);

/**
 * Postpaid tariff (NWSDB-style rising-block domestic tariff). A single active
 * tariff drives every postpaid bill; admins edit it. Consumption is converted
 * to units (litres / unitLiters) and charged marginally across the blocks, plus
 * a flat monthly service charge.
 */
const tariffSchema = new mongoose.Schema(
    {
        name: { type: String, default: "NWSDB Domestic", trim: true },
        // Litres per billing unit (1 unit = 1 m³ = 1000 L).
        unitLiters: { type: Number, default: 1000, min: 1 },
        // Flat monthly service charge in LKR.
        fixedCharge: { type: Number, default: 0, min: 0 },
        // Rising blocks, ascending by maxUnits (null last).
        tiers: {
            type: [tierSchema],
            default: [
                { maxUnits: 5, rate: 2 },
                { maxUnits: 10, rate: 20 },
                { maxUnits: 15, rate: 40 },
                { maxUnits: 25, rate: 60 },
                { maxUnits: null, rate: 100 },
            ],
        },
        // Only the active tariff is used for new bills.
        isActive: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

const Tariff = mongoose.model("Tariff", tariffSchema);

// Return the active tariff, seeding a default one on first use.
export const getActiveTariff = async () => {
    let tariff = await Tariff.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!tariff) tariff = await Tariff.create({});
    return tariff;
};

export default Tariff;
