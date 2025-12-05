const Joi = require("joi");
const Inventory = require("../../models/Inventory");
const { Op } = require("sequelize");
const { getOption } = require("../../utils/helper");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
const Publisher = require("../../models/Publishers/Publisher");
const Partner = require("../../models/Partners/Partner");
const {
  verifyFileType,
  uploadFile,
  deleteFile,
} = require("../../utils/helpers/fileUpload");

// async function createInventory(req, res) {
//   try {
//     const schema = Joi.object({
//       publisherId: Joi.number().integer().required(),
//       type: Joi.string().valid("WEB", "APP", "OTT_CTV").required(),
//       name: Joi.string().max(255).required(),
//       url: Joi.string().uri().max(500).allow(null, ""),
//       developerWeb: Joi.string().uri().max(500).allow(null, ""),
//       description: Joi.string().allow(null, ""),
//       logo: Joi.string().uri().max(500).allow(null, ""),
//       adsTxtStatus: Joi.number().integer().valid(0, 1, 2).default(0),
//       partnerStatus: Joi.number().integer().valid(0, 1, 2).default(1),
//       status: Joi.number().integer().valid(0, 1, 2).default(1),
//       packageName: Joi.string().allow(null, ""),
//       is_deleted: Joi.number().integer().valid(0, 1).default(0),
//     });

//     const { error, value } = schema.validate(req.body, {
//       abortEarly: true,
//       stripUnknown: true,
//     });

//     if (error) {
//       return res.status(400).json({
//         success: false,
//         msg: error.details[0].message,
//       });
//     }
//     if (value.type === "WEB" && (!value.url || value.url.trim() === "")) {
//       return res.status(400).json({
//         success: false,
//         msg: "WEB inventory must include a valid URL.",
//       });
//     }
//     if (req.file) {
//       const ok = await verifyFileType(req.file);
//       if (!ok) {
//         return res
//           .status(400)
//           .json({ success: false, msg: "Invalid logo file type" });
//       }
//       const storedName = await uploadFile(req.file, "upload/inventory");
//       value.logo = storedName;
//     }
//     const inventory = await Inventory.create(value);

//     return res.status(201).json({
//       success: true,
//       msg: "Inventory created successfully",
//       data: inventory,
//     });
//   } catch (err) {
//     console.error("createInventory error:", err);
//     return res.status(500).json({
//       success: false,
//       msg: "Internal server error",
//     });
//   }
// }

