const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const PublisherOTP = sequelize.define(
  "PublisherOTP",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    publisherId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    status: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      validate: {
        isIn: [[0, 1]],
      },
      comment: "0 = unused, 1 = used or expired",
    },
    otp: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiry: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(256),
      allowNull: true, // E.g., "login", "password_reset"
    },
    data: {
      type: DataTypes.STRING(256),
      allowNull: true,
      comment: "Optional metadata related to action",
    },
  },
  {
    tableName: "pb_publisher_otps",
    timestamps: true,

    indexes: [
      {
        name: "idx_publisher_action_status_expiration",
        fields: ["publisherId", "action", "status", "expiry"],
      },
    ],
  }
);

module.exports = PublisherOTP;
