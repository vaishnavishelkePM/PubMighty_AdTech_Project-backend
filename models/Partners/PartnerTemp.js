const { DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

const PartnerTemp = sequelize.define(
  "PartnerTemp",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
  },
  {
    tableName: "pb_Partner_Temp",
    timestamps: true,
  }
); 

module.exports = PartnerTemp;
