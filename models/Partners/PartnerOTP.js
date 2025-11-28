const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const PartnerOTP = sequelize.define(
  "PartnerOTP",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    partnerId: {
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
    tableName: "pb_partner_otps",
    timestamps: true,
   
    indexes: [
      {
        name: "idx_partner_action_status_expiration",
        fields: ["partnerId", "action", "status", "expiry"],
      },
    ],
  }
);

module.exports = PartnerOTP;
