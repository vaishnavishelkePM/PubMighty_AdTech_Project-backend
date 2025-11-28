// const bcrypt = require("bcryptjs");
// const Joi = require("joi");
// const { Op } = require("sequelize");
// const { getOption, toNullIfEmpty } = require("../../utils/helper");
// const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
// const {
//   verifyFileType,
//   uploadFile,
//   deleteFile,
// } = require("../../utils/helpers/fileUpload");
// const sequelize = require("../../config/db");
// const Admin = require("../../models/Admin/Admin");
// const { verifyAdminRole } = require("../../utils/helper");

// async function addAdmin(req, res) {
//   try {
//     // 1) validate body (push defaults/conditionals into Joi)
//     const schema = Joi.object({
//       username: Joi.string().max(150).trim().required(),
//       email: Joi.string().email().max(255).trim().required(),
//       password: Joi.string().min(8).max(255).required(),

//       role: Joi.string()
//         .valid("superAdmin", "staff", "paymentManager", "support")
//         .default("staff"),

//       status: Joi.number().integer().valid(0, 1, 2, 3).default(1),

//       //   first_name: Joi.string().max(256).trim().allow(null, "").default(null),
//       last_name: Joi.string().max(256).trim().allow(null, "").default(null),

//       two_fa: Joi.number().valid(0, 1).default(0),

//       // two_fa_method rules:
//       // - if two_fa=1 -> default to 'email' (or 'auth_app' if explicitly provided)
//       // - if two_fa=0 -> must be null
//       two_fa_method: Joi.when("two_fa", {
//         is: 1,
//         then: Joi.string().valid("email", "auth_app").default("email"),
//         otherwise: Joi.valid(null).default(null),
//       }),

//       // If you want to require a secret only for auth_app, uncomment the 'when' below
//       two_fa_secret: Joi.alternatives().conditional("two_fa_method", {
//         is: "auth_app",
//         then: Joi.string().max(300).required(),
//         otherwise: Joi.string().max(300).allow(null, "").default(null),
//       }),
//     });

//     const { error, value } = schema.validate(req.body, {
//       abortEarly: true,
//       stripUnknown: true,
//       convert: true,
//     });

//     if (error) {
//       return res.status(400).json({
//         success: false,
//         msg: error.details[0].message,
//       });
//     }

//     // normalize case
//     value.email = value.email.toLowerCase();
//     value.username = value.username.trim();

//     // 2) find acting admin (session or reject)
//     const session = await isAdminSessionValid(req);
//     if (!session?.success || !session?.data) {
//       return res.status(401).json({
//         success: false,
//         msg: "Unauthorized",
//       });
//     }

//     const mainAdmin = await Admin.findByPk(session.data);
//     if (!mainAdmin) {
//       return res.status(401).json({
//         success: false,
//         msg: "Unauthorized",
//       });
//     }

//     // 3) role check (boolean)
//     const allowed = verifyAdminRole(mainAdmin, "addAdmin");
//     if (!allowed) {
//       return res.status(403).json({
//         success: false,
//         msg: "Forbidden: you do not have permission to add admins.",
//       });
//     }

//     // 4) uniqueness check (email/username), include soft-deleted if you want to block reuse
//     const existing = await Admin.findOne({
//       where: {
//         [Op.or]: [{ email: value.email }, { username: value.username }],
//       },
//       attributes: ["id", "email", "username"],
//       paranoid: false,
//     });

//     if (existing) {
//       const clash = existing.email === value.email ? "email" : "username";
//       return res.status(409).json({
//         success: false,
//         msg: `An admin with this ${clash} already exists.`,
//       });
//     }

//     // 5) hash password
//     value.password = await bcrypt.hash(value.password, 10);

//     // 6) optional avatar upload/profiles//profiles/
//     if (req.file) {
//       const ok = await verifyFileType(req.file);
//       if (!ok) {
//         return res.status(400).json({
//           success: false,
//           msg: "Invalid file type",
//         });
//       }
//       const storedName = await uploadFile(req.file, "upload/profiles//profiles//profiles/admin");
//       // If your column is 'avtar', change below to value.avtar = storedName;
//       value.avatar = storedName;
//     }

//     // 7) create in a transaction
//     const created = await sequelize.transaction(async (t) => {
//       const row = await Admin.create(value, { transaction: t });

