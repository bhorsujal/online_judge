const Submission = require('../models/submission.model');
const User = require('../models/user.model');
const Problem = require('../models/problem.model');

const handleWebhook = async (req, res) => {
    const { submission_id, problem_id, user_id, results, status, action, event } = req.body;

    // Log all fields except "code" for debugging purposes
    console.log('Received webhook:', {
        submission_id,
        problem_id,
        user_id,
        results,
        status,
        action,
        event
    });

    try {
        const submission = await Submission.findByPk(submission_id);

        if (!submission) {
            console.log(`Submission ${submission_id} not found.`);
            return res.status(404).json({ error: 'Submission not found' });
        }

        console.log(`Submission ${submission_id} found in the database`);

        // Fetch the score for the given problem_id
        const problem = await Problem.findByPk(problem_id);

        if (!problem) {
            console.log(`Problem ${problem_id} not found.`);
            return res.status(404).json({ error: 'Problem not found' });
        }

        const problemScore = problem.score;

        // Ensure the action is "SUBMIT" before updating the score
        if (action !== 'submit') {
            console.log(`Action is not SUBMIT. No score update for user ${user_id}.`);
            return res.status(200).json({ message: 'No score update. Action was not SUBMIT.' });
        }

        // Fetch the user and check if the event matches between the submission and the user
        const user = await User.findByPk(user_id);
        if (!user || user.event !== event) {
            console.log(`User ${user_id} is not participating in event ${event}. Skipping score update.`);
            return res.status(200).json({ message: 'No score update. Event mismatch.' });
        }

        // Hard-coded event start time (e.g., 10:00 AM)
        const eventStartTime = new Date();
        eventStartTime.setHours(10, 0, 0, 0); // Setting the event start time to 10:00 AM (hh:mm)

        const currentTime = new Date(); // Current time

        // Calculate the time difference in minutes
        const timeDifferenceInMinutes = Math.floor((currentTime - eventStartTime) / (1000 * 60));

        // Check if there's already an accepted submission for this problem by this user for the same event
        const existingAcceptedSubmission = await Submission.findOne({
            where: {
                problem_id: problem_id,
                user_id: user_id,
                event: event,
                status: 'accepted' // Check for already accepted submission
            }
        });

        if (existingAcceptedSubmission) {
            console.log(`User ${user_id} has already solved problem ${problem_id} for event ${event}. Skipping score update.`);
        } else if (status === 'accepted') {
            // Update user's score and save the last correct submission time in minutes
            user.score += problemScore;

            // Store the time difference (in minutes) as the `last_score_updated_time`
            user.last_score_updated_time = timeDifferenceInMinutes;

            await user.save();
        }

        console.log(`User ${user_id} updated with score: ${user.score}, last_score_updated_time: ${user.last_score_updated_time} minutes`);

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
