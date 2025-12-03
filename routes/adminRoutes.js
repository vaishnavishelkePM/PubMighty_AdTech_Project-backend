const router = require("express").Router();
const authController = require("../controllers/admin/authController");
const inventoryController = require("../controllers/admin/inventoryController");
const utilController = require("../controllers/admin/utilController");
const adminController = require("../controllers/admin/adminController");
const partnerController = require("../controllers/admin/partnerController");
const publisherController = require("../controllers/admin/publisherController");
const noteController = require("../controllers/admin/noteController");
const loggerController = require("../controllers/admin/adminLogController");
const uiController = require("../controllers/admin/uiController");

const { isAdminSessionValid } = require("../utils/helpers/authHelper");
const {
  fileUploader,
  verifyFileType,
  uploadImage,
} = require("../utils/helpers/fileUpload");
const Partner = require("../models/Partners/Partner");
const Publisher = require("../models/Publishers/Publisher");
// auth

router.post("/login", authController.adminLogin);
router.post("/login/verify", authController.verifyAdminLogin);
router.post("/resend-send-otp", authController.sendOTPAgain);
router.post("/forgot-password", authController.forgotAdminPassword);
router.post("/forgot-password/verify", authController.verifyForgotPassword);
router.post("/check-session-valid", authController.checkIsSessionValid);

// inventory
router.get("/inventory", inventoryController.getInventories);
router.get(
  "/inventory/:id",

  inventoryController.getInventoryById
);
router.post(
  "/inventory",
  fileUploader.single("logo"),
  inventoryController.createInventory
);
router.put(
  "/inventory/:id",
  fileUploader.single("logo"),
  inventoryController.updateInventory
);
router.delete("/inventory/:id", inventoryController.deleteInventory);

// settings
router.get("/settings", utilController.getAllOptions);
router.get("/altcha-challenge", utilController.altchaCaptchaChallenge);

// admins
// router.post("/admins/add", adminController.addAdmin);
// router.post("/admins/:id", adminController.editAdmin);
// router.get("/admins", adminController.getAdmins);
// router.get("/admins/:id", adminController.getAdminById);
router.post(
  "/admins/add",
  fileUploader.single("avatar"),
  adminController.addAdmin
);
router.get("/admins", adminController.getAdmins);
router.get("/admins/:id", adminController.getAdminById);
router.post(
  "/admins/:id",
  fileUploader.single("avatar"),
  adminController.editAdmin
);

router.post(
  "/profiles/update",
  fileUploader.single("avatar"),
  adminController.updateProfile
);
router.post("/profile/update-password", adminController.updatePassword);

//partner
router.post("/partners", partnerController.addPartner);
router.get("/partners", partnerController.getPartners);
router.get("/partners/:id", partnerController.getPartnerById);
router.put("/partners/:id", partnerController.editPartner);
router.post("/partners/:id", partnerController.deletePartner);

router.post(
  "/partners/:id/avatar",
  fileUploader.single("avatar"),
  async (req, res) => {
    try {
      // Optional: admin auth
      const session = await isAdminSessionValid(req);
      if (!session || session.success !== true) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized", data: null });
      }

      const partnerId = req.params.id;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
          data: null,
        });
      }

      // Validate MIME by magic bytes
      const result = await verifyFileType(req.file);
      if (!result || !result.ok) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type",
          data: null,
        });
      }

      // Save as WEBP under /public/upload/partner
      const filename = await uploadImage(req.file, "upload/partner");

      // Update DB
      const partner = await Partner.findByPk(partnerId);
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: "Partner not found",
          data: null,
        });
      }

      partner.avatar = filename;
      await partner.save();

      return res.json({
        success: true,
        message: "Avatar updated successfully",
        data: { avatar: filename },
      });
    } catch (err) {
      console.error("Avatar upload error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error while uploading avatar",
        data: null,
      });
    }
  }
);

router.post(
  "/publishers/:id/avatar",
  fileUploader.single("avatar"),
  async (req, res) => {
    try {
      // Optional: admin auth
      const session = await isAdminSessionValid(req);
      if (!session || session.success !== true) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized", data: null });
      }

      const partnerId = req.params.id;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
          data: null,
        });
      }

      // Validate MIME by magic bytes
      const result = await verifyFileType(req.file);
      if (!result || !result.ok) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type",
          data: null,
        });
      }

      // Save as WEBP under /public/upload/partner
      const filename = await uploadImage(req.file, "upload/publisher");

      // Update DB
      const publisher = await Publisher.findByPk(partnerId);
      if (!publisher) {
        return res.status(404).json({
          success: false,
          message: "Publisher not found",
          data: null,
        });
      }

      publisher.avatar = filename;
      await publisher.save();

      return res.json({
        success: true,
        message: "Avatar updated successfully",
        data: { avatar: filename },
      });
    } catch (err) {
      console.error("Avatar upload error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error while uploading avatar",
        data: null,
      });
    }
  }
);

// router.post("/publishers", publisherController.addPublisher);
// router.get("/publishers", publisherController.getPublishers);
// router.get("/publishers/:id", publisherController.getPublisherById);
// router.put("/publishers/:id", publisherController.editPublisher);
// router.post("/publishers/:id", publisherController.deletePublisher);

//publisher
router.post(
  "/publishers/add",
  fileUploader.single("avatar"),
  publisherController.addPublisher
);
router.get("/publishers", publisherController.getPublishers);
router.get("/publishers/:id", publisherController.getPublisherById);
router.post(
  "/publishers/:id",
  fileUploader.single("avatar"),
  publisherController.editPublisher
);
router.delete("/publishers/:id", publisherController.deletePublisher);
//partner notes

router.post("/partners/:partnerId/notes", noteController.addPartnerNote);
router.put("/partners/notes/:noteId", noteController.editPartnerNote);
router.delete("/partners/notes/:noteId", noteController.deletePartnerNote);
router.get("/partners/:partnerId/notes", noteController.getPartnerNotes);

//Publisher notes
router.post("/publishers/:publisherId/notes", noteController.addPublisherNote);
router.put("/publishers/notes/:noteId", noteController.editPublisherNote);
router.delete("/publishers/notes/:noteId", noteController.deletePublisherNote);
router.get("/publishers/:publisherId/notes", noteController.getPublisherNotes);

//Inventory Notes
router.post("/inventory/:inventoryId/notes", noteController.addInventoryNote);
router.put("/inventory/notes/:noteId", noteController.editInventoryNote);
router.delete("/inventory/notes/:noteId", noteController.deleteInventoryNote);
router.get("/inventory/:inventoryId/notes", noteController.getInventoryNotes);

//loggers

router.get("/logs", loggerController.getAdminLogs);

//ui setting
router.get("/ui-setting", uiController.getUiSetting);
router.post("/ui-setting/view-mode", uiController.saveViewMode);

module.exports = router;
