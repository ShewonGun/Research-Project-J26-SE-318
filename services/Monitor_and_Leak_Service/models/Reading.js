import mongoose from "mongoose";

/**
 * Flow telemetry from a device. Stored in a MongoDB time-series collection:
 *  - timeField  : timestamp of the sample
 *  - metaField  : device (the series each reading belongs to)
 *  - granularity: seconds (samples arrive every few seconds)
 *
 * Time-series collections compress and bucket data automatically, which suits
 * high-frequency flow-sensor readings.
 */
const readingSchema = new mongoose.Schema(
    {
        device: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Device",
            required: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
        // Instantaneous flow in litres per minute.
        flowRate: {
            type: Number,
            required: true,
        },
        // Litres consumed during this sample interval.
        volume: {
            type: Number,
            default: 0,
        },
        // true on sample readings written by a seed script (never set by a real device), so
        // they can always be told apart from — and removed without touching — real telemetry.
        synthetic: {
            type: Boolean,
        },
    },
    {
        timeseries: {
            timeField: "timestamp",
            metaField: "device",
            granularity: "seconds",
        },
        // Auto-delete raw readings after 90 days (keep aggregates elsewhere).
        expireAfterSeconds: 60 * 60 * 24 * 90,
    }
);

const Reading = mongoose.model("Reading", readingSchema);

export default Reading;