//       // re-fetch without sensitive fields
//       const safe = await Admin.findByPk(row.id, {
//         attributes: { exclude: ["password", "two_fa_secret"] },
//         transaction: t,
//       });
//       return safe;
//     });

//     return res.status(201).json({
//       success: true,
//       msg: "Admin created successfully.",
//       data: created,
//     });
//   } catch (err) {
//     console.error("Error in addAdmin:", err);

//     if (err?.name === "SequelizeUniqueConstraintError") {
//       const field = err?.errors?.[0]?.path || "unique field";
//       return res.status(409).json({
//         success: false,
//         msg: `Duplicate value for ${field}.`,
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       msg: "Internal server error",
//     });
//   }
// }

// async function editAdmin(req, res) {
//   try {
//     // 1) validate params
//     const paramSchema = Joi.object({
//       id: Joi.number().integer().positive().required(),
//     }).unknown(false);

//     const { error: paramErr, value: params } = paramSchema.validate(
//       req.params,
//       {
//         abortEarly: true,
//         stripUnknown: true,
//       }
//     );
//     if (paramErr) {
//       return res.status(400).json({
//         success: false,
//         msg: paramErr.details[0].message,
//       });
//     }

//     // 2) validate body (conditionals inline)
//     const bodySchema = Joi.object({
//       username: Joi.string().max(150).trim(),
//       email: Joi.string().email().max(255).trim(),
//       password: Joi.string().min(8).max(255).allow(null, ""),
//       firstName: Joi.string().max(256).trim().allow(null, ""),
//       lastName: Joi.string().max(256).trim().allow(null, ""),
//       role: Joi.string()
//         .valid("superAdmin", "staff", "paymentManager", "support")
//         .optional(),
//       status: Joi.number().integer().valid(0, 1, 2, 3).optional(),
//       two_fa: Joi.number().valid(0, 1).optional(),
//       two_fa_method: Joi.when("two_fa", {
//         is: 1,
//         then: Joi.string().valid("email", "auth_app").default("email"),
//         otherwise: Joi.valid(null).default(null),
//       }),
//       two_fa_secret: Joi.alternatives().conditional("two_fa_method", {
//         is: "auth_app",
//         then: Joi.string().max(300).required(),
//         otherwise: Joi.string().max(300).allow(null, "").default(null),
//       }),
//     }).unknown(false);

//     const { error: bodyErr, value: rawBody } = bodySchema.validate(req.body, {
//       abortEarly: true,
//       stripUnknown: true,
//       convert: true,
//     });
//     if (bodyErr) {
//       return res.status(400).json({
//         success: false,
//         msg: bodyErr.details[0].message,
//       });
//     }

//     // 3) auth: require a valid admin session
//     const session = await isAdminSessionValid(req);
//     if (!session?.success || !session?.data) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const callerAdmin = await Admin.findByPk(session.data);
//     if (!callerAdmin) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     // 4) permission check
//     const allowed = verifyAdminRole(callerAdmin, "editAdmin");
//     if (!allowed) {
//       return res.status(403).json({
//         success: false,
//         msg: "Forbidden: you do not have permission to edit admins.",
//       });
//     }

//     // 5) load target admin
//     const admin = await Admin.findByPk(params.id);
//     if (!admin) {
//       return res.status(404).json({ success: false, msg: "Admin not found" });
//     }

//     // 6) normalize + prepare payload
//     const payload = { ...rawBody };

//     if (payload.email) payload.email = payload.email.toLowerCase();
//     if (payload.username) payload.username = payload.username.trim();

//     // set nullable fields to null when empty
//     const nullableKeys = new Set(["two_fa_secret"]);
//     for (const k of Object.keys(payload)) {
//       if (nullableKeys.has(k)) payload[k] = toNullIfEmpty(payload[k]);
//     }

//     // 7) uniqueness checks (exclude self)
//     if (payload.email || payload.username) {
//       const orConds = [];
//       if (payload.email) orConds.push({ email: payload.email });
//       if (payload.username) orConds.push({ username: payload.username });

