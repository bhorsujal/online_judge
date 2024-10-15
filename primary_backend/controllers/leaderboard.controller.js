const User = require('../models/user.model')

// console.log('User model attributes:', User.getAttributes());
// Controller function to handle fetching the leaderboard
const getLeaderboard = async (req, res) => {
    try {
        // Fetch users ordered by score (highest first) and then by last_score_update_time (earliest first)
        const leaderboard = await User.findAll({
            order: [
                ['score', 'DESC'],   // Order by score in descending order (highest score first)
                ['last_score_updated_time', 'ASC'] // If two users have the same score, prioritize the one who achieved it earlier
            ],
            attributes: ['user_id', 'email', 'score', 'last_score_updated_time'] // Select the relevant fields for the leaderboard
        });

        // Return the leaderboard data as J SON
        res.status(200).json(leaderboard);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
};

module.exports = { getLeaderboard };
