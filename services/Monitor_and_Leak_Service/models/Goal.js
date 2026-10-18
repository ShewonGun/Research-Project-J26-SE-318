import mongoose from "mongoose";

/**
 * A household's daily water-use target for one device. One goal per device (setting a new
 * one replaces the old). Progress, streaks and tips are computed on demand from readings and
 * the usage forecast — nothing else is stored.
 */
const goalSchema = new mongoose.Schema(
    {
        device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true, unique: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who set it
        dailyLitres: { type: Number, required: true, min: 10, max: 5000 },
    },
    { timestamps: true }
);

const Goal = mongoose.model("Goal", goalSchema);

export default Goal;