//       const exists = await Admin.findOne({
//         where: {
//           [Op.and]: [{ id: { [Op.ne]: admin.id } }, { [Op.or]: orConds }],
//         },
//         attributes: ["id", "email", "username"],
//         paranoid: false, // include soft-deleted if you want to block reuse
//       });

//       if (exists) {
//         let clash = "username";
//         if (payload.email && exists.email === payload.email) clash = "email";
//         return res.status(409).json({
//           success: false,
//           msg: `Another admin with this ${clash} already exists.`,
//         });
//       }
//     }

//     // 8) password hashing (only if provided & non-blank)
//     if (
//       typeof payload.password === "string" &&
//       payload.password.trim() !== ""
//     ) {
//       payload.password = await bcrypt.hash(payload.password, 10);
//     } else {
//       delete payload.password; // don't overwrite with empty
//     }

//     // 9) optional avatar upload/profiles//profiles/ (keep 'avtar' if that's your column)
//     if (req.file) {
//       const ok = await verifyFileType(req.file);
//       if (!ok) {
//         return res
//           .status(400)
//           .json({ success: false, msg: "Invalid file type" });
//       }
//       const storedName = await uploadFile(req.file, "upload/profiles//profiles//profiles/admin");
//       // delete previous if present
//       if (admin.avtar) {
//         await deleteFile(admin.avtar, "upload/profiles//profiles//profiles/admin");
//       }
//       payload.avtar = storedName;
//     }

//     // 10) transactionally update and return safe view
//     const updated = await sequelize.transaction(async (t) => {
//       await admin.update(payload, { transaction: t });
//       const safe = await Admin.findByPk(admin.id, {
//         attributes: { exclude: ["password", "two_fa_secret"] },
//         transaction: t,
//       });
//       return safe;
//     });

//     return res.status(200).json({
//       success: true,
//       msg: "Admin updated successfully.",
//       data: updated,
//     });
//   } catch (err) {
//     console.error("Error in editAdmin:", err);

//     if (err?.name === "SequelizeUniqueConstraintError") {
//       const field = err?.errors?.[0]?.path || "unique field";
//       return res
//         .status(409)
//         .json({ success: false, msg: `Duplicate value for ${field}.` });
//     }

//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// // ----------------------
// // SORTABLE FIELDS
// // ----------------------
// const SORTABLE_FIELDS = [
//   "id",
//   "username",
//   "email",
//   "role",
//   "status",
//   "two_fa",
//   "createdAt",
//   "updatedAt",
// ];

// const SORT_MAP = {
//   id: "id",
//   username: "username",
//   email: "email",
//   role: "role",
//   status: "status",
//   two_fa: "two_fa",
//   createdAt: "createdAt",
//   updatedAt: "updatedAt",
//   created_at: "createdAt",
//   updated_at: "updatedAt",
// };

// async function getAdmins(req, res) {
//   try {
//     // 1) validate query
//     const querySchema = Joi.object({
//       page: Joi.number().integer().min(1).default(1),

//       // sortBy must match the *keys* we support
//       sortBy: Joi.string()
//         .valid(...SORTABLE_FIELDS, "created_at", "updated_at")
//         .default("createdAt"),

//       sortDir: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),

//       // filters
//       username: Joi.string().allow("", null),
//       email: Joi.string().allow("", null),
//       status: Joi.number().integer().valid(0, 1, 2, 3),
//       role: Joi.string()
//         .valid("superAdmin", "staff", "paymentManager", "support")
//         .allow("", null),
//       two_fa: Joi.number().integer().valid(0, 1),
//     }).unknown(false);

//     const { error, value } = querySchema.validate(req.query, {
//       abortEarly: true,
//       stripUnknown: true,
//       convert: true,
//     });

//     if (error) {
//       return res.status(400).json({
//         success: false,
//         msg: error.details[0].message,
//       });
//     }

//     // 2) auth: require valid admin session
//     const session = await isAdminSessionValid(req);
//     if (!session?.success || !session?.data) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const callerAdmin = await Admin.findByPk(session.data);
//     if (!callerAdmin) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     // 3) permission check
//     const allowed = verifyAdminRole(callerAdmin, "getAdmins");
//     if (!allowed) {
//       return res.status(403).json({
//         success: false,
//         msg: "Forbidden: you do not have permission to view admins.",
//       });
//     }

