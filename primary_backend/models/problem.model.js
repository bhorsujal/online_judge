  const { DataTypes } = require('sequelize');
  const sequelize = require('../config/sequelize.config.js');

  const Problem = sequelize.define('Problem', {
    problem_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    problem_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    test_cases_file_path: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expected_output_file_path: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    event: {
      type: DataTypes.ENUM('NCC', 'RC'),
      allowNull: false,
    },
    score: {
        type: DataTypes.INTEGER, // Score for solving the problem
        allowNull: false,
        defaultValue: 100
    }
  }, {
    tableName: 'problems'
  });

  module.exports = Problem;