const Submission = require('../models/submission.model');

const pollSubmissionStatus = async (req, res) => {
    const { submission_id } = req.query     ;

    try {
        const submission = await Submission.findByPk(submission_id);

        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Respond with the current status and output of the submission
        res.status(200).json({
            submissionId: submission.submission_id,
            status: submission.status,
            results: submission.results,
            message: submission.messages
        });
    }
    catch(error) {
        console.error("Error fetching submission status:", error);
        res.status(500).json({ error: 'Failed to fetch submission status.' });
    }
};

module.exports = { pollSubmissionStatus };