async function createInventory(req, res) {
  try {
    // auth
    const session = await isAdminSessionValid(req);
    if (!session || session.success !== true) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    // NOTE: NO logo in schema – we handle it ONLY via req.file
    const schema = Joi.object({
      publisherId: Joi.number().integer().required(),
      partnerId: Joi.number().integer().allow(null).optional(),
      type: Joi.string().valid("WEB", "APP", "OTT_CTV").required(),
      name: Joi.string().max(255).required(),
      logo: Joi.string().max(500).allow(null, ""),
      developerWeb: Joi.string().uri().max(500).allow(null, ""),
      description: Joi.string().allow(null, ""),
      adsTxtStatus: Joi.number().integer().valid(0, 1, 2).default(0),
      partnerStatus: Joi.number().integer().valid(0, 1, 2).default(1),
      status: Joi.number().integer().valid(0, 1, 2).default(1),
      packageName: Joi.string().allow(null, ""),
      is_deleted: Joi.number().integer().valid(0, 1).default(0),
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

    // WEB + URL rule
    if (value.type === "WEB" && (!value.url || value.url.trim() === "")) {
      return res.status(400).json({
        success: false,
        msg: "WEB inventory must include a valid URL.",
      });
    }

    // ---------- handle logo file safely ----------
    let logoFilename = null;

    if (req.file) {
      console.log("tempPath: ", req.file.path);

      const vt = await verifyFileType(req.file);
      // vt might be { ok: true, mime, ext } OR boolean
      const ok = typeof vt === "boolean" ? vt : !!vt?.ok;

      console.log("verifyFileType res: ", vt);

      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid logo file type" });
      }

      const uploaded = await uploadFile(req.file, "upload/inventory");
      console.log("uploadFile returned:", uploaded);

      // uploaded can be string / object / boolean – normalize to string
      if (typeof uploaded === "string") {
        logoFilename = uploaded;
      } else if (uploaded && typeof uploaded === "object") {
        logoFilename =
          uploaded.filename ||
          uploaded.fileName ||
          uploaded.name ||
          uploaded.storedName ||
          uploaded.path ||
          null;
      } else {
        logoFilename = null;
      }

      // last safety check: only accept real string, not object/boolean
      if (typeof logoFilename !== "string") {
        console.warn(
          "Logo filename is not a string, skipping saving logo. Value:",
          logoFilename
        );
        logoFilename = null;
      }
    }

    // ---------- build clean payload (no objects/arrays) ----------
    const payload = {
      publisherId: value.publisherId,
      partnerId: typeof value.partnerId === "number" ? value.partnerId : null,
      type: value.type,
      name: value.name,
      url: value.url || "",
      developerWeb: value.developerWeb || "",
      description: value.description || "",
      adsTxtStatus:
        typeof value.adsTxtStatus === "number" ? value.adsTxtStatus : 0,
      partnerStatus:
        typeof value.partnerStatus === "number" ? value.partnerStatus : 1,
      status: typeof value.status === "number" ? value.status : 1,
      packageName: value.packageName || "",
      is_deleted: typeof value.is_deleted === "number" ? value.is_deleted : 0,
    };

    // only set logo if we have a valid string
    if (logoFilename) {
      payload.logo = logoFilename;
    }

    const inventory = await Inventory.create(payload);

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

const getInventories = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.perPage) || 10;
    const offset = (page - 1) * limit;

    const where = {};

    // ID filter (single inventory by id via list)
    if (req.query.id) {
      where.id = Number(req.query.id);
    }

    // PUBLISHER filter
    if (req.query.publisherId) {
      where.publisherId = Number(req.query.publisherId);
    }

    // PARTNER filter
    if (req.query.partnerId) {
      where.partnerId = Number(req.query.partnerId);
    }

    // NAME filter (LIKE)
    if (req.query.name) {
      where.name = { [Op.like]: `%${req.query.name}%` };
    }

    // URL filter (LIKE)
    if (req.query.url) {
      where.url = { [Op.like]: `%${req.query.url}%` };
    }

    // TYPE filter
    if (req.query.type) {
      where.type = req.query.type;
    }

    // STATUS filter
    if (req.query.status !== undefined && req.query.status !== '') {
      where.status = Number(req.query.status);
    }

    // PARTNER STATUS filter
    if (req.query.partnerStatus !== undefined && req.query.partnerStatus !== '') {
      where.partnerStatus = Number(req.query.partnerStatus);
    }

    // ADS.TXT STATUS filter
    if (req.query.adsTxtStatus !== undefined && req.query.adsTxtStatus !== '') {
      where.adsTxtStatus = Number(req.query.adsTxtStatus);
    }

    // DELETED / NON-DELETED filter
    if (req.query.is_deleted === '0' || req.query.is_deleted === '1') {
      where.is_deleted = Number(req.query.is_deleted); // 0 or 1
    }

    const sortBy = req.query.sortBy || 'updatedAt';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    const result = await Inventory.findAndCountAll({
      where,
      include: [
        { model: Publisher, as: 'publisher' },
        { model: Partner, as: 'partner' },
      ],
      limit,
      offset,
      order: [[sortBy, sortDir]],
    });

    return res.json({
      success: true,
      data: {
        rows: result.rows,
        pagination: {
          totalItems: result.count,
          totalPages: Math.ceil(result.count / limit) || 1,
          perPage: limit,
          currentPage: page,
        },
      },
    });
  } catch (error) {
    console.error('getInventories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch inventories',
    });
  }
};

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
      logo: Joi.string().max(500).allow(null, ""),
      adsTxtStatus: Joi.number().integer().valid(0, 1, 2),
      partnerStatus: Joi.number().integer().valid(0, 1, 2),
      status: Joi.number().integer().valid(0, 1, 2),
      is_deleted: Joi.number().integer().valid(0, 1),
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

    if (typeof value.is_deleted === "number") {
      updateData.is_deleted = value.is_deleted;
    }
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
    // avatar upload for logo (like editPartner)
    // if (req.file) {
    //   const ok = await verifyFileType(req.file);
    //   if (!ok) {
    //     return res
    //       .status(400)
    //       .json({ success: false, msg: "Invalid logo file type" });
    //   }

    //   const storedName = await uploadFile(req.file, "upload/inventory");
    //   updateData.logo = storedName;

    //   // delete old logo if exists
    //   if (inventory.logo) {
    //     try {
    //       await deleteFile(inventory.logo, "upload/inventory");
    //     } catch (_) {
    //       // ignore delete error
    //     }
    //   }
    // }

    // avatar upload for logo (like editPartner)
    if (req.file) {
      const vt = await verifyFileType(req.file);
      const ok = typeof vt === "boolean" ? vt : !!vt?.ok;

      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid logo file type" });
      }

      const uploaded = await uploadFile(req.file, "upload/inventory");

      let logoFilename = null;
      if (typeof uploaded === "string") {
        logoFilename = uploaded;
      } else if (uploaded && typeof uploaded === "object") {
        logoFilename =
          uploaded.filename ||
          uploaded.fileName ||
          uploaded.name ||
          uploaded.storedName ||
          uploaded.path ||
          null;
      }

      if (typeof logoFilename === "string" && logoFilename.trim() !== "") {
        updateData.logo = logoFilename;

        // delete old logo if exists
        if (inventory.logo) {
          try {
            await deleteFile(inventory.logo, "upload/inventory");
          } catch (_) {
            // ignore delete error
          }
        }
      }
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
    //  auth
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

    if (inventory.is_deleted === 1) {
      return res.status(200).json({
        success: true,
        msg: "Inventory already deleted.",
        data: inventory,
      });
    }

    await inventory.update({
      is_deleted: 1,
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
