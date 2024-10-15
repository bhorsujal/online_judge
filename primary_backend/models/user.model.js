const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize.config.js');

const User = sequelize.define('User', {
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        // Remove global uniqueness constraint
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    event: {
        type: DataTypes.ENUM('NCC', 'RC'),
        allowNull: false,
    },
    category: {
        type: DataTypes.ENUM('junior', 'senior'),
        allowNull: false,
    },
    questions_solved: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    wrong_submissions: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    score: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    last_score_updated_time: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    }
}, {
    tableName: 'users',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['email', 'event'] // Add unique constraint on email + event
        }
    ]
});

module.exports = User;
