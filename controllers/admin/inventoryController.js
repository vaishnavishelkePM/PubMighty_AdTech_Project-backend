const Joi = require("joi");
const Inventory = require("../../models/Inventory");
const { Op } = require("sequelize");
const { getOption } = require("../../utils/helper");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
const Publisher = require("../../models/Publishers/Publisher");
const Partner = require("../../models/Partners/Partner");

async function createInventory(req, res) {
  try {
    const schema = Joi.object({
      publisherId: Joi.number().integer().required(),
      type: Joi.string().valid("WEB", "APP", "OTT_CTV").required(),
      name: Joi.string().max(255).required(),
      url: Joi.string().uri().max(500).allow(null, ""),
      developerWeb: Joi.string().uri().max(500).allow(null, ""),
      description: Joi.string().allow(null, ""),
      logo: Joi.string().uri().max(500).allow(null, ""),
      adsTxtStatus: Joi.number().integer().valid(0, 1, 2).default(0),
      partnerStatus: Joi.number().integer().valid(0, 1, 2).default(1),
      status: Joi.number().integer().valid(0, 1, 2).default(1),
      packageName: Joi.string().allow(null, ""),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        msg: error.details[0].message,
      });
    }

    const inventory = await Inventory.create(value);

    return res.status(201).json({
      success: true,
      msg: "Inventory created successfully",
      data: inventory,
    });
  } catch (err) {
    console.error("createInventory error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
}

async function getInventories(req, res) {
  try {
    const session = await isAdminSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }
    const adminId = session.data;

    const querySchema = Joi.object({
      page: Joi.number().integer().min(1).default(1),

      id: Joi.number().integer().min(1).optional(),

      publisherUsername: Joi.string().trim().optional(),
      publisherId: Joi.number().integer().optional(),

      partnerUsername: Joi.string().trim().optional(),
      partnerId: Joi.number().integer().optional(),

      type: Joi.string().valid("WEB", "APP", "OTT_CTV", "ALL").optional(),
      status: Joi.number().integer().valid(0, 1, 2).optional(),
      partnerStatus: Joi.number().integer().valid(0, 1, 2).optional(),
      adsTxtStatus: Joi.number().integer().valid(0, 1, 2, 3).optional(),

      name: Joi.string().trim().optional(),
      url: Joi.string().trim().optional(),

      sortBy: Joi.string()
        .valid("id", "name", "type", "status", "createdAt", "updatedAt")
        .default("updatedAt"),
      sortDir: Joi.string().valid("asc", "desc").default("desc"),
    });

    const { error, value } = querySchema.validate(req.query, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const {
      page: rawPage,
      id,
      publisherUsername,
      publisherId,
      partnerUsername,
      partnerId,
      type,
      status,
      partnerStatus,
      adsTxtStatus,
      name,
      url,
      sortBy,
      sortDir,
    } = value;

    const maxPages = parseInt(
      (await getOption("total_maxpage_for_inventory", 100)) || 100,
      10
    );
    const perPage = parseInt(
      (await getOption("default_per_page_inventory", 10)) || 10,
      10
    );

    let page = rawPage;
    if (page > maxPages) page = maxPages;

    const offset = (page - 1) * perPage;

    // -------- where for Inventory --------
    const where = {};

    if (id) where.id = id;
    if (publisherId) where.publisherId = publisherId;
    if (partnerId) where.partnerId = partnerId;
    if (type) where.type = type;

    if (typeof status === "number") where.status = status;
    if (typeof partnerStatus === "number") where.partnerStatus = partnerStatus;
    if (typeof adsTxtStatus === "number") where.adsTxtStatus = adsTxtStatus;

    if (name) where.name = { [Op.like]: `%${name}%` };
    if (url) where.url = { [Op.like]: `%${url}%` };

    // -------- where for associated models --------
    let publisherWhere;
    if (publisherUsername) {
      publisherWhere = {
        username: { [Op.like]: `${publisherUsername}%` },
      };
    }

    let partnerWhere;
    if (partnerUsername) {
      partnerWhere = {
        username: { [Op.like]: `${partnerUsername}%` },
      };
    }

    // -------- sorting --------
    const sortFieldMap = {
      id: "id",
      name: "name",
      type: "type",
      status: "status",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    };
    const sortField = sortFieldMap[sortBy] || "updatedAt";
    const sortDirection = sortDir.toUpperCase() === "ASC" ? "ASC" : "DESC";

    // -------- includes (IMPORTANT: single include array) --------
    const include = [
      {
        model: Publisher,
        as: "publisher",
        attributes: [
          "id",
          "username",
          "email",
          "avatar",
          "firstName",
          "lastName",
        ],
        ...(publisherWhere ? { where: publisherWhere } : {}),
      },
      {
        model: Partner,
        as: "partner",
        attributes: [
          "id",
          "username",
          "email",
          "avatar",
          "firstName",
          "lastName",
        ],
        ...(partnerWhere ? { where: partnerWhere } : {}),
      },
    ];

    const { rows, count } = await Inventory.findAndCountAll({
      where,
      include,
      limit: perPage,
      offset,
      order: [[sortField, sortDirection]],
    });

    const totalItems = count;
    const totalPages = Math.ceil(totalItems / perPage) || 1;

    return res.json({
      success: true,
      message: "Inventories fetched successfully",
      data: {
        rows,
        pagination: {
          page,
          perPage,
          totalItems,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
        },
      },
    });
  } catch (err) {
    console.error("getInventories failed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch inventories.",
      data: null,
    });
  }
}

