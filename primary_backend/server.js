const express = require("express");
const http = require("http"); // Import the http module to create a server
const cookieParser = require("cookie-parser");
const helmet = require("helmet"); // For setting secure HTTP headers
const rateLimit = require("express-rate-limit");
// const socketIo = require("socket.io"); // Uncomment if you want to use socket.io in the future
const db = require("./config/sequelize.config.js");
const bodyParser = require("body-parser");
const Problem = require('./models/problem.model.js');
const Submission = require('./models/submission.model.js');
const User = require('./models/user.model.js');
require("dotenv").config();
const { startCleanupJob } = require('./jobs/clean.jobs.js');
const { leaderboard } = require('./controllers/leaderboard.controller.js');

const app = express();

// Create an HTTP server
// const server = http.createServer(app); // Fix here

const apiRoutes = require('./routes/api.routes.js');

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(helmet());

// Rate limiting to prevent brute force attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Use API routes
app.use('/api', apiRoutes);

// Initialize the application and test the DB connection
const initApp = async () => {
    console.log("Testing the database connection...");

    try {
        await db.authenticate(); // Authenticate database connection
        await db.sync({ alter: true }); // Sync database models, alter schema if needed
        console.log("Connection has been established successfully.");
    } catch (error) {
        console.error("Unable to connect to the database:", error.original);
    }
};
initApp();

// Start the cleanup job
startCleanupJob();

// Set the port from environment variables or default to 3000
const PORT = process.env.PORT || 3000;

// Start the server and listen on the specified port
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});
