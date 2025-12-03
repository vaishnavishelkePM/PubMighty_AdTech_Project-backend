// const Joi = require("joi");
// const { Op } = require("sequelize");
// const crypto = require("node:crypto");
// const bcrypt = require("bcryptjs");
// const Partner = require("../../models/Partners/Partner");
// const {
//   verifyFileType,
//   uploadFile,
//   deleteFile,
// } = require("../../utils/helpers/fileUpload");
// const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
// const PartnerPublisher = require("../../models/PartnerPublisher");
// const Publisher = require("../../models/Publishers/Publisher");

// async function addPartner(req, res) {
//   try {
//     // 1) admin must be logged in
//     const session = await isAdminSessionValid(req);
//     // if your helper returns { success: true, data: adminId }
//     if (!session || session.success !== true) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }
//     const adminId = session.data; // if you need it later

//     // 2) validate body
//     const schema = Joi.object({
//       username: Joi.string().max(50).required(),
//       firstName: Joi.string().max(100).optional(),
//       lastName: Joi.string().max(100).optional(),
//       email: Joi.string().email().max(300).allow(null, "").optional(),
//       password: Joi.string().min(8).max(255).required(),
//       phoneNo: Joi.string().max(100).allow(null, "").optional(),
//       gender: Joi.string().max(10).allow(null, "").optional(),
//       country: Joi.string().max(3).allow(null, "").optional(),
//       language: Joi.string().max(3).default("en"),
//       status: Joi.number().integer().valid(1, 2, 3).default(1),
//       twoFactorEnabled: Joi.number().integer().valid(0, 1, 2).default(0),
//     });

//     const { error, value } = schema.validate(req.body, {
//       abortEarly: true,
//       stripUnknown: true,
//     });

//     if (error) {
//       return res
//         .status(400)
//         .json({ success: false, msg: error.details[0].message });
//     }

//     // 3) check username/email uniqueness
//     const whereOr = [{ username: value.username }];
//     if (value.email && value.email !== "") {
//       whereOr.push({ email: value.email });
//     }

//     const existing = await Partner.findOne({
//       where: {
//         [Op.or]: whereOr,
//       },
//     });

//     if (existing) {
//       const clash = existing.username === value.username ? "username" : "email";
//       return res.status(409).json({
//         success: false,
//         msg: `A partner with this ${clash} already exists.`,
//       });
//     }

//     // 4) hash password
//     const hashed = await bcrypt.hash(value.password, 10);
//     value.password = hashed;

//     // 5) optional avatar upload
//     if (req.file) {
//       const ok = await verifyFileType(req.file);
//       if (!ok) {
//         return res
//           .status(400)
//           .json({ success: false, msg: "Invalid file type" });
//       }
//       const storedName = await uploadFile(req.file, "upload/partners");
//       value.avatar = storedName;
//     }

//     // 6) generate publicId
//     const raw = `partner-${value.username}-${Date.now()}`;
//     const publicId = crypto.createHash("sha256").update(raw).digest("hex");
//     value.publicId = publicId;

//     // 7) set registeredIp
//     const ip =
//       req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
//     value.registeredIp = ip;

//     // 8) create partner
//     const partner = await Partner.create(value);

//     return res.status(201).json({
//       success: true,
//       msg: "Partner created successfully.",
//       data: {
//         id: partner.id,
//         firstName: partner.firstName,
//         lastName: partner.lastName,
//         publicId: partner.publicId,
//         username: partner.username,
//         email: partner.email,
//         phoneNo: partner.phoneNo,
//         country: partner.country,
//         language: partner.language,
//         status: partner.status,
//         twoFactorEnabled: partner.twoFactorEnabled,
//         avatar: partner.avatar,
//         createdAt: partner.createdAt,
//       },
//     });
//   } catch (err) {
//     console.error("Error in addPartner:", err);

//     if (err?.name === "SequelizeUniqueConstraintError") {
//       return res
//         .status(409)
//         .json({ success: false, msg: "Username or email already exists." });
//     }

//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// async function getPartners(req, res) {
//   try {
//     const schema = Joi.object({
//       page: Joi.number().integer().min(1).default(1),
//       limit: Joi.number().integer().min(1).max(100).default(10),

//       username: Joi.string().allow("", null),
//       email: Joi.string().allow("", null),
//       status: Joi.number().integer().valid(1, 2, 3),
//       partnerId: Joi.number().integer().positive().optional(),
//       // 🔥 filter by publisher (id or username)
//       publisherSearch: Joi.string().allow("", null),
//     });

