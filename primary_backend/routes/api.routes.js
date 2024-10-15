const express = require('express');
const router = express.Router();
const { runSubmitProblem } = require('../controllers/runSubmit.controller.js');
const { handleWebhook } = require('../controllers/webhook.controller.js');
const { register, login, logout } = require('../controllers/auth.controller.js');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middlewares/auth.middleware.js');
const { pollSubmissionStatus }  = require('../controllers/polling.controller.js');
const User = require('../models/user.model.js');
const { getLeaderboard } = require('../controllers/leaderboard.controller.js');


// Leaderboard Route
router.get('/leaderboard', getLeaderboard);

// Registration Route
router.post('/register', register);

// Login Route
router.post('/login', login);

// Logout Route
router.post('/logout', authMiddleware, logout); // Ensure user is authenticated before logging out

// Submit Problem Route (Ensure the user is authenticated)
router.post('/submit', authMiddleware, runSubmitProblem);

router.post('/webhook', handleWebhook);

router.get('/polling', pollSubmissionStatus);
// Update Submission Status Route (Ensure the user is authenticated)
//router.post('/update-status', authMiddleware, updateSubmissionStatus);

module.exports = router;
