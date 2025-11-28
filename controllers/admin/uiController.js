const Joi = require("joi");
const Admin = require("../../models/Admin/Admin");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");

// Convert whatever comes from MariaDB into a real object
function normalizeUiSetting(value) {
  if (!value) return {};

  // Already an object → return as is
  if (typeof value === "object") return value;

  // If it's a JSON string → parse it
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (e) {
      return {};
    }
  }

  return {};
}

async function saveViewMode(req, res) {
  try {
    const { error, value } = Joi.object({
      pageKey: Joi.string().trim().min(2).max(100).required(),
      viewMode: Joi.string().valid("list", "table").required(),
    })
      .unknown(false)
      .validate(req.body, { abortEarly: true, stripUnknown: true });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    const { pageKey, viewMode } = value;

    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }

    const adminId = session.data;

    const admin = await Admin.findByPk(adminId);

    if (!admin) {
      return res.status(404).json({ success: false, msg: "Admin not found" });
    }
    let prefs = normalizeUiSetting(admin.ui_setting);

    prefs[pageKey] = viewMode;

    admin.ui_setting = prefs;
    await admin.save();

    return res.status(200).json({
      success: true,
      msg: "View mode updated",
      data: {
        id: admin.id,
        username: admin.username,
        ui_setting: admin.ui_setting,
      },
    });
  } catch (err) {
    console.error("Error in saveMyViewMode:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function getUiSetting(req, res) {
  try {
    const session = await isAdminSessionValid(req, res);
    if (!session?.success || !session?.data) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }

    const adminId = session.data;

    const admin = await Admin.findByPk(adminId, {
      attributes: ["id", "username", "ui_setting"],
    });

    if (!admin) {
      return res.status(404).json({ success: false, msg: "Admin not found" });
    }
    let prefs = normalizeUiSetting(admin.ui_setting);

    return res.status(200).json({
      success: true,
      data: {
        id: admin.id,
        username: admin.username,
        ui_setting: prefs,
      },
    });
  } catch (err) {
    console.error("Error in getUiSetting:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

module.exports = { getUiSetting, saveViewMode };