//     const { error, value } = schema.validate(req.query, {
//       abortEarly: true,
//       stripUnknown: true,
//     });
//     if (error) {
//       return res
//         .status(400)
//         .json({ success: false, msg: error.details[0].message });
//     }

//     const session = await isAdminSessionValid(req);
//     if (!session || session.success !== true) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const { page, limit, username, email, status, publisherSearch, partnerId } =
//       value;

//     const where = {};
//     if (username && username.trim() !== "") {
//       where.username = { [Op.like]: `${username}%` };
//     }
//     if (email && email.trim() !== "") {
//       where.email = { [Op.like]: `${email}%` };
//     }
//     if (typeof status === "number") {
//       where.status = status;
//     }
//     if (partnerId) {
//       where.id = partnerId;
//     }

//     let effectivePublisherId = null;

//     if (publisherSearch && publisherSearch.trim()) {
//       const term = publisherSearch.trim();
//       const isNumeric = /^[0-9]+$/.test(term);

//       if (isNumeric) {
//         // user typed publisher ID
//         effectivePublisherId = Number(term);
//       } else {
//         // user typed publisher USERNAME
//         const pub = await Publisher.findOne({
//           where: { username: term },
//           attributes: ["id"],
//         });
//         if (pub) {
//           effectivePublisherId = pub.id;
//         } else {
//           // no such publisher → return empty
//           return res.status(200).json({
//             success: true,
//             data: {
//               rows: [],
//               pagination: {
//                 page,
//                 limit,
//                 total: 0,
//                 totalPages: 1,
//               },
//             },
//           });
//         }
//       }
//     }

//     const offset = (page - 1) * limit;

//     const include = [];

//     const partnerLinksInclude = {
//       model: PartnerPublisher,
//       as: "partnerLinks",
//       attributes: ["publisherId"],
//       include: [
//         {
//           model: Publisher,
//           as: "publisher",
//           attributes: ["id", "username", "email", "avatar"],
//         },
//       ],
//     };

//     if (effectivePublisherId) {
//       // filter by specific publisher
//       partnerLinksInclude.required = true;
//       partnerLinksInclude.where = { publisherId: effectivePublisherId };
//     } else {
//       // when no search, we don't force mapping
//       partnerLinksInclude.required = false;
//     }

//     include.push(partnerLinksInclude);

//     const { rows, count } = await Partner.findAndCountAll({
//       where,
//       include,
//       limit,
//       offset,
//       order: [["id", "DESC"]],
//       attributes: { exclude: ["password"] },
//     });

//     return res.status(200).json({
//       success: true,
//       data: {
//         rows,
//         pagination: {
//           page,
//           limit,
//           total: count,
//           totalPages: Math.max(1, Math.ceil(count / limit)),
//         },
//       },
//     });
//   } catch (err) {
//     console.error("Error in getPartners:", err);
//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// async function getPartnerById(req, res) {
//   try {
//     const schema = Joi.object({
//       id: Joi.number().integer().positive().required(),
//     });

//     const { error, value } = schema.validate(req.params, {
//       abortEarly: true,
//       stripUnknown: true,
//     });

//     if (error) {
//       return res
//         .status(400)
//         .json({ success: false, msg: error.details[0].message });
//     }

//     const session = await isAdminSessionValid(req, res);
//     if (!session?.success) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const partner = await Partner.findByPk(value.id);
//     if (!partner) {
//       return res.status(404).json({ success: false, msg: "Partner not found" });
//     }

//     return res.status(200).json({ success: true, data: partner });
//   } catch (err) {
//     console.error("Error in getPartnerById:", err);
//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// async function editPartner(req, res) {
//   try {
//     const paramSchema = Joi.object({
//       id: Joi.number().integer().positive().required(),
//     });
//     const { error: paramErr, value: params } = paramSchema.validate(req.params);
//     if (paramErr) {
//       return res
//         .status(400)
//         .json({ success: false, msg: paramErr.details[0].message });
//     }

//     const bodySchema = Joi.object({
//       username: Joi.string().max(50),
//       firstName: Joi.string().max(100),
//       lastName: Joi.string().max(100),
//       email: Joi.string().email().max(300).allow(null, ""),
//       password: Joi.string().min(8).max(255).allow(null, ""),
//       phoneNo: Joi.string().max(100).allow(null, ""),
//       gender: Joi.string().max(10).allow(null, ""),
//       country: Joi.string().max(3).allow(null, ""),
//       language: Joi.string().max(3),
//       status: Joi.number().integer().valid(1, 2, 3),
//       twoFactorEnabled: Joi.number().integer().valid(0, 1, 2),
//     });

