const bcrypt = require("bcryptjs");
const Joi = require("joi");
const { Op } = require("sequelize");
const { getOption } = require("../../utils/helper");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
const {
  verifyFileType,
  uploadFile,
  deleteFile,
} = require("../../utils/helpers/fileUpload");
const sequelize = require("../../config/db");
const Admin = require("../../models/Admin/Admin");
const { verifyAdminRole } = require("../../utils/helper");
const { logAdminAction } = require("../../utils/helpers/adminLogger");

async function addAdmin(req, res) {
  try {
    const schema = Joi.object({
      username: Joi.string().max(150).trim().required(),
      email: Joi.string().email().max(255).trim().required(),
      password: Joi.string().min(8).max(255).required(),

      role: Joi.string()
        .valid("superAdmin", "staff", "paymentManager", "support")
        .default("staff"),

      status: Joi.number().integer().valid(0, 1, 2, 3).default(1),

      // NEW: unified 2FA field (0=off,1=app,2=email)
      twoFactorEnabled: Joi.number()
        .integer()
        .valid(0, 1, 2)
        .default(0),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    if (!value.username || !value.email || !value.password) {
      return res.status(400).json({
        success: false,
        msg: "username, email, and password are required.",
      });
    }

    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const adminId = session.data;

    const caller = await Admin.findByPk(adminId);
    if (!caller) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    if (!verifyAdminRole(caller, "addAdmin")) {
      return res.status(403).json({ success: false, msg: "Forbidden" });
    }

    // Normalize username/email
    value.email = String(value.email).toLowerCase().trim();
    value.username = String(value.username).trim();

    // Check uniqueness
    const existing = await Admin.findOne({
      where: {
        [Op.or]: [{ email: value.email }, { username: value.username }],
      },
      attributes: ["id", "email", "username"],
      paranoid: false,
    });

    if (existing) {
      const clash = existing.email === value.email ? "email" : "username";
      return res.status(409).json({
        success: false,
        msg: `An admin with this ${clash} already exists.`,
      });
    }

    // Hash password
    value.password = await bcrypt.hash(value.password, 10);

    // Handle avatar
    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }

      const stored = await uploadFile(req.file, "upload/admin");
      value.avatar = stored.filename;
    }

    // Unified 2FA: 0=off,1=app,2=email
    const twoFactorEnabled =
      typeof value.twoFactorEnabled === "number"
        ? value.twoFactorEnabled
        : 0;

    const createPayload = {
      username: value.username,
      email: value.email,
      password: value.password,
      role: value.role,
      status: value.status,
      avatar: value.avatar ?? null,
      twoFactorEnabled, // store directly in model
    };

    const created = await sequelize.transaction(async (t) => {
      const row = await Admin.create(createPayload, { transaction: t });
      return Admin.findByPk(row.id, {
        attributes: { exclude: ["password"] },
        transaction: t,
      });
    });

    try {
      const afterData = created.toJSON();

      await logAdminAction({
        adminId,
        actionCategory: "admin",
        actionType: "ADDED",
        beforeData: null,
        afterData,
      });

      console.log("Admin log created for ADD ADMIN:", created.id);
    } catch (logErr) {
      console.error("Failed to log admin ADD ADMIN:", logErr);
    }

    return res.status(201).json({
      success: true,
      msg: "Admin created successfully.",
      data: created,
    });
  } catch (err) {
    console.error("Error in addAdmin:", err);

    if (err?.name === "SequelizeUniqueConstraintError") {
      const field = err?.errors?.[0]?.path || "unique field";
      return res.status(409).json({
        success: false,
        msg: `Duplicate value for ${field}.`,
      });
    }

    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function editAdmin(req, res) {
  try {
    // 1) Params
    const { error: pErr, value: p } = Joi.object({
      id: Joi.number().integer().positive().required(),
    }).validate(req.params, { abortEarly: true, stripUnknown: true });

    if (pErr) {
      return res
        .status(400)
        .json({ success: false, msg: pErr.details[0].message });
    }

    // 2) Body
    const bodySchema = Joi.object({
      username: Joi.string().max(150).trim(),
      email: Joi.string().email().max(255).trim(),
      password: Joi.string().min(8).max(255).allow(null, ""),

      role: Joi.string().valid(
        "superAdmin",
        "staff",
        "paymentManager",
        "support"
      ),
      status: Joi.number().integer().valid(0, 1, 2, 3),

      // unified 2FA for update
      twoFactorEnabled: Joi.number().integer().valid(0, 1, 2),
    }).unknown(false);

    const { error: bErr, value: body } = bodySchema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (bErr) {
      return res
        .status(400)
        .json({ success: false, msg: bErr.details[0].message });
    }

    // 3) Auth
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }
    const actingAdminId = session.data;

    const caller = await Admin.findByPk(actingAdminId);
    if (!caller) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }
    if (!verifyAdminRole(caller, "editAdmin")) {
      return res.status(403).json({ success: false, msg: "Forbidden" });
    }

    // 4) Target admin
    const admin = await Admin.findByPk(p.id);
    if (!admin) {
      return res.status(404).json({ success: false, msg: "Admin not found" });
    }

    // 5) BEFORE snapshot for logs (remove sensitive fields)
    const beforeRaw = admin.toJSON();
    const { password: _pwBefore, ...beforeAdminData } = beforeRaw;
    const oldStatus = beforeAdminData.status;

    // 6) Normalize payload
    const payload = { ...body };
    if (payload.email) payload.email = payload.email.toLowerCase().trim();
    if (payload.username) payload.username = payload.username.trim();

    // 2FA update: if provided, just set it
    if (Object.prototype.hasOwnProperty.call(body, "twoFactorEnabled")) {
      payload.twoFactorEnabled = body.twoFactorEnabled;
    }

    // 7) Uniqueness checks
    if (payload.email || payload.username) {
      const orConds = [];
      if (payload.email) orConds.push({ email: payload.email });
      if (payload.username) orConds.push({ username: payload.username });

      const exists = await Admin.findOne({
        where: {
          [Op.and]: [{ id: { [Op.ne]: admin.id } }, { [Op.or]: orConds }],
        },
        attributes: ["id", "email", "username"],
        paranoid: false,
      });
      if (exists) {
        const clash =
          payload.email && exists.email === payload.email
            ? "email"
            : "username";
        return res.status(409).json({
          success: false,
          msg: `Another admin with this ${clash} already exists.`,
        });
      }
    }

    // 8) Password
    if (
      typeof payload.password === "string" &&
      payload.password.trim() !== ""
    ) {
      payload.password = await bcrypt.hash(payload.password, 10);
    } else {
      delete payload.password;
    }

    // 9) Avatar upload
    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }
      const stored = await uploadFile(req.file, "upload/admin");
      if (admin.avatar) {
        await deleteFile(admin.avatar, "upload/admin");
      }
      payload.avatar = stored.filename;
    }

    // 10) Transactional update and reload safe fields
    const updated = await sequelize.transaction(async (t) => {
      await admin.update(payload, { transaction: t });
      return Admin.findByPk(admin.id, {
        attributes: { exclude: ["password"] },
        transaction: t,
      });
    });

    // 11) AFTER snapshot and decide actionType
    const afterData = updated.toJSON();
    const newStatus = afterData.status;

    const actionType =
      typeof oldStatus !== "undefined" &&
      typeof newStatus !== "undefined" &&
      oldStatus !== newStatus
        ? "STATUS_CHANGED"
        : "EDITED";

    // 12) Log admin action
    try {
      await logAdminAction({
        adminId: actingAdminId,
        actionCategory: "admin",
        actionType,
        beforeData: beforeAdminData,
        afterData,
      });

      console.log(
        "PAYLOAD AVATAR DEBUG:",
        payload.avatar,
        typeof payload.avatar
      );

      console.log(
        `Admin log created for EDIT ADMIN (${actionType}):`,
        updated.id
      );
    } catch (logErr) {
      console.error("Failed to log admin EDIT ADMIN:", logErr);
    }

    return res.status(200).json({
      success: true,
      msg: "Admin updated successfully.",
      data: updated,
    });
  } catch (err) {
    console.error("Error in editAdmin:", err);
    if (err?.name === "SequelizeUniqueConstraintError") {
      const field = err?.errors?.[0]?.path || "unique field";
      return res.status(409).json({
        success: false,
        msg: `Duplicate value for ${field}.`,
      });
    }
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function getAdmins(req, res) {
  try {
    const { error, value } = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      sortBy: Joi.string()
        .valid(
          "id",
          "username",
          "email",
          "role",
          "status",
          "twoFactorEnabled",
          "createdAt",
          "updatedAt"
        )
        .default("createdAt"),
      sortDir: Joi.string().valid("asc", "desc").default("desc"),

      username: Joi.string().allow("", null),
      email: Joi.string().allow("", null),
      role: Joi.string()
        .valid("superAdmin", "staff", "paymentManager", "support")
        .allow("", null),
      status: Joi.number().integer().valid(0, 1, 2, 3),

      // filter by unified 2FA
      twoFactorEnabled: Joi.number().integer().valid(0, 1, 2),
    })
      .unknown(false)
      .validate(req.query, { abortEarly: true, stripUnknown: true });

    if (error)
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });

    // Auth
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }
    const caller = await Admin.findByPk(session.data);
    if (!caller)
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    if (!verifyAdminRole(caller, "getAdmins")) {
      return res.status(403).json({ success: false, msg: "Forbidden" });
    }

    const {
      page,
      sortBy,
      sortDir,
      username,
      email,
      role,
      status,
      twoFactorEnabled,
    } = value;

    // Filters
    const where = {};
    const sw = (k, v) => {
      if (v && String(v).trim() !== "")
        where[k] = { [Op.like]: `${String(v).trim()}%` };
    };
    sw("username", username);
    sw("email", typeof email === "string" ? email.toLowerCase() : email);
    sw("role", role);
    if (typeof status === "number") where.status = status;
    if (typeof twoFactorEnabled === "number") {
      where.twoFactorEnabled = twoFactorEnabled;
    }

    // Pagination + order
    const limit = parseInt(await getOption("admin_per_page", 10), 10) || 10;
    const offset = (page - 1) * limit;
    const order = [[sortBy, sortDir.toUpperCase()]];

    // Query — exclude secrets to be schema-safe
    const { rows, count } = await Admin.findAndCountAll({
      where,
      attributes: { exclude: ["password"] },
      order,
      offset,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: {
        rows,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit) || 1,
        },
      },
    });
  } catch (err) {
    console.error("Error in getAdmins:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function getAdminById(req, res) {
  try {
    const { error, value } = Joi.object({
      id: Joi.number().integer().positive().required(),
    }).validate(req.params, { abortEarly: true, stripUnknown: true });

    if (error)
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });

    // Auth
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }
    const caller = await Admin.findByPk(session.data);
    if (!caller)
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    if (!verifyAdminRole(caller, "getAdminById")) {
      return res.status(403).json({ success: false, msg: "Forbidden" });
    }

    const admin = await Admin.findByPk(value.id, {
      attributes: { exclude: ["password"] },
    });
    if (!admin)
      return res.status(404).json({ success: false, msg: "Admin not found" });

    return res.status(200).json({ success: true, data: admin });
  } catch (err) {
    console.error("Error in getAdminById:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function updateProfile(req, res) {
  try {
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }

    const admin = await Admin.findByPk(session.data);
    if (!admin) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    if (!verifyAdminRole(admin, "updateProfile")) {
      return res.status(403).json({ success: false, msg: "Forbidden" });
    }

    const bodySchema = Joi.object({
      username: Joi.string().max(150).trim().allow(null, ""),
    }).unknown(false);

    const { error: bErr, value: body } = bodySchema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (bErr) {
      return res
        .status(400)
        .json({ success: false, msg: bErr.details[0].message });
    }

    const payload = {};

    if (body.username && body.username.trim() !== "") {
      payload.username = body.username.trim();
    }

    if (payload.username) {
      const exists = await Admin.findOne({
        where: {
          [Op.and]: [
            { id: { [Op.ne]: admin.id } },
            { username: payload.username },
          ],
        },
        attributes: ["id", "username"],
        paranoid: false,
      });

      if (exists) {
        return res.status(409).json({
          success: false,
          msg: "Another admin with this username already exists.",
        });
      }
    }

    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }

      const stored = await uploadFile(req.file, "upload/admin");

      if (admin.avatar) {
        await deleteFile(admin.avatar, "upload/admin");
      }

      payload.avatar = stored.filename;
      console.log(
        "PAYLOAD AVATAR DEBUG:",
        payload.avatar,
        typeof payload.avatar
      );
    }

    if (Object.keys(payload).length === 0) {
      return res
        .status(400)
        .json({ success: false, msg: "Nothing to update." });
    }

    const updated = await sequelize.transaction(async (t) => {
      await admin.update(payload, { transaction: t });
      return Admin.findByPk(admin.id, {
        attributes: { exclude: ["password"] },
        transaction: t,
      });
    });

    return res.status(200).json({
      success: true,
      msg: "Profile updated successfully.",
      data: updated,
    });
  } catch (err) {
    console.error("Error in updateProfile:", err);
    if (err?.name === "SequelizeUniqueConstraintError") {
      const field = err?.errors?.[0]?.path || "unique field";
      return res
        .status(409)
        .json({ success: false, msg: `Duplicate value for ${field}.` });
    }
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function updatePassword(req, res) {
  try {
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }

    const admin = await Admin.findByPk(session.data);
    if (!admin) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    // If you want a dedicated permission, change "updateProfile" to "updatePassword"
    if (!verifyAdminRole(admin, "updateProfile")) {
      return res.status(403).json({ success: false, msg: "Forbidden" });
    }

    const bodySchema = Joi.object({
      old_password: Joi.string().min(8).max(255).required(),
      new_password: Joi.string().min(8).max(255).required(),
      confirm_password: Joi.any()
        .valid(Joi.ref("new_password"))
        .required()
        .messages({
          "any.only": "Confirm password must match new password.",
        }),
    }).unknown(false);

    const { error: bErr, value: body } = bodySchema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (bErr) {
      return res
        .status(400)
        .json({ success: false, msg: bErr.details[0].message });
    }

    const { old_password, new_password } = body;

    const isMatch = await bcrypt.compare(old_password, admin.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, msg: "Old password is incorrect." });
    }

    const isSameAsOld = await bcrypt.compare(new_password, admin.password);
    if (isSameAsOld) {
      return res.status(400).json({
        success: false,
        msg: "New password must be different from the old password.",
      });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    const updated = await sequelize.transaction(async (t) => {
      await admin.update({ password: hashedPassword }, { transaction: t });

      return Admin.findByPk(admin.id, {
        attributes: { exclude: ["password"] },
        transaction: t,
      });
    });

    return res.status(200).json({
      success: true,
      msg: "Password updated successfully.",
      data: updated,
    });
  } catch (err) {
    console.error("Error in updatePassword:", err);

    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

module.exports = {
  addAdmin,
  editAdmin,
  getAdmins,
  getAdminById,
  updateProfile,
  updatePassword,
};
