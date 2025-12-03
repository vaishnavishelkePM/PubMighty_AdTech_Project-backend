const Joi = require("joi");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const Publisher = require("../../models/Publishers/Publisher");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
const {
  verifyFileType,
  uploadFile,
  deleteFile,
} = require("../../utils/helpers/fileUpload");
const { logAdminAction } = require("../../utils/helpers/adminLogger");
const PartnerPublisher = require("../../models/PartnerPublisher");
const Partner = require("../../models/Partners/Partner");
// GET /admin/publishers

async function getPublishers(req, res) {
  try {
    // 1) Validate admin session
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      perPage: Joi.number().integer().min(1).max(100).default(10),

      id: Joi.number().integer().positive().optional(),
      username: Joi.string().trim().allow(""),
      email: Joi.string().trim().allow(""),
      country: Joi.string().trim().max(10).allow(""),

      status: Joi.number().integer().valid(0, 1, 2, 3).optional(),
      twoFA: Joi.number().integer().valid(0, 1, 2).optional(),

      sortBy: Joi.string()
        .valid("id", "username", "status", "updatedAt", "createdAt")
        .default("updatedAt"),
      sortDir: Joi.string().valid("asc", "ASC", "desc", "DESC").default("DESC"),
      is_deleted: Joi.number().integer().valid(0, 1).default(0),
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
      username,
      email,
      country,
      status,
      twoFA,
      sortBy,
      is_deleted,
      sortDir,
    } = value;

    // 3) Build where conditions
    const where = {};

    if (id) {
      // Exact ID match
      where.id = id;
    }

    if (username) {
      where.username = { [Op.like]: `%${username}%` };
    }

    if (email) {
      where.email = { [Op.like]: `%${email}%` };
    }

    if (country) {
      where.country = country;
    }

    if (typeof status === "number") {
      where.status = status;
    }

    if (typeof twoFA === "number") {
      where.twoFactorEnabled = twoFA;
    }
    if (typeof is_deleted === "number") {
      where.is_deleted = is_deleted;
    }
    const offset = (page - 1) * perPage;

    const order = [[sortBy, sortDir.toUpperCase()]];

    // 4) Fetch from DB
    const { rows, count } = await Publisher.findAndCountAll({
      where,
      order,
      include: [
        {
          model: PartnerPublisher,
          as: "publisherLinks",
          include: [
            {
              model: Partner,
              as: "partner",
              attributes: ["id", "username", "email", "status"],
            },
          ],
        },
      ],
      offset,
      limit: perPage,
    });

    const totalPages = Math.ceil(count / perPage);

    // 5) Return result
    return res.status(200).json({
      success: true,
      msg: "Publishers fetched successfully.",
      data: {
        rows,
        pagination: {
          totalItems: count,
          totalPages,
          currentPage: page,
          perPage,
        },
      },
    });
  } catch (err) {
    console.error("Error in getPublishers:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function addPublisher(req, res) {
  try {
    // 1) admin must be logged in
    const session = await isAdminSessionValid(req, res);
    if (!session || session.success !== true) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }
    const adminId = session.data; // (kept for future audit if needed)

    // 2) validate body (aligned with registerPublisher style)
    const schema = Joi.object({
      username: Joi.string()
        .pattern(/^[A-Za-z0-9_.]+$/)
        .min(3)
        .max(30)
        .required()
        .messages({
          "string.pattern.base":
            "username can only contain letters, numbers, underscores, and dots.",
          "string.min": "username must be at least 3 characters long.",
          "string.max": "username cannot exceed 30 characters.",
          "any.required": "username is required.",
        }),

      // email: same rules as register but still optional for admin-created accounts
      email: Joi.string().email().max(300).allow(null, "").optional().messages({
        "string.email": "Please enter a valid email address.",
      }),

      // password: same minimum, but keep your max 255
      password: Joi.string().min(8).max(255).required().messages({
        "string.min": "Password must be at least 8 characters long.",
        "string.max": "Password cannot exceed 255 characters.",
        "any.required": "Password is required.",
      }),

      phoneNo: Joi.string().max(100).allow(null, "").optional(),
      gender: Joi.string().max(10).allow(null, "").optional(),
      country: Joi.string().max(3).allow(null, "").optional(),
      language: Joi.string().max(3).default("en"),
      // 0=pending, 1=active, 2=suspended, 3=disabled
      status: Joi.number().integer().valid(0, 1, 2, 3).default(1),
      // 0=disabled, 1=email, 2=auth_app (as per your model)
      twoFactorEnabled: Joi.number().integer().valid(0, 1, 2).default(0),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    // 3) normalize username/email similar to registerPublisher
    value.username = String(value.username).toLowerCase().trim();
    if (value.email) {
      value.email = String(value.email).toLowerCase().trim();
    }

    // 4) check username/email uniqueness
    const whereOr = [{ username: value.username }];
    if (value.email && value.email !== "") {
      whereOr.push({ email: value.email });
    }

    const existing = await Publisher.findOne({
      where: {
        [Op.or]: whereOr,
      },
    });

    if (existing) {
      const clash = existing.username === value.username ? "username" : "email";
      return res.status(409).json({
        success: false,
        msg: `A publisher with this ${clash} already exists.`,
      });
    }

    // 5) hash password (same as before, you can swap to BCRYPT_ROUNDS if you use it)
    const hashed = await bcrypt.hash(value.password, 10);
    value.password = hashed;

    // 6) optional avatar upload (reuse your image helpers)
    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }
      const storedName = await uploadFile(req.file, "upload/publishers");
      value.avatar = storedName.filename;
    }

    // 7) generate publicId (keep your existing pattern)
    value.publicId =
      "publisher_" +
      value.username +
      "_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);

    // 8) set registeredIp (same as before; registerPublisher uses getRealIp but this is fine)
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    value.registeredIp = ip;

    // 9) create publisher
    const publisher = await Publisher.create(value);
    const Data = publisher.toJSON();
    delete Data.password;
    await logAdminAction({
      adminId, // who performed the action
      actionCategory: "publisher", // which module
      actionType: "ADDED", // what action
      beforeData: null, // no previous data (new row)
      afterData: Data, // full publisher record as JSON
    });

    return res.status(201).json({
      success: true,
      msg: "Publisher created successfully.",
      data: {
        id: publisher.id,
        publicId: publisher.publicId,
        username: publisher.username,
        email: publisher.email,
        phoneNo: publisher.phoneNo,
        country: publisher.country,
        language: publisher.language,
        status: publisher.status, // 0=pending,1=active,2=suspended,3=disabled
        twoFactorEnabled: publisher.twoFactorEnabled,
        avatar: publisher.avatar,
        createdAt: publisher.createdAt,
      },
    });
  } catch (err) {
    console.error("Error in addPublisher:", err);

    if (err?.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ success: false, msg: "Username or email already exists." });
    }

    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function getPublisherById(req, res) {
  try {
    // 1) Validate params
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
    });

    const { error, value } = schema.validate(req.params, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    // 2) Validate admin session
    const session = await isAdminSessionValid(req, res);
    if (!session?.success) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    // 3) Fetch publisher by ID
    const publisher = await Publisher.findByPk(value.id);
    if (!publisher) {
      return res
        .status(404)
        .json({ success: false, msg: "Publisher not found" });
    }

    // 4) Respond with data
    return res.status(200).json({
      success: true,
      msg: "Publisher fetched successfully.",
      data: publisher,
    });
  } catch (err) {
    console.error("Error in getPublisherById:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

// POST /admin/publishers/update-publkisher
async function editPublisher(req, res) {
  try {
    // Validate :id
    const paramSchema = Joi.object({
      id: Joi.number().integer().positive().required(),
    });

    const { error: paramErr, value: params } = paramSchema.validate(
      req.params,
      {
        abortEarly: true,
        stripUnknown: true,
      }
    );

    if (paramErr) {
      return res
        .status(400)
        .json({ success: false, msg: paramErr.details[0].message });
    }

    // Validate body
    const bodySchema = Joi.object({
      username: Joi.string().max(50),
      email: Joi.string().email().max(300).allow(null, ""),
      password: Joi.string().min(8).max(255).allow(null, ""),
      phoneNo: Joi.string().max(100).allow(null, ""),
      gender: Joi.string().max(10).allow(null, ""),
      country: Joi.string().max(3).allow(null, ""),
      language: Joi.string().max(3),
      status: Joi.number().integer().valid(0, 1, 2, 3),
      twoFactorEnabled: Joi.number().integer().valid(0, 1, 2),

      is_deleted: Joi.number().integer().valid(0, 1),
    });

    const { error: bodyErr, value: body } = bodySchema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (bodyErr) {
      return res
        .status(400)
        .json({ success: false, msg: bodyErr.details[0].message });
    }

    // Admin session validation
    const session = await isAdminSessionValid(req, res);
    if (!session?.success) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }
    const adminId = session.data;

    // Load publisher
    const publisher = await Publisher.findByPk(params.id);
    if (!publisher) {
      return res
        .status(404)
        .json({ success: false, msg: "Publisher not found" });
    }

    // Before-update snapshot
    const beforePlain = publisher.get({ plain: true });
    const {
      password: oldPass,
      two_fa_secret: oldSecret,
      twoFaSecret: oldSecret2,
      ...beforeLog
    } = beforePlain;

    // Uniqueness checks (only if email or username is being changed)
    if (body.username || body.email) {
      const exists = await Publisher.findOne({
        where: {
          [Op.and]: [
            { id: { [Op.ne]: publisher.id } },
            {
              [Op.or]: [
                body.username ? { username: body.username } : null,
                body.email ? { email: body.email } : null,
              ].filter(Boolean),
            },
          ],
        },
      });

      if (exists) {
        return res.status(409).json({
          success: false,
          msg: "Another publisher with this username/email already exists.",
        });
      }
    }

    // Prepare update payload
    const payload = { ...body };

    // Password update
    if (payload.password && payload.password.trim() !== "") {
      payload.password = await bcrypt.hash(payload.password, 10);
    } else {
      delete payload.password;
    }

    // Avatar upload
    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }

      const storedName = await uploadFile(req.file, "upload/publishers");
      payload.avatar = storedName.filename;

      if (publisher.avatar) {
        await deleteFile(publisher.avatar, "upload/publishers");
      }
    }

    // Perform update
    await publisher.update(payload);
    await publisher.reload();

    // After-update snapshot
    const afterPlain = publisher.get({ plain: true });
    const {
      password: newPass,
      two_fa_secret: newSecret,
      twoFaSecret: newSecret2,
      ...afterSafe
    } = afterPlain;

    // Determine action type
    let actionType = "EDITED";
    if (beforeLog.status !== afterSafe.status) {
      actionType = "STATUS_CHANGED";
    }

    // Write admin log
    await logAdminAction({
      adminId,
      actionCategory: "publisher",
      actionType,
      beforeData: beforeLog,
      afterData: afterSafe,
    });

    return res.status(200).json({
      success: true,
      msg: "Publisher updated successfully.",
      data: publisher,
    });
  } catch (err) {
    console.error("Error in editPublisher:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

// delete /admin/publishers/:id/delete
async function deletePublisher(req, res) {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
    });

    const { error, value } = schema.validate(req.params, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    const session = await isAdminSessionValid(req, res);
    if (!session?.success) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const publisher = await Publisher.findByPk(value.id);
    if (!publisher) {
      return res
        .status(404)
        .json({ success: false, msg: "Publisher not found" });
    }

    // if (publisher.status === 0) {
    //   return res
    //     .status(400)
    //     .json({ success: false, msg: "Publisher already deleted." });
    // }

    if (Number(publisher.is_deleted) === 1) {
      return res.status(200).json({
        success: true,
        msg: "publisher already deleted.",
        data: { id: publisher.id },
      });
    }

    await publisher.update({ is_deleted: 1 });

    if (publisher.avatar) {
      deleteFile(publisher.avatar, "upload/publishers").catch((err) => {
        console.error("Failed to delete publisher avatar:", err);
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Publisher deleted successfully.",
      data: {
        id: publisher.id,
        username: publisher.username,
        email: publisher.email,
        newStatus: 0,
        is_deleted: 1,
      },
    });
  } catch (err) {
    console.error("Error in deletePublisher:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

module.exports = {
  getPublishers,
  addPublisher,
  getPublisherById,
  editPublisher,
  deletePublisher,
};
