const { Op } = require('sequelize');
const Submission = require('../models/submission.model');
const User = require('../models/user.model');
const Problem = require('../models/problem.model');

const calculateAccuracy = async (user_id) => {
    // Fetch unique correct submissions per problem for the user (only count the first correct submission per problem)
    const correctSubmissions = await Submission.count({
        where: {
            user_id: user_id,
            status: 'accepted',
            action: 'SUBMIT',
            solved: true // Only count submissions marked as solved
        },
        group: ['problem_id'], // Group by problem_id to ensure one correct submission per problem
    });

    // Fetch total wrong submissions (count every wrong submission)
    const wrongSubmissions = await Submission.count({
        where: {
            user_id: user_id,
            status: {
                [Op.or]: ['wrong_answer', 'time_limit_exceeded', 'memory_limit_exceeded', 'runtime_error', 'compilation_error']
            },
            action: 'SUBMIT'
        }
    });

    // Calculate total submissions (correct submissions + wrong submissions)
    const totalSubmissions = correctSubmissions.length + wrongSubmissions;

    // Calculate accuracy as a percentage
    let accuracy = 0;
    if (totalSubmissions > 0) {
        accuracy = (correctSubmissions.length / totalSubmissions) * 100; // Convert to percentage
    }

    console.log(`Accuracy for user ${user_id}: ${accuracy}%`);
    return accuracy;
};

// Webhook handler where accuracy can be calculated after the score update

const handleWebhook = async (req, res) => {
    const { submission_id, problem_id, user_id, results, status, action, event, message } = req.body;

    // Log all fields except "code" for debugging purposes
    console.log('Received webhook:', {
        submission_id,
        problem_id,
        user_id,
        results,
        status,
        action,
        event,
        message
    });

    try {
        // Find the existing submission by submission_id
        const submission = await Submission.findByPk(submission_id);

        if (!submission) {
            console.log(`Submission ${submission_id} not found.`);
            return res.status(404).json({ error: 'Submission not found' });
        }

        console.log(`Submission ${submission_id} found in the database`);

        // Fetch the problem details
        const problem = await Problem.findByPk(problem_id);

        if (!problem) {
            console.log(`Problem ${problem_id} not found.`);
            return res.status(404).json({ error: 'Problem not found' });
        }

        const problemScore = problem.score;

        // Fetch the user and check if the event matches between the submission and the user
        const user = await User.findByPk(user_id);
        if (!user || user.event !== event) {
            console.log(`User ${user_id} is not participating in event ${event}. Skipping update.`);
            return res.status(200).json({ message: 'No update. Event mismatch.' });
        }

        // Update the existing submission with the new values (without marking as checked yet)
        submission.results = results;
        submission.status = status;
        submission.action = action;
        submission.event = event;
        submission.messages = message;

        await submission.save();
        console.log(`Submission ${submission_id} updated successfully`);

        // Only proceed with score updates and wrong submission count if the action is "SUBMIT"
        if (action === "SUBMIT") {
            // Always count wrong submissions if the status is a wrong type (even after a correct submission)
            if (['wrong_answer', 'runtime_error', 'compilation_error', 'time_limit_exceeded'].includes(status)) {
                user.wrong_submissions += 1;
                await user.save();
                console.log(`User ${user_id} submitted a wrong answer or error for problem ${problem_id}. Wrong submissions: ${user.wrong_submissions}`);
            }

            // Check if the user has already solved this problem (i.e., has an accepted submission and solved is true), excluding the current submission
            const existingAcceptedSubmission = await Submission.findOne({
                where: {
                    problem_id: problem_id,
                    user_id: user_id,
                    event: event,
                    status: 'accepted',
                    solved: true,
                    submission_id: { [Op.ne]: submission_id } // Exclude the current submission
                }
            });

            // If no previous accepted and solved submission exists, proceed with updating the score
            if (!existingAcceptedSubmission && status === 'accepted') {
                console.log(`Updating score for user ${user_id} for problem ${problem_id} with score ${problemScore}`);

                // Update user's score
                user.score += problemScore;

                // Increment the number of questions solved
                user.questions_solved += 1;

                // Hard-coded event start time (e.g., 10:00 AM)
                const eventStartTime = new Date();
                eventStartTime.setHours(10, 0, 0, 0); // Set the event start time to 10:00 AM

                const currentTime = new Date(); // Current time

                // Calculate the time difference in minutes
                const timeDifferenceInMinutes = Math.floor((currentTime - eventStartTime) / (1000 * 60));

                // Update last_score_updated_time
                user.last_score_updated_time = timeDifferenceInMinutes;

                console.log(`User ${user_id} score updated to ${user.score}, last_score_updated_time set to ${user.last_score_updated_time}, questions_solved: ${user.questions_solved}`);

                await user.save();
                console.log(`User ${user_id} saved with updated score, questions_solved, and time`);

                // Now mark the submission as solved and checked, after successful processing
                submission.solved = true;
                submission.checked = true;
                await submission.save();

                console.log(`Submission ${submission_id} marked as solved and checked.`);
            } else {
                console.log(`Skipping score update for user ${user_id} because the problem has already been solved`);
            }

            // Calculate and log accuracy for the user
            const accuracy = await calculateAccuracy(user_id);
            console.log(`Updated accuracy for user ${user_id}: ${accuracy}`);
        }

        res.status(200).json({ message: 'Webhook processed and submission updated successfully.' });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook.' });
    }
};

module.exports = { handleWebhook };