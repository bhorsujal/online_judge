const Submission = require('../models/submission.model');
const User = require('../models/user.model');
const Problem = require('../models/problem.model');

const handleWebhook = async (req, res) => {
    console.log('Received webhook:', req.body);
    const { submission_id, problem_id, user_id, results, status } = req.body;

    try {
        const submission = await Submission.findByPk(submission_id);
        
        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        console.log(`Submission ${submission_id} found in the database`);

        // Fetch the score for the given problem_id
        const problem = await Problem.findByPk(problem_id);

        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        const problemScore = problem.score;

        // Hard-coded event start time (e.g., 10:00 AM)
        const eventStartTime = new Date();
        eventStartTime.setHours(1, 0, 0, 0); // Setting the event start time to 10:00 AM (hh:mm)

        const currentTime = new Date(); // Current time
        const timeDifference = Math.floor((currentTime - eventStartTime) / 1000); // Time in seconds

        // Check if there's already an accepted submission for this problem by this user
        const existingAcceptedSubmission = await Submission.findOne({
            where: {
                problem_id: problem_id,
                user_id: user_id,
                status: 'accepted' // Check for already accepted submission
            }
        });

        const user = await User.findByPk(user_id);

        if (existingAcceptedSubmission) {
            console.log(`User ${user_id} has already solved problem ${problem_id}. Skipping score update.`);
        } else if (status === 'accepted') {
            // Update user's score and total_time only if this is the first accepted submission
            user.score += problemScore; // Add the problem-specific score to the user's score
            user.last_score_update_time = currentTime; // Update the time when the score was last changed
            user.total_time = timeDifference; // Update the total time with the difference
        }

        await user.save();
        console.log(`User ${user_id} updated with score: ${user.score}, total_time: ${user.total_time} seconds, last_score_update_time: ${user.last_score_update_time}`);

        // Update submission with the new status and results
        await Submission.update(
            { status, results, updatedAt: new Date() },
            { where: { submission_id: submission_id } }
        );

        res.status(200).json({ message: 'Webhook processed and database updated successfully.' });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook.' });
    }
};


module.exports = { handleWebhook };
