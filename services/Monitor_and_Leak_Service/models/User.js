import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { generateAccountNumber } from "../utils/accountNumber.js";

// Sri Lankan NIC: old format (9 digits + V/X) or new format (12 digits).
export const NIC_RE = /^(\d{9}[VX]|\d{12})$/;
export const PHONE_RE = /^\+?\d{9,15}$/;

// Household contact details are mandatory for consumer accounts: required when
// the account is created, and can't be blanked afterwards. Admins are exempt.
const requiredForHousehold = (field, label) => [
    function () {
        return this.role === "user" && (this.isNew || this.isModified(field));
    },
    `${label} is required`,
];

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
            select: false,
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        phone: {
            type: String,
            trim: true,
            // "077 123 4567" / "077-123-4567" → "0771234567"
            set: (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
            required: requiredForHousehold("phone", "Phone number"),
            validate: {
                validator: function (v) {
                    return !v || this.role !== "user" || PHONE_RE.test(v);
                },
                message: "Enter a valid phone number",
            },
        },
        address: {
            type: String,
            trim: true,
            required: requiredForHousehold("address", "Address"),
        },
        // National identity card number.
        nic: {
            type: String,
            trim: true,
            uppercase: true,
            required: requiredForHousehold("nic", "NIC"),
            validate: {
                validator: (v) => !v || NIC_RE.test(v),
                message: "Enter a valid NIC (9 digits + V/X, or 12 digits)",
            },
        },
        // System-generated 10-digit number for households, assigned once at creation and never
        // editable (see utils/accountNumber.js).
        accountNumber: {
            type: String,
            trim: true,
            immutable: true,
        },
    },
    { timestamps: true }
);

// One NIC and one account number per account. Partial indexes so legacy
// accounts that don't have the field yet don't collide on "missing".
userSchema.index({ nic: 1 }, { unique: true, partialFilterExpression: { nic: { $type: "string" } } });
userSchema.index({ accountNumber: 1 }, { unique: true, partialFilterExpression: { accountNumber: { $type: "string" } } });

// Assign the account number to every new household account (admins don't get one).
userSchema.pre("validate", async function () {
    if (this.isNew && this.role === "user" && !this.accountNumber) {
        this.accountNumber = await generateAccountNumber();
    }
});

// Hash password before saving when it has been set or changed.
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare a plaintext candidate against the stored hash.
userSchema.methods.matchPassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
