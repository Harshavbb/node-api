const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("MongoDB Connected!");
    } catch (error) {
        console.error("MongoDB Connection Failed:", error);
        process.exit(1); // Stop the app if DB connection fails
    }
};
mongoose.connection.on("disconnected", () => {
    console.log("⚠️ MongoDB Disconnected! Trying to reconnect...");
    connectDB(); // Reconnect automatically
});

module.exports = connectDB;
