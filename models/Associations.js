const Inventory = require("./Inventory");
const Publisher = require("./Publishers/Publisher");
const Admin = require("./Admin/Admin");
const PartnerNote = require("./Admin/PartnerNote");
const PublisherNote = require("./Admin/PublisherNote");
const Partner = require("./Partners/Partner");
const PartnerPublisher = require("../models/PartnerPublisher");
const InventoryNote = require("./Admin/InventoryNote");

function initAssociations() {
  // ---------------------------------------------------------------------------
  // Publisher ↔ Inventory
  // ---------------------------------------------------------------------------
  Publisher.hasMany(Inventory, {
    foreignKey: "publisherId",
    as: "inventories",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  Inventory.belongsTo(Publisher, {
    foreignKey: "publisherId",
    as: "publisher",
  });

  // ---------------------------------------------------------------------------
  // Partner ↔ Inventory
  // ---------------------------------------------------------------------------
  Partner.hasMany(Inventory, {
    foreignKey: "partnerId",
    as: "inventories",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
  });

  Inventory.belongsTo(Partner, {
    foreignKey: "partnerId",
    as: "partner",
  });

  // ---------------------------------------------------------------------------
  // PartnerNote ↔ Admin
  // ---------------------------------------------------------------------------
  PartnerNote.belongsTo(Admin, {
    as: "writer",
    foreignKey: "writtenBy",
    targetKey: "id",
  });

  PartnerNote.belongsTo(Admin, {
    as: "assignee",
    foreignKey: "assignedTo",
    targetKey: "id",
  });

  Admin.hasMany(PartnerNote, {
    as: "writtenNotes",
    foreignKey: "writtenBy",
  });

  Admin.hasMany(PartnerNote, {
    as: "assignedNotes",
    foreignKey: "assignedTo",
  });

  // ---------------------------------------------------------------------------
  // PublisherNote ↔ Admin
  // ---------------------------------------------------------------------------
  PublisherNote.belongsTo(Admin, {
    as: "writer",
    foreignKey: "writtenBy",
    targetKey: "id",
  });

  PublisherNote.belongsTo(Admin, {
    as: "assignee",
    foreignKey: "assignedTo",
    targetKey: "id",
  });

  Admin.hasMany(PublisherNote, {
    as: "pubwrittenNotes",
    foreignKey: "writtenBy",
  });

  Admin.hasMany(PublisherNote, {
    as: "pubassignedNotes",
    foreignKey: "assignedTo",
  });

  // ---------------------------------------------------------------------------
  // InventoryNote ↔ Admin
  // ---------------------------------------------------------------------------
  InventoryNote.belongsTo(Admin, {
    as: "writer", // must match include: { as: 'writer' }
    foreignKey: "writtenBy",
    targetKey: "id",
  });

  InventoryNote.belongsTo(Admin, {
    as: "assignee", // must match include: { as: 'assignee' }
    foreignKey: "assignedTo",
    targetKey: "id",
  });

  Admin.hasMany(InventoryNote, {
    as: "inventoryWrittenNotes",
    foreignKey: "writtenBy",
  });

  Admin.hasMany(InventoryNote, {
    as: "inventoryAssignedNotes",
    foreignKey: "assignedTo",
  });

  // ---------------------------------------------------------------------------
  // InventoryNote ↔ Inventory
  // ---------------------------------------------------------------------------
  Inventory.hasMany(InventoryNote, {
    foreignKey: "inventoryId",
    as: "notes",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  InventoryNote.belongsTo(Inventory, {
    foreignKey: "inventoryId",
    as: "inventory",
  });

  // ---------------------------------------------------------------------------
  // PartnerPublisher (linking table)
  // ---------------------------------------------------------------------------
  Partner.hasMany(PartnerPublisher, {
    foreignKey: "partnerId",
    as: "partnerLinks",
  });

  Publisher.hasMany(PartnerPublisher, {
    foreignKey: "publisherId",
    as: "publisherLinks",
  });

  PartnerPublisher.belongsTo(Partner, {
    foreignKey: "partnerId",
    as: "partner",
  });

  PartnerPublisher.belongsTo(Publisher, {
    foreignKey: "publisherId",
    as: "publisher",
  });
}

module.exports = {
  initAssociations,
};
