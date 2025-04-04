require("dotenv").config();
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const token = req.header("Authorization");

    if (!token) {
        return res.status(401).json({ message: "Access Denied. No token provided." });
    }

    try {
        const secretKey = process.env.JWT_SECRET; // Load secret from .env
        console.log("Secret Key from .env:", process.env.JWT_SECRET);
        const decoded = jwt.verify(token.replace("Bearer ", ""), secretKey);
        req.user = decoded; // Store user info in `req.user`
        next(); // Proceed to the next middleware or route
    } catch (error) {
        res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = authMiddleware;