//     // 4) build filters
//     const { page, sortBy, sortDir, username, email, role, status, two_fa } =
//       value;

//     const where = {};

//     const applyStartsWith = (key, val) => {
//       if (typeof val === "string" && val.trim() !== "") {
//         where[key] = { [Op.like]: `${val.trim()}%` };
//       }
//     };

//     applyStartsWith("username", username);

//     applyStartsWith(
//       "email",
//       typeof email === "string" ? email.toLowerCase() : email
//     );

//     // role is an ENUM in your model – LIKE is okay, but you could also use exact
//     applyStartsWith("role", role);

//     if (typeof status === "number") where.status = status;
//     if (typeof two_fa === "number") where.two_fa = two_fa;

//     // 5) pagination + ordering
//     const limit = parseInt(await getOption("admin_per_page", 10), 10) || 10;
//     const offset = (page - 1) * limit;

//     // normalize sort field & direction
//     const sortField = SORT_MAP[sortBy] || "createdAt";
//     const sortDirection = sortDir.toUpperCase() === "ASC" ? "ASC" : "DESC";
//     const order = [[sortField, sortDirection]];

//     // 6) query
//     const { rows, count } = await Admin.findAndCountAll({
//       where,
//       attributes: [
//         "id",
//         "status",
//         "username",
//         "firstName",
//         "lastName",
//         "email",
//         "role",
//         "avatar",
//         "two_fa",
//         "createdAt",
//         "updatedAt",
//       ],
//       order,
//       offset,
//       limit,
//     });

//     // 7) respond
//     return res.status(200).json({
//       success: true,
//       data: {
//         rows,
//         pagination: {
//           page,
//           limit,
//           total: count,
//           totalPages: Math.ceil(count / limit) || 1,
//         },
//       },
//     });
//   } catch (err) {
//     console.error("Error in getAdmins:", err);
//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// async function getAdminById(req, res) {
//   try {
//     // 1) validate params
//     const schema = Joi.object({
//       id: Joi.number().integer().positive().required(),
//     }).unknown(false);

//     const { error, value } = schema.validate(req.params, {
//       abortEarly: true,
//       stripUnknown: true,
//       convert: true,
//     });

//     if (error) {
//       return res.status(400).json({
//         success: false,
//         msg: error.details[0].message,
//       });
//     }

//     // 2) auth: require valid admin session
//     const session = await isAdminSessionValid(req);
//     if (!session?.success || !session?.data) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const callerAdmin = await Admin.findByPk(session.data);
//     if (!callerAdmin) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     // 3) permission check
//     const allowed = verifyAdminRole(callerAdmin, "getAdminById");
//     if (!allowed) {
//       return res.status(403).json({
//         success: false,
//         msg: "Forbidden: you do not have permission to view this admin.",
//       });
//     }

//     // 4) fetch target admin (exclude sensitive fields)
//     const admin = await Admin.findByPk(value.id, {
//       attributes: { exclude: ["password", "two_fa_secret"] },
//     });
//     if (!admin) {
//       return res.status(404).json({ success: false, msg: "Admin not found" });
//     }
//     // 5) respond
//     return res.status(200).json({
//       success: true,
//       data: admin,
//     });
//   } catch (err) {
//     console.error("Error in getAdminById:", err);
//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// async function updateProfile(req, res) {
//   try {
//     // 1) validate body
//     const bodySchema = Joi.object({
//       username: Joi.string().max(150).trim().allow(null, ""),
//     })
//       .min(1)
//       .unknown(false);

//     const { error: bodyErr, value: body } = bodySchema.validate(req.body, {
//       abortEarly: true,
//       stripUnknown: true,
//       convert: true,
//     });
//     if (bodyErr) {
//       return res.status(400).json({
//         success: false,
//         msg: bodyErr.details[0].message,
//       });
//     }

//     // 2) auth: require valid admin session
//     const session = await isAdminSessionValid(req);
//     if (!session?.success || !session?.data) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const callerAdmin = await Admin.findByPk(session.data);
//     if (!callerAdmin) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     // 3) permission check
//     // Define this permission in your matrix (e.g., everyone can update own profile)
//     const allowed = verifyAdminRole(callerAdmin, "updateProfile");
//     if (!allowed) {
//       return res.status(403).json({
//         success: false,
//         msg: "Forbidden: you do not have permission to update profile.",
//       });
//     }

