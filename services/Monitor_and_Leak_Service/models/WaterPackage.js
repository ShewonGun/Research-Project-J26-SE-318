import mongoose from "mongoose";

const waterPackageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Package name is required"],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        // Prepaid water quota this package grants, in litres.
        volumeLiters: {
            type: Number,
            required: [true, "Volume (litres) is required"],
            min: [1, "Volume must be greater than 0"],
        },
        // Price in LKR.
        price: {
            type: Number,
            required: [true, "Price is required"],
            min: [0, "Price cannot be negative"],
        },
        // How long the package stays valid after activation, in days.
        validityDays: {
            type: Number,
            default: 30,
            min: [1, "Validity must be at least 1 day"],
        },
        // Whether the package is available for purchase.
        isActive: {
            type: Boolean,
            default: true,
        },
        // Admin who created the package.
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

const WaterPackage = mongoose.model("WaterPackage", waterPackageSchema);

export default WaterPackage;
