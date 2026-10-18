import { randomInt } from "node:crypto";
import mongoose from "mongoose";

export const ACCOUNT_NUMBER_DIGITS = 10;
export const ACCOUNT_NUMBER_RE = new RegExp(`^\\d{${ACCOUNT_NUMBER_DIGITS}}$`);

// Random fixed-length numeric string (no leading zero, so it never loses a digit).
const randomNumber = () => {
    let n = String(randomInt(1, 10));
    while (n.length < ACCOUNT_NUMBER_DIGITS) n += randomInt(0, 10);
    return n;
};

// A random account number not used by any other user. Resolves the model via
// mongoose.model() to avoid a circular import with models/User.js.
export const generateAccountNumber = async () => {
    const User = mongoose.model("User");
    for (let i = 0; i < 20; i++) {
        const candidate = randomNumber();
        if (!(await User.exists({ accountNumber: candidate }))) return candidate;
    }
    throw new Error("Could not generate a unique account number");
};

// ONE-TIME: replace every existing account's number with a freshly generated
// random one, even if it already has a valid-looking value. A marker document in
// the `migrations` collection makes sure this never runs twice — account numbers
// must stay fixed after this.
const REISSUE_KEY = "account-numbers-reissue-v1";
export const reissueAccountNumbersOnce = async () => {
    const User = mongoose.model("User");
    const migrations = mongoose.connection.collection("migrations");
    if (await migrations.findOne({ _id: REISSUE_KEY })) return;

    const users = await User.find({ role: "user" }).select("_id");
    for (const u of users) {
        await User.updateOne(
            { _id: u._id },
            { $set: { accountNumber: await generateAccountNumber() } },
            { overwriteImmutable: true }
        );
    }
    await migrations.insertOne({ _id: REISSUE_KEY, usersUpdated: users.length, ranAt: new Date() });
    console.log(`Reissued account numbers for ${users.length} existing user(s).`);
};

// Safety net, idempotent — safe on every start:
//   • households with no valid 10-digit number get one;
//   • admins don't have account numbers, so any they were given are removed.
export const backfillAccountNumbers = async () => {
    const User = mongoose.model("User");
    // Raw collection call — the field is immutable through mongoose.
    await User.collection.updateMany({ role: "admin", accountNumber: { $exists: true } }, { $unset: { accountNumber: "" } });
    const users = await User.find({
        role: "user",
        $or: [{ accountNumber: { $exists: false } }, { accountNumber: null }, { accountNumber: { $not: ACCOUNT_NUMBER_RE } }],
    }).select("_id");
    for (const u of users) {
        // The field is immutable, so mongoose silently drops this update unless told otherwise.
        await User.updateOne(
            { _id: u._id },
            { $set: { accountNumber: await generateAccountNumber() } },
            { overwriteImmutable: true }
        );
    }
    if (users.length) console.log(`Assigned account numbers to ${users.length} existing user(s).`);
};
