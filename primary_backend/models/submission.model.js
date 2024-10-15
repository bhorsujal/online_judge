const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize.config.js');

const Submission = sequelize.define('Submission', {
    submission_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    problem_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'problems',
            key: 'problem_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
    },
    code: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    customTestcase: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: ""
    },
    language: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    results: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    action: {
        type: DataTypes.ENUM('RUN', 'SUBMIT'),
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pending', 'accepted', 'wrong_answer', 'time_limit_exceeded', 'memory_limit_exceeded', 'runtime_error', 'compilation_error'),
        allowNull: false,
        defaultValue: 'pending'
    },
    event: {
        type: DataTypes.ENUM('NCC', 'RC'),
        allowNull: false,
    },
    solved: {
        type: DataTypes.BOOLEAN,  // A flag to indicate if the problem was solved by the user
        defaultValue: false,
    },
    checked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    }
}, {
    tableName: 'submissions',
    timestamps: true,
});

Submission.associate = (models) => {
    Submission.belongsTo(models.Problem, { foreignKey: 'problem_id' });
    Submission.belongsTo(models.User, { foreignKey: 'user_id' });
};

module.exports = Submission;
    