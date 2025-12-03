const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Inventory = sequelize.define(
  "Inventory",
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

    partnerId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    // WEB / APP / OTT_CTV
    type: {
      type: DataTypes.ENUM("WEB", "APP", "OTT_CTV", "All"),
      allowNull: false,
      defaultValue: "All",
    },

    status: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      comment: "Admin : 0=inactive,1=active,2=blocked",
    },

    // publisher/partner-specific status
    partnerStatus: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      comment: " 0=inactive,1=active",
    },

    url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "Web URL or App Store URL",
    },

    developerWeb: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Display name",
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    logo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "Logo path/URL",
    },

    adsTxtStatus: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: "0 = not verified, 1 = verified, 2 = failed",
    },

    packageName: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // is_deleted: {
    //   type: DataTypes.ENUM(0, 1),
    //   allowNull: false,
    //   defaultValue: "0",
    //   comment: "0 = not deleted, 1 = deleted",
    // },
    is_deleted: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: "0 = not deleted, 1 = deleted",
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "pb_inventories",
    timestamps: true,

    indexes: [
      {
        name: "idx_publisherId_updatedAt",
        fields: ["publisherId", "updatedAt"],
      },
      {
        name: "idx_type_updatedAt",
        fields: ["type", "updatedAt"],
      },
      {
        name: "idx_status_updatedAt",
        fields: ["status", "updatedAt"],
      },
    ],
  }
);

module.exports = Inventory;
