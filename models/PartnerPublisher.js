const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PartnerPublisher = sequelize.define(
  "PartnerPublisher",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    partnerId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: "FK → pb_Partner.id",
    },

    publisherId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: "FK → pb_publisher.id",
    },
  },
  {
    tableName: "pb_partner_publisher",
    timestamps: true,
    indexes: [
      {
        name: "uniq_partner_publisher",
        unique: true,
        fields: ["partnerId", "publisherId"],
      },
    ],
  }
);

module.exports = PartnerPublisher;
