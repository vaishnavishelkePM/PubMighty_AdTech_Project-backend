const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const InventoryNote = sequelize.define(
  "InventoryNote",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },

    inventoryId: {
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
      validate: { isIn: [[0, 1]] },
      comment: "0=open, 1=resolved/closed",
    },
  },
  {
    tableName: "pb_inventory_notes",
    timestamps: true,

    indexes: [
      {
        name: "idx_inventory",
        fields: ["inventoryId"],
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

module.exports = InventoryNote;