//     // 4) load current admin (self)
//     const admin = await Admin.findByPk(callerAdmin.id);
//     if (!admin) {
//       return res.status(404).json({ success: false, msg: "Admin not found" });
//     }

//     // 5) uniqueness check for username (exclude self)
//     if (body.username && body.username.trim() !== "") {
//       const exists = await Admin.findOne({
//         where: {
//           [Op.and]: [
//             { id: { [Op.ne]: admin.id } },
//             { username: body.username.trim() },
//           ],
//         },
//         attributes: ["id", "username"],
//         paranoid: false, // block reuse even if soft-deleted, optional
//       });
//       if (exists) {
//         return res.status(409).json({
//           success: false,
//           msg: "Another admin with this username already exists.",
//         });
//       }
//     }

//     // 6) normalize empties to null for nullable fields
//     const payload = { ...body };
//     //  const nullableKeys = new Set(["first_name", "last_name"]);
//     // for (const k of Object.keys(payload)) {
//     //   if (nullableKeys.has(k)) payload[k] = toNullIfEmpty(payload[k]);
//     // }
//     if (payload.username) payload.username = payload.username.trim();

//     // 7) password change with old password verification
//     if (
//       typeof payload.password === "string" &&
//       payload.password.trim() !== ""
//     ) {
//       if (!body.old_password || body.old_password.trim() === "") {
//         return res.status(400).json({
//           success: false,
//           msg: "Old password is required to change password.",
//         });
//       }

//       const isOldValid = await bcrypt.compare(
//         body.old_password,
//         admin.password
//       );
//       if (!isOldValid) {
//         return res.status(400).json({
//           success: false,
//           msg: "Old password is incorrect.",
//         });
//       }

//       payload.password = await bcrypt.hash(payload.password, 10);
//     } else {
//       delete payload.password; // don't overwrite with empty
//     }

//     // 8) avatar file (multer field: "avtar")
//     if (req.file) {
//       const ok = await verifyFileType(req.file);
//       if (!ok) {
//         return res
//           .status(400)
//           .json({ success: false, msg: "Invalid file type" });
//       }
//       const storedName = await uploadFile(req.file, "upload/profiles//profiles//profiles/admin");
//       if (admin.avtar) {
//         await deleteFile(admin.avtar, "upload/profiles//profiles//profiles/admin");
//       }
//       payload.avtar = storedName; // keep 'avtar' if that's your actual column
//     }

//     // 9) update & return safe view
//     await admin.update(payload);
//     const safe = await Admin.findByPk(admin.id, {
//       attributes: { exclude: ["password", "two_fa_secret"] },
//     });

//     return res.status(200).json({
//       success: true,
//       msg: "Profile updated successfully.",
//       data: safe,
//     });
//   } catch (err) {
//     console.error("Error in updateProfile:", err);

//     if (err?.name === "SequelizeUniqueConstraintError") {
//       const field = err?.errors?.[0]?.path || "unique field";
//       return res.status(409).json({
//         success: false,
//         msg: `Duplicate value for ${field}.`,
//       });
//     }

//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }
// async function updatePassword(req, res) {
//   try {
//     const session = await isAdminSessionValid(req, res);
//     if (!session?.success || !session?.data) {
//       return res
//         .status(401)
//         .json({ success: false, msg: session?.msg || "Unauthorized" });
//     }

//     const admin = await Admin.findByPk(session.data);
//     if (!admin) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     // If you want a dedicated permission, change "updateProfile" to "updatePassword"
//     if (!verifyAdminRole(admin, "updateProfile")) {
//       return res.status(403).json({ success: false, msg: "Forbidden" });
//     }

//     const bodySchema = Joi.object({
//       old_password: Joi.string().min(8).max(255).required(),
//       new_password: Joi.string().min(8).max(255).required(),
//       confirm_password: Joi.any()
//         .valid(Joi.ref("new_password"))
//         .required()
//         .messages({
//           "any.only": "Confirm password must match new password.",
//         }),
//     }).unknown(false);

//     const { error: bErr, value: body } = bodySchema.validate(req.body, {
//       abortEarly: true,
//       stripUnknown: true,
//       convert: true,
//     });

