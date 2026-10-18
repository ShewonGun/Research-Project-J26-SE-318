import jwt from "jsonwebtoken";

// Sign a JWT for the given user id and role. Expires in 7 days.
const generateToken = (userId, role) => {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
};

export default generateToken;
