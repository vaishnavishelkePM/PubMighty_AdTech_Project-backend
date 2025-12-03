const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const Publisher = sequelize.define(
  "Publisher",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(300),
      allowNull: true,
      unique: true,
    },
    phoneNo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    is_deleted: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: "0 = not deleted, 1 = deleted",
    },
    password: {
      type: DataTypes.STRING(300),
      allowNull: null,
    },
    status: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      validate: {
        isIn: [[0, 1, 2, 3]],
      },
      comment: "0=pending, 1=active, 2=suspended, 3=disabled",
    },

    country: {
      type: DataTypes.STRING(3),
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    language: {
      type: DataTypes.STRING(3),
      allowNull: true,
      defaultValue: "en",
    },
    avatar: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },

    lastActiveAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    registeredIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },

    twoFactorEnabled: {
      type: DataTypes.TINYINT.UNSIGNED,
      defaultValue: 0,
      allowNull: false,
      comment: "0=off, 1=app, 2=email",
    },
  },
  {
    tableName: "pb_publisher",
    timestamps: true,
    indexes: [
      {
        name: "idx_status",
        fields: ["status"],
      },
    ],
  }
);

module.exports = Publisher;
