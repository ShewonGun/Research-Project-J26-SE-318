import WaterPackage from "../models/WaterPackage.js";

// Create a new prepaid water package
export const createPackage = async (req, res) => {
    try {
        const { name, description, volumeLiters, price, validityDays, isActive } = req.body;

        const waterPackage = await WaterPackage.create({
            name,
            description,
            volumeLiters,
            price,
            validityDays,
            isActive,
            createdBy: req.user._id,
        });

        return res.status(201).json({ package: waterPackage });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get all water packages
export const getPackages = async (req, res) => {
    try {
        const filter = {};
        // Non-admins only see packages available for purchase.
        if (req.query.active === "true") filter.isActive = true;

        const packages = await WaterPackage.find(filter).sort({ price: 1 });
        return res.json({ count: packages.length, packages });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get a single water package by id
export const getPackageById = async (req, res) => {
    try {
        const waterPackage = await WaterPackage.findById(req.params.id);
        if (!waterPackage) return res.status(404).json({ message: "Package not found" });
        return res.json({ package: waterPackage });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update a water package
export const updatePackage = async (req, res) => {
    try {
        const { name, description, volumeLiters, price, validityDays, isActive } = req.body;

        const waterPackage = await WaterPackage.findById(req.params.id);
        if (!waterPackage) return res.status(404).json({ message: "Package not found" });

        if (name !== undefined) waterPackage.name = name;
        if (description !== undefined) waterPackage.description = description;
        if (volumeLiters !== undefined) waterPackage.volumeLiters = volumeLiters;
        if (price !== undefined) waterPackage.price = price;
        if (validityDays !== undefined) waterPackage.validityDays = validityDays;
        if (isActive !== undefined) waterPackage.isActive = isActive;

        const updated = await waterPackage.save();
        return res.json({ package: updated });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Delete a water package
export const deletePackage = async (req, res) => {
    try {
        const waterPackage = await WaterPackage.findByIdAndDelete(req.params.id);
        if (!waterPackage) return res.status(404).json({ message: "Package not found" });
        return res.json({ message: "Package deleted" });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
