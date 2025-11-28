const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const AdminLog = sequelize.define(
  "AdminLog",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    adminId: {
      // JS name: adminId
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      field: "admin_id", // DB column name
    },

    actionCategory: {
      type: DataTypes.ENUM(
        "inventory",
        "publisher",
        "auth",
        "partner",
        "report",
        "system",
        "admin"
      ),
      allowNull: false,
      field: "action_category",
    },

    actionType: {
      type: DataTypes.ENUM(
        "ADDED",
        "EDITED",
        "DELETED",
        "STATUS_CHANGED",
        "PARTNER_STATUS_CHANGED",
        "IMPERSONATED",
        "LOGIN",
        "LOGOUT"
      ),
      allowNull: false,
      field: "action_type",
    },

    beforeAction: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "before_action",
    },

    afterAction: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "after_action",
    },

    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "date",
    },
  },
  {
    tableName: "pb_admin_logs",
    timestamps: false, // we already have `date`
  }
);

module.exports = AdminLog;
