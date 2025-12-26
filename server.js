const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose'); // Back to Mongoose!
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000; // Cloud sets the port automatically

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());
// Serve the frontend files (HTML/CSS/Images)
app.use(express.static(path.join(__dirname))); 

// --- DATABASE CONNECTION (MongoDB) ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to Cloud Database'))
    .catch(err => console.error('❌ DB Error:', err));

// Define Schema
const VoteSchema = new mongoose.Schema({
    email: String,
    party: String,
    timestamp: { type: Date, default: Date.now }
});
const Vote = mongoose.model('Vote', VoteSchema);

// --- SECURITY ---
const otpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 5, 
    message: { error: "Too many requests. Please try again later." }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const otpStore = {};

// --- ROUTES ---

// 1. Serve the Survey Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Request OTP
app.post('/api/request-otp', otpLimiter, async (req, res) => {
    const { email } = req.body;
    
    // Check DB for existing vote
    const existingVote = await Vote.findOne({ email });
    if (existingVote) {
        return res.status(400).json({ error: "This email has already voted." });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[email] = otp;

    const mailOptions = {
        from: `"TN Election Survey" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'TN 2026 Verification Code',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
                <h2>TN State Election Survey 2026</h2>
                <p>DISCLAIMER: Independent research survey. Not affiliated with any political party.</p>
                <p>Your Verification Code is:</p>
                <h1 style="color: #2196F3; letter-spacing: 5px;">${otp}</h1>
                <p>Valid for 10 minutes.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: "OTP Sent" });
    } catch (err) {
        res.status(500).json({ error: "Email failed" });
    }
});

// 3. Submit Vote
app.post('/api/vote', async (req, res) => {
    const { email, otp, party } = req.body;

    if (otpStore[email] !== otp) {
        return res.status(400).json({ error: "Invalid OTP" });
    }

    // Double check DB
    if (await Vote.findOne({ email })) {
        return res.status(400).json({ error: "Already voted" });
    }

    // Save to MongoDB
    await new Vote({ email, party }).save();
    
    delete otpStore[email];
    res.json({ message: "Vote Recorded" });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));