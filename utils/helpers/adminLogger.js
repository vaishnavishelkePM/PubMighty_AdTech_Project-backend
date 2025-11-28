const AdminLog = require("../../models/Admin/AdminLog");

async function logAdminAction({
  adminId,
  actionCategory,
  actionType,
  beforeData = null,
  afterData = null,
}) {
  try {
    if (!adminId || !actionCategory || !actionType) {
      console.warn("logAdminAction missing required fields", {
        adminId,
        actionCategory,
        actionType,
      });
      return;
    }

    await AdminLog.create({
      adminId, // maps to admin_id
      actionCategory, // maps to action_category
      actionType, // maps to action_type
      beforeAction: beforeData || null, // maps to data_log
      afterAction: afterData || null, // maps to data
      date: new Date(), // now
    });
  } catch (err) {
    console.error("Failed to write admin log:", err.message);
  }
}

module.exports = { logAdminAction };
