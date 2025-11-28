const Joi = require("joi");
const sequelize = require("../../config/db");
const { Op } = require("sequelize");
const Inventory = require("../../models/Inventory");
const Partner = require("../../models/Partners/Partner");
const PartnerNote = require("../../models/Admin/PartnerNote");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
const PublisherNote = require("../../models/Admin/PublisherNote");
const InventoryNote = require("../../models/Admin/InventoryNote");
const Admin = require("../../models/Admin/Admin");
const Publisher = require("../../models/Publishers/Publisher");

//FOR PARTNER
//add note for partner
async function addPartnerNote(req, res) {
  // 1) Auth check (admin)
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  // 2) Validate input
  const schema = Joi.object({
    partnerId: Joi.number().integer().positive().required(),
    note: Joi.string().trim().min(1).max(5000).required(),
    assignedTo: Joi.number().integer().positive().allow(null).optional(),
  });

  const { error, value } = schema.validate(
    {
      ...req.params,
      ...req.body,
    },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { partnerId, note, assignedTo } = value;
  const t = await sequelize.transaction();

  try {
    const partner = await Partner.findByPk(partnerId, {
      transaction: t,
      attributes: ["id", "username", "status"],
    });

    if (!partner) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Partner not found.",
        data: null,
      });
    }

    // 4) Create note
    const newNote = await PartnerNote.create(
      {
        partnerId,
        note,
        writtenBy: adminId,
        assignedTo: assignedTo || null,
        status: 0, // 0 = open , 1=close
      },
      { transaction: t }
    );

    await t.commit();

    const fullNote = await PartnerNote.findByPk(newNote.id, {
      include: [
        {
          model: Admin,
          as: "writer",
          attributes: ["id", "username", "firstName", "lastName", "email"],
        },
        {
          model: Admin,
          as: "assignee",
          attributes: ["id", "username", "firstName", "lastName", "email"],
        },
      ],
    });
    return res.status(201).json({
      success: true,
      msg: "Note added successfully.",
      data: fullNote,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("addPartnerNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}
//edit note for partner
async function editPartnerNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  // Params + body validation
  const schema = Joi.object({
    noteId: Joi.number().integer().positive().required(),
    note: Joi.string().trim().min(1).max(5000).optional(),
    assignedTo: Joi.number().integer().positive().allow(null).optional(),
    status: Joi.number().integer().valid(0, 1).optional(), // 0=open, 1=closed
  });

  const { error, value } = schema.validate(
    {
      noteId: req.params.noteId,
      ...req.body,
    },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { noteId, note, assignedTo, status } = value;

  const t = await sequelize.transaction();
  try {
    const existing = await PartnerNote.findByPk(noteId, { transaction: t });

    if (!existing) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Note not found.",
        data: null,
      });
    }

    if (existing.writtenBy !== adminId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        msg: "You are not allowed to edit this note.",
        data: null,
      });
    }

    const payload = {};

    if (typeof note !== "undefined") payload.note = note;
    if (typeof assignedTo !== "undefined") payload.assignedTo = assignedTo;
    if (typeof status !== "undefined") payload.status = status;

    if (Object.keys(payload).length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        msg: "Nothing to update.",
        data: null,
      });
    }

    await existing.update(payload, { transaction: t });
    await t.commit();
    const fullNote = await PartnerNote.findByPk(existing.id, {
      include: [
        {
          model: Admin,
          as: "writer",
          attributes: ["id", "username", "firstName", "lastName", "email"],
        },
        {
          model: Admin,
          as: "assignee",
          attributes: ["id", "username", "firstName", "lastName", "email"],
        },
      ],
    });
    return res.json({
      success: true,
      msg: "Note updated successfully.",
      data: fullNote,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("editPartnerNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}
//delete note for partner
async function deletePartnerNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  const schema = Joi.object({
    noteId: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(
    { noteId: req.params.noteId },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { noteId } = value;

  const t = await sequelize.transaction();
  try {
    const existing = await PartnerNote.findByPk(noteId, { transaction: t });

    if (!existing) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Note not found.",
        data: null,
      });
    }

    // Optional: restrict delete to writer only
    if (existing.writtenBy !== adminId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        msg: "You are not allowed to delete this note.",
        data: null,
      });
    }

    await existing.destroy({ transaction: t });
    await t.commit();

    return res.json({
      success: true,
      msg: "Note deleted successfully.",
      data: { id: noteId },
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("deletePartnerNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function getPartnerNotes(req, res) {
  // 1) Auth check (admin)
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }

  // 2) Validate partnerId from params
  const schema = Joi.object({
    partnerId: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(
    { partnerId: req.params.partnerId },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { partnerId } = value;

  try {
    // 3) Optional: ensure partner exists (same style as addPartnerNote)
    const partner = await Partner.findByPk(partnerId, {
      attributes: ["id", "username", "status"],
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        msg: "Partner not found.",
        data: null,
      });
    }

    // 4) Fetch notes for this partner
    const notes = await PartnerNote.findAll({
      where: { partnerId },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Admin,
          as: "writer",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "email",
            "avatar",
          ],
        },
        {
          model: Admin,
          as: "assignee",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "email",
            "avatar",
          ],
        },
      ],
    });

    return res.json({
      success: true,
      msg: "Notes fetched successfully.",
      data: notes,
    });
  } catch (err) {
    console.error("getPartnerNotes failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

//FOR PUBLISHER
async function addPublisherNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  const schema = Joi.object({
    publisherId: Joi.number().integer().positive().required(),
    note: Joi.string().trim().min(1).max(5000).required(),
    assignedTo: Joi.number().integer().positive().allow(null).optional(),
  });

  const { error, value } = schema.validate(
    {
      publisherId: req.params.publisherId,
      ...req.body,
    },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { publisherId, note, assignedTo } = value;
  const t = await sequelize.transaction();

  try {
    const publisher = await Publisher.findByPk(publisherId, {
      transaction: t,
      attributes: ["id", "username", "status"],
    });

    if (!publisher) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Publisher not found.",
        data: null,
      });
    }

    const newNote = await PublisherNote.create(
      {
        publisherId,
        note,
        writtenBy: adminId,
        assignedTo: assignedTo || null,
        status: 0, // 0=open, 1=closed
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      success: true,
      msg: "Note added successfully.",
      data: newNote,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("addPublisherNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function editPublisherNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  const schema = Joi.object({
    noteId: Joi.number().integer().positive().required(),
    note: Joi.string().trim().min(1).max(5000).optional(),
    assignedTo: Joi.number().integer().positive().allow(null).optional(),
    status: Joi.number().integer().valid(0, 1).optional(), // 0=open, 1=closed
  });

  const { error, value } = schema.validate(
    {
      noteId: req.params.noteId,
      ...req.body,
    },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { noteId, note, assignedTo, status } = value;

  const t = await sequelize.transaction();
  try {
    const existing = await PublisherNote.findByPk(noteId, { transaction: t });

    if (!existing) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Note not found.",
        data: null,
      });
    }

    // Optional restriction: only author can edit
    // if (existing.writtenBy !== adminId) {
    //   await t.rollback();
    //   return res.status(403).json({
    //     success: false,
    //     msg: "You are not allowed to edit this note.",
    //     data: null,
    //   });
    // }

    const payload = {};
    if (typeof note !== "undefined") payload.note = note;
    if (typeof assignedTo !== "undefined") payload.assignedTo = assignedTo;
    if (typeof status !== "undefined") payload.status = status;

    if (Object.keys(payload).length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        msg: "Nothing to update.",
        data: null,
      });
    }

    await existing.update(payload, { transaction: t });
    await t.commit();

    return res.json({
      success: true,
      msg: "Note updated successfully.",
      data: existing,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("editPublisherNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function deletePublisherNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  const schema = Joi.object({
    noteId: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(
    { noteId: req.params.noteId },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { noteId } = value;

  const t = await sequelize.transaction();
  try {
    const existing = await PublisherNote.findByPk(noteId, { transaction: t });

    if (!existing) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Note not found.",
        data: null,
      });
    }

    // Optional: only author can delete
    if (existing.writtenBy !== adminId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        msg: "You are not allowed to delete this note.",
        data: null,
      });
    }

    await existing.destroy({ transaction: t });
    await t.commit();

    return res.json({
      success: true,
      msg: "Note deleted successfully.",
      data: { id: noteId },
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("deletePublisherNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function getPublisherNotes(req, res) {
  // 1) Auth check (admin)
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }

  // 2) Validate publisherId from params
  const schema = Joi.object({
    publisherId: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(
    { publisherId: req.params.publisherId },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { publisherId } = value;

  try {
    // 3) Optional: ensure partner exists (same style as addPartnerNote)
    const publisher = await Publisher.findByPk(publisherId, {
      attributes: ["id", "username", "status"],
    });

    if (!publisher) {
      return res.status(404).json({
        success: false,
        msg: "Partner not found.",
        data: null,
      });
    }

    // 4) Fetch notes for this partner
    const notes = await PublisherNote.findAll({
      where: { publisherId },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Admin,
          as: "writer",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "email",
            "avatar",
          ],
        },
        {
          model: Admin,
          as: "assignee",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "email",
            "avatar",
          ],
        },
      ],
    });

    return res.json({
      success: true,
      msg: "Notes fetched successfully.",
      data: notes,
    });
  } catch (err) {
    console.error("getPartnerNotes failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

//Inve+ntory
async function addInventoryNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  const schema = Joi.object({
    inventoryId: Joi.number().integer().positive().required(),
    note: Joi.string().trim().min(1).max(5000).required(),
    assignedTo: Joi.number().integer().positive().allow(null),
  });

  const { error, value } = schema.validate(
    {
      inventoryId: req.params.inventoryId,
      ...req.body,
    },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { inventoryId, note, assignedTo } = value;
  const t = await sequelize.transaction();

  try {
    const inventory = await Inventory.findByPk(inventoryId, {
      transaction: t,
      attributes: ["id", "name", "status"], // adapt attributes
    });

    if (!inventory) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Inventory item not found.",
        data: null,
      });
    }

    const newNote = await InventoryNote.create(
      {
        inventoryId,
        note,
        writtenBy: adminId,
        assignedTo: assignedTo || null,
        status: 0, // 0=open, 1=closed
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      success: true,
      msg: "Note added successfully.",
      data: newNote,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("addInventoryNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function editInventoryNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  const schema = Joi.object({
    noteId: Joi.number().integer().positive().required(),
    note: Joi.string().trim().min(1).max(5000).optional(),
    assignedTo: Joi.number().integer().positive().allow(null).optional(),
    status: Joi.number().integer().valid(0, 1).optional(),
  });

  const { error, value } = schema.validate(
    {
      noteId: req.params.noteId,
      ...req.body,
    },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { noteId, note, assignedTo, status } = value;

  const t = await sequelize.transaction();
  try {
    const existing = await InventoryNote.findByPk(noteId, { transaction: t });

    if (!existing) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Note not found.",
        data: null,
      });
    }

    // Optional: only author can edit
    // if (existing.writtenBy !== adminId) {
    //   await t.rollback();
    //   return res.status(403).json({
    //     success: false,
    //     msg: "You are not allowed to edit this note.",
    //     data: null,
    //   });
    // }

    const payload = {};
    if (typeof note !== "undefined") payload.note = note;
    if (typeof assignedTo !== "undefined") payload.assignedTo = assignedTo;
    if (typeof status !== "undefined") payload.status = status;

    if (Object.keys(payload).length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        msg: "Nothing to update.",
        data: null,
      });
    }

    await existing.update(payload, { transaction: t });
    await t.commit();

    return res.json({
      success: true,
      msg: "Note updated successfully.",
      data: existing,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("editInventoryNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function deleteInventoryNote(req, res) {
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }
  const adminId = session.data;

  const schema = Joi.object({
    noteId: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(
    { noteId: req.params.noteId },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { noteId } = value;

  const t = await sequelize.transaction();
  try {
    const existing = await InventoryNote.findByPk(noteId, { transaction: t });

    if (!existing) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        msg: "Note not found.",
        data: null,
      });
    }

    // Optional: only author can delete
    if (existing.writtenBy !== adminId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        msg: "You are not allowed to delete this note.",
        data: null,
      });
    }

    await existing.destroy({ transaction: t });
    await t.commit();

    return res.json({
      success: true,
      msg: "Note deleted successfully.",
      data: { id: noteId },
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {}

    console.error("deleteInventoryNote failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

async function getInventoryNotes(req, res) {
  // 1) Auth check (admin)
  const session = await isAdminSessionValid(req);
  if (!session || session.success !== true) {
    return res
      .status(401)
      .json({ success: false, msg: "Unauthorized", data: null });
  }

  // 2) Validate partnerId from params
  const schema = Joi.object({
    inventoryId: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(
    { inventoryId: req.params.inventoryId },
    { abortEarly: true, stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  const { inventoryId } = value;

  try {
    // 3) Optional: ensure partner exists (same style as addPartnerNote)
    const inventory = await Inventory.findByPk(inventoryId, {
      attributes: ["id", "name", "status"],
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        msg: "Inventory not found.",
        data: null,
      });
    }

    // 4) Fetch notes for this partner
    const notes = await InventoryNote.findAll({
      where: { inventoryId },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Admin,
          as: "writer",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "email",
            "avatar",
          ],
        },
        {
          model: Admin,
          as: "assignee",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "email",
            "avatar",
          ],
        },
      ],
    });

    return res.json({
      success: true,
      msg: "Notes fetched successfully.",
      data: notes,
    });
  } catch (err) {
    console.error("getInventoryNotes failed:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      data: null,
    });
  }
}

module.exports = {
  addPartnerNote,
  editPartnerNote,
  deletePartnerNote,
  getPartnerNotes,
  addPublisherNote,
  editPublisherNote,
  deletePublisherNote,
  getPublisherNotes,
  addInventoryNote,
  editInventoryNote,
  deleteInventoryNote,
  getInventoryNotes,
};