//     if (bErr) {
//       return res
//         .status(400)
//         .json({ success: false, msg: bErr.details[0].message });
//     }

//     const { old_password, new_password } = body;

//     const isMatch = await bcrypt.compare(old_password, admin.password);
//     if (!isMatch) {
//       return res
//         .status(400)
//         .json({ success: false, msg: "Old password is incorrect." });
//     }

//     const isSameAsOld = await bcrypt.compare(new_password, admin.password);
//     if (isSameAsOld) {
//       return res.status(400).json({
//         success: false,
//         msg: "New password must be different from the old password.",
//       });
//     }

//     const hashedPassword = await bcrypt.hash(new_password, 10);

//     const updated = await sequelize.transaction(async (t) => {
//       await admin.update({ password: hashedPassword }, { transaction: t });

//       return Admin.findByPk(admin.id, {
//         attributes: { exclude: ["password", "two_fa_secret"] },
//         transaction: t,
//       });
//     });

//     return res.status(200).json({
//       success: true,
//       msg: "Password updated successfully.",
//       data: updated,
//     });
//   } catch (err) {
//     console.error("Error in updatePassword:", err);

//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }
// module.exports = {
//   addAdmin,
//   editAdmin,
//   getAdmins,
//   getAdminById,
//   updateProfile,
//   updatePassword,
// };

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
      two_fa: Joi.number().valid(0, 1).default(0),
      two_fa_method: Joi.when("two_fa", {
        is: 1,
        then: Joi.string().valid("email", "auth_app").default("email"),
        otherwise: Joi.valid(null).default(null),
      }),
      two_fa_secret: Joi.alternatives().conditional("two_fa_method", {
        is: "auth_app",
        then: Joi.string().max(300).required(),
        otherwise: Joi.string().max(300).allow(null, "").default(null),
      }),
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

    value.email = String(value.email).toLowerCase().trim();
    value.username = String(value.username).trim();

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

    value.password = await bcrypt.hash(value.password, 10);

    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }
      value.avatar = await uploadFile(req.file, "upload/admin");
    }

    const created = await sequelize.transaction(async (t) => {
      const row = await Admin.create(value, { transaction: t });
      return Admin.findByPk(row.id, {
        attributes: { exclude: ["password", "two_fa_secret"] },
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
        afterData: afterData,
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

      two_fa: Joi.number().valid(0, 1),
      two_fa_method: Joi.when("two_fa", {
        is: 1,
        then: Joi.string().valid("email", "auth_app").default("email"),
        otherwise: Joi.valid(null).default(null),
      }),
      two_fa_secret: Joi.alternatives().conditional("two_fa_method", {
        is: "auth_app",
        then: Joi.string().max(300).required(),
        otherwise: Joi.string().max(300).allow(null, "").default(null),
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
    const {
      password: _pwBefore,
      two_fa_secret: _secBefore,
      ...beforeAdminData
    } = beforeRaw;
    const oldStatus = beforeAdminData.status;

    // 6) Normalize payload
    const payload = { ...body };
    if (payload.email) payload.email = payload.email.toLowerCase().trim();
    if (payload.username) payload.username = payload.username.trim();

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

    // 9) Avatar upload/profiles//profiles/
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
        attributes: { exclude: ["password", "two_fa_secret"] },
        transaction: t,
      });
    });

    // 11) AFTER snapshot and decide actionType
    let afterData = updated.toJSON();
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
      two_fa: Joi.number().integer().valid(0, 1),
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

    const { page, sortBy, sortDir, username, email, role, status, two_fa } =
      value;

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
    if (typeof two_fa === "number") where.two_fa = two_fa;

    // Pagination + order
    const limit = parseInt(await getOption("admin_per_page", 10), 10) || 10;
    const offset = (page - 1) * limit;
    const order = [[sortBy, sortDir.toUpperCase()]];

    // Query — exclude secrets to be schema-safe
    const { rows, count } = await Admin.findAndCountAll({
      where,
      attributes: { exclude: ["password", "two_fa_secret"] },
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
      attributes: { exclude: ["password", "two_fa_secret"] },
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
        attributes: { exclude: ["password", "two_fa_secret"] },
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
        attributes: { exclude: ["password", "two_fa_secret"] },
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