//     const { error: bodyErr, value: body } = bodySchema.validate(req.body, {
//       abortEarly: true,
//       stripUnknown: true,
//     });
//     if (bodyErr) {
//       return res
//         .status(400)
//         .json({ success: false, msg: bodyErr.details[0].message });
//     }

//     const session = await isAdminSessionValid(req, res);
//     if (!session?.success) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const partner = await Partner.findByPk(params.id);
//     if (!partner) {
//       return res.status(404).json({ success: false, msg: "Partner not found" });
//     }

//     // check unique username/email if changed
//     if (body.username || body.email) {
//       const exists = await Partner.findOne({
//         where: {
//           [Op.and]: [
//             { id: { [Op.ne]: partner.id } },
//             {
//               [Op.or]: [
//                 body.username ? { username: body.username } : null,
//                 body.email ? { email: body.email } : null,
//               ].filter(Boolean),
//             },
//           ],
//         },
//       });
//       if (exists) {
//         return res.status(409).json({
//           success: false,
//           msg: "Another partner with this username/email already exists.",
//         });
//       }
//     }

//     const payload = { ...body };

//     // if password provided -> hash
//     if (payload.password && payload.password.trim() !== "") {
//       payload.password = await bcrypt.hash(payload.password, 10);
//     } else {
//       delete payload.password;
//     }

//     // file upload (avatar)
//     if (req.file) {
//       const ok = await verifyFileType(req.file);
//       if (!ok) {
//         return res
//           .status(400)
//           .json({ success: false, msg: "Invalid file type" });
//       }
//       const storedName = await uploadFile(req.file, "upload/partners");
//       payload.avatar = storedName;

//       if (partner.avatar) {
//         await deleteFile(partner.avatar, "upload/partners");
//       }
//     }

//     await partner.update(payload);
//     await partner.reload();

//     return res.status(200).json({
//       success: true,
//       msg: "Partner updated successfully.",
//       data: partner,
//     });
//   } catch (err) {
//     console.error("Error in editPartner:", err);
//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// async function deletePartner(req, res) {
//   try {
//     const schema = Joi.object({
//       id: Joi.number().integer().positive().required(),
//     });
//     const { error, value } = schema.validate(req.params, {
//       abortEarly: true,
//       stripUnknown: true,
//     });
//     if (error)
//       return res
//         .status(400)
//         .json({ success: false, msg: error.details[0].message });

//     const session = await isAdminSessionValid(req, res);
//     // unify on isValid OR success — choose one that your helper actually returns
//     if (!session || (session.success !== true && session.success !== true)) {
//       return res.status(401).json({ success: false, msg: "Unauthorized" });
//     }

//     const partner = await Partner.findByPk(value.id);
//     if (!partner)
//       return res.status(404).json({ success: false, msg: "Partner not found" });

//     if (Number(partner.status) === 0) {
//       return res
//         .status(400)
//         .json({ success: false, msg: "Partner already deleted." });
//     }

//     await partner.update({ status: 0 });

//     if (partner.avatar) {
//       try {
//         await deleteFile(partner.avatar, "upload/partners");
//       } catch (_) {}
//     }

//     return res.status(200).json({
//       success: true,
//       msg: "Partner soft-deleted successfully.",
//       data: {
//         id: partner.id,
//         username: partner.username,
//         email: partner.email,
//         newStatus: 0,
//       },
//     });
//   } catch (err) {
//     console.error("Error in deletePartner:", err);
//     return res
//       .status(500)
//       .json({ success: false, msg: "Internal server error" });
//   }
// }

// module.exports = {
//   addPartner,
//   getPartners,
//   getPartnerById,
//   editPartner,
//   deletePartner,
// };

const Joi = require("joi");
const { Op } = require("sequelize");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const Partner = require("../../models/Partners/Partner");
const {
  verifyFileType,
  uploadFile,
  deleteFile,
} = require("../../utils/helpers/fileUpload");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
const PartnerPublisher = require("../../models/PartnerPublisher");
const Publisher = require("../../models/Publishers/Publisher");

