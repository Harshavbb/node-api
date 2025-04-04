require("dotenv").config();
const express = require('express');
const mongoose = require("mongoose");
const connectDB = require("./config/db"); 
const rateLimit = require("express-rate-limit");
const User = require("./models/User"); // Import User Model
const sendEmail = require("./utils/sendEmail");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const roleMiddleware = require("./middleware/roleMiddleware");
const authMiddleware = require("./middleware/authMiddleware");


const app = express();

// Middleware to parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
connectDB();



const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later."
});
app.use(limiter);


// Define a simple route
app.get('/', (req, res) => {
    res.send("Welcome to our REST API!");
});

// Create a new user
app.post('/users', async (req, res) => {
    try{
    const { name, email, password, age } = req.body;
    const newUser = new User({ name, email, password, age});
    await newUser.save();
    res.status(201).json({message: "User created successfully", newUser});
    } catch (err) {
        res.status(400).json({message: "Error creating user", error: err});
    }
});

// Fetch all users
app.get("/users", async (req, res) => {
    try {
        const users = await User.find(); // Fetch all users from MongoDB
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fetch a single user by ID
app.get("/users/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id); // Fetch user by ID
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json(user); // Return user data
    } catch (error) {
        res.status(500).json({ message: "Error fetching user", error: error.message });
    }
});

//updating the user
app.put("/users/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,       // The ID of the user to update
            req.body,            // The new data from the request body
            { new: true, runValidators: true } // Return the updated document and validate
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(updatedUser); // Return the updated user
    } catch (error) {
        res.status(500).json({ message: "Error updating user", error: error.message });
    }
});

// Deleting a user
app.delete("/users/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const deletedUser = await User.findByIdAndDelete(req.params.id);

        if (!deletedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User deleted successfully", deletedUser });
    } catch (error) {
        res.status(500).json({ message: "Error deleting user", error: error.message });
    }
});

// User Authentication
const multer = require("multer");

// ✅ Fix: Store image in memory (Buffer)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
module.exports = upload;

const nodemailer = require("nodemailer");
const crypto = require("crypto");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,  // Your email
        pass: process.env.EMAIL_PASS   // App password (not normal password)
    }
});
// User Signup
app.post("/auth/signup",
    upload.single("profilePic"),
    [
        body("name").notEmpty().withMessage("Name is required"),
        body("email").isEmail().withMessage("Valid email is required"),
        body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
        body("age").isNumeric().withMessage("Age must be a number"),
        body("role").optional().isIn(["user", "admin"]).withMessage("Invalid role")
    ],
    async (req, res) => {
        console.log("Received Body:", req.body);
        console.log("Received File:", req.file);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { name, email, password, age, role } = req.body;

            let user = await User.findOne({ email });
            if (user) {
                return res.status(400).json({ message: "User already exists" });
            }

            const assignedRole = role === "admin" ? "user" : role;

            if (!req.file) {
                return res.status(400).json({ message: "Profile picture is required!" });
            }

            const verificationToken = crypto.randomBytes(32).toString("hex"); // ✅ Generate token

            user = new User({
                name,
                email,
                password,
                age,
                role: assignedRole,
                isVerified: false, // ✅ Not verified initially
                verificationToken,
                profilePic: {
                    data: req.file.buffer,
                    contentType: req.file.mimetype
                }
            });

            await user.save();

            const verifyLink = `http://localhost:3000/auth/verify/${verificationToken}`; // ✅ Adjust for production
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Email Verification",
                html: `<p>Click <a href="${verifyLink}">here</a> to verify your email.</p>`
            };

            await transporter.sendMail(mailOptions);
            res.json({ message: "User registered! Please verify your email." });

        } catch (error) {
            console.error("Signup Error:", error.message);
            res.status(500).json({ message: "Error signing up", error: error.message });
        }
    }
);

app.get("/auth/verify/:token", async (req, res) => {
    try {
        const user = await User.findOne({ verificationToken: req.params.token });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired verification token" });
        }

        user.isVerified = true;  // ✅ Mark user as verified
        user.verificationToken = null; // ✅ Remove token after verification
        await user.save();

        res.json({ message: "Email verified successfully! You can now log in." });
    } catch (error) {
        res.status(500).json({ message: "Error verifying email", error: error.message });
    }
});


// User Login
app.post("/auth/login", [
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password").trim().notEmpty().withMessage("Password is required")
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        if (!user.isVerified) {
            return res.status(400).json({ message: "Please verify your email before logging in." });
        }

    
        const isMatch = await bcrypt.compare(password, user.password);
        console.log("Password Match Result:", isMatch);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ message: "Login successful", token });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error: error.message });
    }
});


app.get("/protected", authMiddleware, (req, res) => {
    res.json({ message: "You accessed a protected route!", user: req.user });
});


app.get("/admin", authMiddleware, roleMiddleware("admin"), (req, res) => {
    res.json({ message: "Welcome, Admin! You have full access." });
});

app.get("/users/:id/profilePic", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || !user.profilePic) {
            return res.status(404).json({ message: "Image not found" });
        }

        res.set("Content-Type", user.profilePic.contentType);
        res.send(user.profilePic.data);
    } catch (error) {
        res.status(500).json({ message: "Error fetching image", error: error.message });
    }
});


// Forgot Password
app.post("/auth/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User with this email does not exist." });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString("hex");
        user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex"); // Hash token
        user.resetPasswordExpires = Date.now() + 3600000; // Token expires in 1 hour

        await user.save();

        // Send email
        const resetLink = `http://localhost:3000/auth/reset-password/${resetToken}`;
        const emailContent = `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`;

        await sendEmail(user.email, "Password Reset", emailContent);

        res.json({ message: "Password reset email sent!" });

    } catch (error) {
        res.status(500).json({ message: "Error sending reset email", error: error.message });
    }
});

// Reset Password
app.post("/auth/reset-password/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired token." });
        }

        // ✅ Assign the new password directly (model will hash it automatically)
        user.password = newPassword;

        // Clear reset token fields
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        console.log("Password reset successfully:", user.password); // Debugging log
        res.json({ message: "Password reset successful! You can now log in." });

    } catch (error) {
        res.status(500).json({ message: "Error resetting password", error: error.message });
    }
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});