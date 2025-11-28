const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const PublisherSession = sequelize.define(
  "PublisherSession",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    sessionToken: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    os: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    browser: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    status: {
      type: DataTypes.TINYINT.UNSIGNED,
      defaultValue: 1,
      comment: " 1 =active, 2=expired",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "pb_publisher_sessions",
    indexes: [
      { fields: ["userId", "status"] },
      { fields: ["userId", "updatedAt"] },
    ],
  }
);

module.exports = PublisherSession;
