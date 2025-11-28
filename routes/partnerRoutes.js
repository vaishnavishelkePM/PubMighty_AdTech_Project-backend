const router = require("express").Router();
const authController = require("../controllers/partner/authController");

router.post("/register", authController.registerPartner);
router.post("/register/verify", authController.verifyRegisterPartner);

router.post("/login", authController.loginPartner);
router.post("/login/verify", authController.verifyLoginPartner);

router.post("/forgot-password", authController.forgotPassword);
router.post("/forgot-password/verify", authController.verifyForgotPassword);

module.exports = router;
