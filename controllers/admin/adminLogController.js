const Joi = require("joi");
const { Op } = require("sequelize");
const AdminLog = require("../../models/Admin/AdminLog"); // adjust path
const { isAdminSessionValid } = require("../../utils/helpers/authHelper"); // adjust path

async function getAdminLogs(req, res) {
  try {
    // 1) Validate admin session (same pattern as getPublishers)
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      perPage: Joi.number().integer().min(1).max(100).default(10),

      id: Joi.number().integer().positive().optional(),
      adminId: Joi.number().integer().positive().optional(),
      actionCategory: Joi.string().trim().allow(""),
      actionType: Joi.string().trim().allow(""),

      // Optional date range filters (based on "date" column in AdminLog)
      fromDate: Joi.date().optional(),
      toDate: Joi.date().optional(),

      sortBy: Joi.string()
        .valid("id", "adminId", "date", "createdAt", "updatedAt")
        .default("date"),
      sortDir: Joi.string().valid("asc", "ASC", "desc", "DESC").default("DESC"),
    });

    const { error, value } = schema.validate(req.query, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    const {
      page,
      perPage,
      id,
      adminId,
      actionCategory,
      actionType,
      fromDate,
      toDate,
      sortBy,
      sortDir,
    } = value;

    // 3) Build where conditions
    const where = {};

    if (id) {
      where.id = id;
    }

    if (adminId) {
      where.adminId = adminId;
    }

    if (actionCategory) {
      where.actionCategory = { [Op.like]: `%${actionCategory}%` };
    }

    if (actionType) {
      where.actionType = { [Op.like]: `%${actionType}%` };
    }

    // Date range on "date" column
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) {
        where.date[Op.gte] = fromDate;
      }
      if (toDate) {
        where.date[Op.lte] = toDate;
      }
    }

    const offset = (page - 1) * perPage;
    const order = [[sortBy, sortDir.toUpperCase()]];

    // 4) Fetch from DB with pagination
    const { rows, count } = await AdminLog.findAndCountAll({
      where,
      order,
      offset,
    });
    // const cleanRows = rows.map((log) => {
    //   const item = log.toJSON();

    //   item.beforeAction = item.beforeAction
    //     ? JSON.parse(item.beforeAction, null, 2)
    //     : "";
    //   item.afterAction = item.afterAction
    //     ? JSON.stringify(item.afterAction, null, 2)
    //     : "";

    //   return item;
    // });

    const totalPages = Math.ceil(count / perPage);

    // 5) Return result in same structure as getPublishers
    return res.status(200).json({
      success: true,
      msg: "Admin logs fetched successfully.",
      data: {
      //  rows: cleanRows,
        pagination: {
          totalItems: count,
          totalPages,
          currentPage: page,
          perPage,
        },
      },
    });
  } catch (err) {
    console.error("Error in getAdminLogs:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

module.exports = { getAdminLogs };
