import Tariff, { getActiveTariff } from "../models/Tariff.js";

// Get the active postpaid tariff (seeds a default on first use)
// @route   GET /api/tariff
// @access  Private (any authenticated user — needed for bill estimates)
export const getTariff = async (req, res) => {
    try {
        const tariff = await getActiveTariff();
        return res.json({ tariff });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update the active tariff (or create the first one)
// @route   PUT /api/tariff
// @access  Private (admin)
export const updateTariff = async (req, res) => {
    try {
        const { name, unitLiters, fixedCharge, tiers } = req.body;

        // Basic sanity: tiers must be ascending with a single open-ended top block.
        if (tiers !== undefined) {
            if (!Array.isArray(tiers) || tiers.length === 0) {
                return res.status(400).json({ message: "tiers must be a non-empty array" });
            }
            for (const t of tiers) {
                if (t.rate === undefined || Number(t.rate) < 0) {
                    return res.status(400).json({ message: "each tier needs a non-negative rate" });
                }
            }
        }

        const tariff = await getActiveTariff();
        if (name !== undefined) tariff.name = name;
        if (unitLiters !== undefined) tariff.unitLiters = unitLiters;
        if (fixedCharge !== undefined) tariff.fixedCharge = fixedCharge;
        if (tiers !== undefined) tariff.tiers = tiers;
        tariff.updatedBy = req.user._id;

        await tariff.save();
        return res.json({ tariff });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
