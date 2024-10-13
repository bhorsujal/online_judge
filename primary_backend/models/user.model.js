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
        unique: true,
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
    }
}, {
    tableName: 'users',
    timestamps: true, // Adds createdAt and updatedAt fields
});

module.exports = User;
