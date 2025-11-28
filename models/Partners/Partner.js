const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const Partner = sequelize.define(
  "Partner",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(300),
      allowNull: true,
      unique: true,
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

    phoneNo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING(3),
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
    tableName: "pb_Partner",
    timestamps: true,
    indexes: [
      {
        name: "idx_status",
        fields: ["status"],
      },
      {
        name: "idx_username",
        fields: ["username"],
      },
      {
        name: "idx_email",
        fields: ["email"],
      },
    ],
  }
);

module.exports = Partner;