// ---------------------------------------------------------
// ADD PARTNER (same idea, supports status 0–3)
// ---------------------------------------------------------
async function addPartner(req, res) {
  try {
    const session = await isAdminSessionValid(req);
    if (!session || session.success !== true) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const schema = Joi.object({
      username: Joi.string().max(50).required(),
      firstName: Joi.string().max(100).optional(),
      lastName: Joi.string().max(100).optional(),
      email: Joi.string().email().max(300).allow(null, "").optional(),
      password: Joi.string().min(8).max(255).required(),
      phoneNo: Joi.string().max(100).allow(null, "").optional(),
      gender: Joi.string().max(10).allow(null, "").optional(),
      country: Joi.string().max(3).allow(null, "").optional(),
      language: Joi.string().max(3).default("en"),
      // 0 = Pending, 1 = Active, 2 = Suspended, 3 = Disabled
      status: Joi.number().integer().valid(0, 1, 2, 3).default(1),
      // 0 = off, 1 = app, 2 = email
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

    // username / email uniqueness
    const whereOr = [{ username: value.username }];
    if (value.email && value.email !== "") {
      whereOr.push({ email: value.email });
    }

    const existing = await Partner.findOne({
      where: { [Op.or]: whereOr },
    });

    if (existing) {
      const clash = existing.username === value.username ? "username" : "email";
      return res.status(409).json({
        success: false,
        msg: `A partner with this ${clash} already exists.`,
      });
    }

    // hash password
    value.password = await bcrypt.hash(value.password, 10);

    // optional avatar
    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }
      const storedName = await uploadFile(req.file, "upload/partners");
      value.avatar = storedName;
    }

    // publicId
    const raw = `partner-${value.username}-${Date.now()}`;
    value.publicId = crypto.createHash("sha256").update(raw).digest("hex");

    // registered IP
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    value.registeredIp = ip;

    // make sure new partner is not deleted
    value.is_deleted = 0;

    const partner = await Partner.create(value);

    return res.status(201).json({
      success: true,
      msg: "Partner created successfully.",
      data: {
        id: partner.id,
        firstName: partner.firstName,
        lastName: partner.lastName,
        publicId: partner.publicId,
        username: partner.username,
        email: partner.email,
        phoneNo: partner.phoneNo,
        country: partner.country,
        language: partner.language,
        status: partner.status,
        twoFactorEnabled: partner.twoFactorEnabled,
        avatar: partner.avatar,
        createdAt: partner.createdAt,
      },
    });
  } catch (err) {
    console.error("Error in addPartner:", err);

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

// ---------------------------------------------------------
// GET PARTNERS  (aligned with your PartnersView filters)
// ---------------------------------------------------------
async function getPartners(req, res) {
  try {
    const session = await isAdminSessionValid(req);
    if (!session || session.success !== true) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),

      partnerId: Joi.number().integer().positive().allow("", null),
      username: Joi.string().allow("", null),
      email: Joi.string().allow("", null),
      country: Joi.string().max(3).allow("", null),

      status: Joi.number().integer().valid(0, 1, 2, 3).allow("", null),
      twoFactorEnabled: Joi.number().integer().valid(0, 1, 2).allow("", null),

      sortBy: Joi.string()
        .valid("id", "username", "email", "status", "lastActiveAt", "createdAt")
        .default("createdAt"),
      sortDir: Joi.string().valid("asc", "desc").default("desc"),

      // 0 = active list, 1 = deleted list (same pattern as inventory)
      is_deleted: Joi.number().integer().valid(0, 1).default(0),

      // (optional) remain compatible with old code if you use it somewhere
      publisherSearch: Joi.string().allow("", null),
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
      limit,
      partnerId,
      username,
      email,
      country,
      status,
      twoFactorEnabled,
      sortBy,
      sortDir,
      is_deleted,
      publisherSearch,
    } = value;

    const where = {};

    if (partnerId) {
      where.id = partnerId;
    }
    if (username && username.trim() !== "") {
      where.username = { [Op.like]: `${username.trim()}%` };
    }
    if (email && email.trim() !== "") {
      where.email = { [Op.like]: `${email.trim()}%` };
    }
    if (country && country.trim() !== "") {
      where.country = country.trim();
    }
    if (typeof status === "number") {
      where.status = status;
    }
    if (typeof twoFactorEnabled === "number") {
      where.twoFactorEnabled = twoFactorEnabled;
    }

    // default: show not deleted
    if (typeof is_deleted === "number") {
      where.is_deleted = is_deleted;
    }

    const offset = (page - 1) * limit;

    // optional publisher filter (if you still use it somewhere)
    let effectivePublisherId = null;
    if (publisherSearch && publisherSearch.trim()) {
      const term = publisherSearch.trim();
      const isNumeric = /^[0-9]+$/.test(term);

      if (isNumeric) {
        effectivePublisherId = Number(term);
      } else {
        const pub = await Publisher.findOne({
          where: { username: term },
          attributes: ["id"],
        });
        if (pub) {
          effectivePublisherId = pub.id;
        } else {
          return res.status(200).json({
            success: true,
            data: {
              rows: [],
              pagination: {
                page,
                limit,
                total: 0,
                totalPages: 1,
              },
            },
          });
        }
      }
    }

    const include = [];
    const partnerLinksInclude = {
      model: PartnerPublisher,
      as: "partnerLinks",
      attributes: ["publisherId"],
      include: [
        {
          model: Publisher,
          as: "publisher",
          attributes: ["id", "username", "email", "avatar"],
        },
      ],
    };

    if (effectivePublisherId) {
      partnerLinksInclude.required = true;
      partnerLinksInclude.where = { publisherId: effectivePublisherId };
    } else {
      partnerLinksInclude.required = false;
    }

    include.push(partnerLinksInclude);

    const { rows, count } = await Partner.findAndCountAll({
      where,
      include,
      limit,
      offset,
      order: [[sortBy, sortDir.toUpperCase()]],
      attributes: { exclude: ["password"] },
    });

    return res.status(200).json({
      success: true,
      data: {
        rows,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.max(1, Math.ceil(count / limit)),
        },
      },
    });
  } catch (err) {
    console.error("Error in getPartners:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

// GET PARTNER BY ID

async function getPartnerById(req, res) {
  try {
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

    const session = await isAdminSessionValid(req, res);
    if (!session?.success) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const partner = await Partner.findByPk(value.id, {
      attributes: { exclude: ["password"] },
    });
    if (!partner) {
      return res.status(404).json({ success: false, msg: "Partner not found" });
    }

    return res.status(200).json({ success: true, data: partner });
  } catch (err) {
    console.error("Error in getPartnerById:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

// EDIT PARTNER

async function editPartner(req, res) {
  try {
    const paramSchema = Joi.object({
      id: Joi.number().integer().positive().required(),
    });
    const { error: paramErr, value: params } = paramSchema.validate(req.params);
    if (paramErr) {
      return res
        .status(400)
        .json({ success: false, msg: paramErr.details[0].message });
    }

    const bodySchema = Joi.object({
      username: Joi.string().max(50),
      firstName: Joi.string().max(100),
      lastName: Joi.string().max(100),
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

    const session = await isAdminSessionValid(req, res);
    if (!session?.success) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const partner = await Partner.findByPk(params.id);
    if (!partner) {
      return res.status(404).json({ success: false, msg: "Partner not found" });
    }

    // unique username/email if changed
    if (body.username || body.email) {
      const exists = await Partner.findOne({
        where: {
          [Op.and]: [
            { id: { [Op.ne]: partner.id } },
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
          msg: "Another partner with this username/email already exists.",
        });
      }
    }

    const payload = { ...body };

    // password
    if (payload.password && payload.password.trim() !== "") {
      payload.password = await bcrypt.hash(payload.password, 10);
    } else {
      delete payload.password;
    }

    // avatar upload
    if (req.file) {
      const ok = await verifyFileType(req.file);
      if (!ok) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid file type" });
      }
      const storedName = await uploadFile(req.file, "upload/partners");
      payload.avatar = storedName;

      if (partner.avatar) {
        try {
          await deleteFile(partner.avatar, "upload/partners");
        } catch (_) {
          // ignore delete errors
        }
      }
    }

    await partner.update(payload);
    await partner.reload();

    return res.status(200).json({
      success: true,
      msg:
        typeof payload.is_deleted === "number"
          ? payload.is_deleted === 1
            ? "Partner moved to deleted."
            : "Partner restored successfully."
          : "Partner updated successfully.",
      data: partner,
    });
  } catch (err) {
    console.error("Error in editPartner:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

// ---------------------------------------------------------
// SOFT DELETE PARTNER (same idea as inventory delete)
// ---------------------------------------------------------
async function deletePartner(req, res) {
  try {
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

    const session = await isAdminSessionValid(req, res);
    if (!session || session.success !== true) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const partner = await Partner.findByPk(value.id);
    if (!partner) {
      return res.status(404).json({ success: false, msg: "Partner not found" });
    }

    if (Number(partner.is_deleted) === 1) {
      return res.status(200).json({
        success: true,
        msg: "Partner already deleted.",
        data: { id: partner.id },
      });
    }

    await partner.update({ is_deleted: 1 });

    return res.status(200).json({
      success: true,
      msg: "Partner moved to deleted list.",
      data: {
        id: partner.id,
        username: partner.username,
        email: partner.email,
        is_deleted: 1,
      },
    });
  } catch (err) {
    console.error("Error in deletePartner:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

module.exports = {
  addPartner,
  getPartners,
  getPartnerById,
  editPartner,
  deletePartner,
};