async function getInventoryById(req, res) {
  try {
    // 1) auth
    const session = await isAdminSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }

    const paramSchema = Joi.object({
      id: Joi.number().integer().min(1).required(),
    });

    const { error, value } = paramSchema.validate(req.params, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        msg: error.details[0].message,
        data: null,
      });
    }

    const { id } = value;

    const inventory = await Inventory.findByPk(id);

    if (!inventory) {
      return res.status(404).json({
        success: false,
        msg: "Inventory not found",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      data: inventory,
    });
  } catch (err) {
    console.error("getInventoryById error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function updateInventory(req, res) {
  try {
    const session = await isAdminSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }

    const id = Number(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Invalid inventory ID.",
        data: null,
      });
    }

    const schema = Joi.object({
      publisherId: Joi.number().integer(),
      type: Joi.string().valid("WEB", "APP", "OTT_CTV"),
      name: Joi.string().max(255),
      url: Joi.string().uri().max(500).allow(null, ""),
      developerWeb: Joi.string().uri().max(500).allow(null, ""),
      description: Joi.string().allow(null, ""),
      logo: Joi.string().uri().max(500).allow(null, ""),
      adsTxtStatus: Joi.number().integer().valid(0, 1, 2),
      partnerStatus: Joi.number().integer().valid(0, 1, 2),
      status: Joi.number().integer().valid(0, 1, 2),

      packageName: Joi.string().allow(null, ""),
    });

    const { error, value } = schema.validate(req.body || {}, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        msg: error.details[0].message,
        data: null,
      });
    }

    const inventory = await Inventory.findByPk(id);
    if (!inventory) {
      return res.status(404).json({
        success: false,
        msg: "Inventory not found",
        data: null,
      });
    }

    const updateData = {
      ...value,
      ...(value.developerWeb ? { developerWeb: value.developerWeb } : {}),
      ...(value.packageName ? { packageName: value.packageName } : {}),
    };

    const finalType = updateData.type || inventory.type;
    const finalUrl =
      updateData.url !== undefined ? updateData.url : inventory.url;

    if (finalType === "WEB" && (!finalUrl || finalUrl.trim() === "")) {
      return res.status(400).json({
        success: false,
        msg: "WEB inventory must include a valid URL.",
        data: null,
      });
    }

    await inventory.update(updateData);

    return res.status(200).json({
      success: true,
      msg: "Inventory updated successfully.",
      data: inventory,
    });
  } catch (err) {
    console.error("updateInventory error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function deleteInventory(req, res) {
  try {
    // 1) auth
    const session = await isAdminSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }

    const id = Number(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Invalid inventory ID.",
        data: null,
      });
    }

    const inventory = await Inventory.findByPk(id);
    if (!inventory) {
      return res.status(404).json({
        success: false,
        msg: "Inventory not found",
        data: null,
      });
    }

    if (inventory.status === 0) {
      return res.status(200).json({
        success: true,
        msg: "Inventory already deleted.",
        data: inventory,
      });
    }

    await inventory.update({
      status: 0,
      partnerStatus: 0,
    });

    return res.status(200).json({
      success: true,
      msg: "Inventory deleted successfully.",
      data: inventory,
    });
  } catch (err) {
    console.error("deleteInventory error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
}

module.exports = {
  createInventory,
  getInventories,
  getInventoryById,
  updateInventory,
  deleteInventory,
};
