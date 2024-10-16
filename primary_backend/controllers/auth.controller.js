const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookie = require('cookie-parser');
const User = require('../models/user.model.js');
require('dotenv').config();

const register = async (req, res) => {
    try {
        const { email, username, password, event, category } = req.body;

        // Ensure all fields are present
        if (!email || !username || !password || !event || !category) {
            return res.status(400).json({ message: 'Email, Username, Password, Event, and Category are required' });
        }

        // Check if a user with the same email and event already exists
        const existingUser = await User.findOne({ where: { email: email, event: event } });

        if (existingUser) {
            return res.status(400).json({ message: 'User already registered for this event!' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user with the hashed password
        const newUser = new User({
            email,
            username,
            password: hashedPassword,
            event,
            category
        });

        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password, event, category } = req.body;

        if (!email || !password || !event || !category) {
            return res.status(400).json({ message: 'Email, password and category are required.' });
        }

        const checkUser = await User.findOne({ where: { email: email, event: event, category: category } });

        if (!checkUser) {
            return res.status(400).json({ message: 'Email is not registered for this event.' });
        }

        const comparePassword = await bcrypt.compare(password, checkUser.password);
        if (!comparePassword) {
            return res.status(400).json({ message: 'Wrong Password.' });
        }

        let token = jwt.sign({ email, user_id: checkUser.user_id }, process.env.JWT_SECRET); // secret key should not be leaked
        res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.status(200).json({ message: 'Login Successful' });

    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error });
    }
};

const logout = (req, res) => {
    try {
        if (!req.cookies.token) {
            return res.status(401).json({ message: 'Already logged out' });
        }
        res.clearCookie("token", { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.status(200).json({ message: 'Logout Successful' });

    } catch (error) {
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    register,
    login,
    logout
};
