const Joi = require("joi");
const Inventory = require("../../models/Inventory");
const { getOption } = require("../../utils/helper");
const { isPublisherSessionValid } = require("../../utils/helpers/authHelper");


async function createMyInventory(req, res) {
  try {
    // auth
    const session = await isPublisherSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }
    const publisherId = session.data;


    const schema = Joi.object({
      type: Joi.string().valid("WEB", "APP", "OTT_CTV").required(),
      name: Joi.string().max(255).required(),
      url: Joi.string().uri().max(500).allow(null, ""),
      developerWeb: Joi.string().uri().max(500).allow(null, ""),
      description: Joi.string().allow(null, ""),
      logo: Joi.string().uri().max(500).allow(null, ""),
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


    if (value.type === "WEB" && !value.url) {
      return res.status(400).json({
        success: false,
        msg: "URL is required for WEB inventory.",
        data: null,
      });
    }


    const inventory = await Inventory.create({
      ...value,
      publisherId,
      status: 1, 
      partnerStatus: 1, 
      adsTxtStatus: 0,
    });

    return res.status(201).json({
      success: true,
      msg: "Inventory created successfully.",
      data: inventory,
    });
  } catch (err) {
    console.error("createMyInventory error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
}


async function getMyInventories(req, res) {
  try {
    const session = await isPublisherSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }
    const publisherId = session.data;


    const querySchema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      type: Joi.string().valid("WEB", "APP", "OTT_CTV").optional(),
      status: Joi.number().integer().valid(0, 1, 2).optional(),
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

    const { page: rawPage, type, status } = value;


    const maxPages = parseInt(
      (await getOption("total_maxpage_for_inventory", 100)) || 100,
      10
    );
    const perPage = parseInt(
      (await getOption("default_per_page_inventory", 20)) || 20,
      10
    );

    let page = rawPage;
    if (page > maxPages) page = maxPages;

    const offset = (page - 1) * perPage;

    const where = {
      publisherId,
      ...(type ? { type } : {}),
      ...(status !== undefined ? { status } : {}),
    };

    const { rows, count } = await Inventory.findAndCountAll({
      where,
      limit: perPage,
      offset,
      order: [["updatedAt", "DESC"]],
    });

    const totalItems = count;
    const totalPages = Math.ceil(totalItems / perPage);

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
    console.error("getMyInventories error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch inventories.",
      data: null,
    });
  }
}


async function getMyInventoryById(req, res) {
  try {
    const session = await isPublisherSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }
    const publisherId = session.data;

    const { error: paramError, value: paramValue } = Joi.object({
      id: Joi.number().integer().required(),
    }).validate(req.params);

    if (paramError) {
      return res.status(400).json({
        success: false,
        msg: paramError.details[0].message,
        data: null,
      });
    }

    const { id } = paramValue;

    const inventory = await Inventory.findOne({
      where: {
        id,
        publisherId,
      },
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        msg: "Inventory not found or you do not have access.",
        data: null,
      });
    }

    return res.json({
      success: true,
      data: inventory,
    });
  } catch (err) {
    console.error("getMyInventoryById error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data:null
    });
  }
}


async function updateMyInventory(req, res) {
  try {
    const session = await isPublisherSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }
    const publisherId = session.data;


    const { error: paramError, value: paramValue } = Joi.object({
      id: Joi.number().integer().required(),
    }).validate(req.params);

    if (paramError) {
      return res.status(400).json({
        success: false,
        msg: paramError.details[0].message,
        data:null
      });
    }
    const { id } = paramValue;

 
    const inventory = await Inventory.findOne({
      where: {
        id,
        publisherId,
      },
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        msg: "Inventory not found or you do not have access.",
        data: null,
      });
    }

  
    const schema = Joi.object({
      name: Joi.string().max(255),
      url: Joi.string().uri().max(500).allow(null, ""),
      developerWeb: Joi.string().uri().max(500).allow(null, ""),
      description: Joi.string().allow(null, ""),
      logo: Joi.string().uri().max(500).allow(null, ""),
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
        data:null
      });
    }

    if (inventory.type === "WEB" && value.url === "") {
      return res.status(400).json({
        success: false,
        msg: "WEB inventory must have a URL.",
        data:null
      });
    }

    await inventory.update(value);

    return res.json({
      success: true,
      msg: "Inventory updated successfully.",
      data: inventory,
    });
  } catch (err) {
    console.error("updateMyInventory error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function deleteMyInventory(req, res) {
  try {
    const session = await isPublisherSessionValid(req);
    if (!session.success) {
      return res.status(401).json(session);
    }
    const publisherId = session.data;

    const { error: paramError, value: paramValue } = Joi.object({
      id: Joi.number().integer().required(),
    }).validate(req.params);

    if (paramError) {
      return res.status(400).json({
        success: false,
        msg: paramError.details[0].message,
        data: null,
      });
    }

    const { id } = paramValue;

    const inventory = await Inventory.findOne({
      where: {
        id,
        publisherId,
      },
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        msg: "Inventory not found or you do not have access.",
        data: null,
      });
    }

   
    await inventory.update({
      partnerStatus: 0,
    });

    return res.json({
      success: true,
      msg: "Inventory disabled successfully.",
      data: null,
    });
  } catch (err) {
    console.error("deleteMyInventory error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

module.exports = {
  createMyInventory,
  getMyInventories,
  getMyInventoryById,
  updateMyInventory,
  deleteMyInventory,
};
