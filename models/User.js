const mongoose = require('mongoose');
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    age: { type: Number, required: true },
    role: { 
        type: String, 
        enum: ["user", "admin"], 
        default: "user"  // Default role is "user"
    },
    profilePic: { data: Buffer, contentType: String },
    isVerified: { type: Boolean, default: false },  // ✅ New field for email verification
    verificationToken: { type: String } , // ✅ Stores the verification token
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date }
});
UserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next(); 
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});



const User = mongoose.model("User", UserSchema);
module.exports = User;