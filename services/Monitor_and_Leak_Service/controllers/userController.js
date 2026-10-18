import User from "../models/User.js";
import BillingModeRequest from "../models/BillingModeRequest.js";
import generateToken from "../utils/generateToken.js";

// Shape a user document for API responses (never leak the password hash).
const toPublicUser = (user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    address: user.address,
    nic: user.nic,
    accountNumber: user.accountNumber,
    createdAt: user.createdAt,
});

// First human-readable message from a mongoose ValidationError.
const validationMessage = (error) => Object.values(error.errors || {})[0]?.message || error.message;

// Register a new user
export const registerUser = async (req, res) => {
    try {
        const { name, email, password, phone, address, nic } = req.body;

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(409).json({ message: "Email is already registered" });
        }
        if (nic && (await User.exists({ nic: String(nic).trim().toUpperCase() }))) {
            return res.status(409).json({ message: "NIC is already registered" });
        }

        const user = await User.create({
            name,
            email,
            password,
            // Public sign-up is always a household account. `role` from the request
            // body is ignored — admins are provisioned separately, never self-assigned.
            role: "user",
            phone,
            address,
            nic,
            // accountNumber is system-generated (User pre-validate hook), never taken from the client.
        });

        return res.status(201).json({
            user: toPublicUser(user),
            token: generateToken(user._id, user.role),
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) });
        }
        if (error.code === 11000) {
            return res.status(409).json({ message: "Email or NIC is already registered" });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Create an admin account (only an existing admin may do this)
// @route   POST /api/users/admins
// @access  Private (admin)
export const createAdmin = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(409).json({ message: "Email is already registered" });
        }

        const user = await User.create({ name, email, password, phone, role: "admin" });

        // No token here — the current admin stays logged in; this just provisions the account.
        return res.status(201).json({ user: toPublicUser(user) });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// User Login
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // password has select:false, so request it explicitly.
        const user = await User.findOne({ email }).select("+password");
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        return res.json({
            user: toPublicUser(user),
            token: generateToken(user._id, user.role),
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get the currently authenticated user's profile
export const getProfile = async (req, res) => {
    try {
        const user = req.user;
        return res.json({ user: toPublicUser(user) });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update the currently authenticated user's profile
export const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        // accountNumber is deliberately not editable.
        const { name, phone, address, nic, password } = req.body;

        // Only touch fields that actually changed, so an older account that never filled in
        // phone/address/NIC can still save an unrelated edit (e.g. its name).
        const changed = (next, current) => next !== undefined && String(next).trim() !== (current || "");
        if (name !== undefined) user.name = name;
        if (changed(phone, user.phone)) user.phone = phone;
        if (changed(address, user.address)) user.address = address;
        if (nic !== undefined && String(nic).trim().toUpperCase() !== (user.nic || "")) {
            const taken = await User.exists({ nic: String(nic).trim().toUpperCase(), _id: { $ne: user._id } });
            if (taken) return res.status(409).json({ message: "NIC is already registered" });
            user.nic = nic;
        }
        if (password) user.password = password; // re-hashed by the pre-save hook

        const updated = await user.save();
        return res.json({ user: toPublicUser(updated) });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get all users
export const getUsers = async (req, res) => {
    try {
        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        const users = await User.find(filter).sort({ createdAt: -1 });
        return res.json({ count: users.length, users: users.map(toPublicUser) });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get a single user by id
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        return res.json({ user: toPublicUser(user) });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Delete a user
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        // Their billing-mode requests go with them (no orphaned entries in the admin queue).
        await BillingModeRequest.deleteMany({ user: user._id });
        return res.json({ message: "User deleted" });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
