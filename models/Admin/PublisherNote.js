const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const PublisherNote = sequelize.define(
  "PublisherNote",
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

    note: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    writtenBy: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
  
    },

    assignedTo: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
   
    },

    status: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: "0=open, 1=resolved/closed",
      validate: {
        isIn: [[0, 1]],
      },
    },
  },
  {
    tableName: "pb_publisher_notes",
    timestamps: true,

    indexes: [
      {
        name: "idx_publisher",
        fields: ["publisherId"],
      },
      {
        name: "idx_writtenBy",
        fields: ["writtenBy"],
      },
      {
        name: "idx_assignedTo",
        fields: ["assignedTo"],
      },
      {
        name: "idx_status",
        fields: ["status"],
      },
    ],
  }
);

module.exports = PublisherNote;
