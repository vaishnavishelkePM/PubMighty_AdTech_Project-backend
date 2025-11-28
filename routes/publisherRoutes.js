const router = require("express").Router();
const authController = require("../controllers/publisher/authController");
const inventoryController = require("../controllers/publisher/inventoryController")

router.post("/register", authController.registerPublisher);
router.post("/register/verify", authController.verifyRegisterPublisher);

router.post("/login", authController.loginPublisher);
router.post("/login/verify", authController.verifyLoginPublisher);

router.post("/forgot-password", authController.forgotPassword);
router.post("/forgot-password/verify", authController.verifyForgotPassword);


//to handle inventory
router.post("/inventory/create", inventoryController.createMyInventory);
router.get("/inventory", inventoryController.getMyInventories);
router.get("/inventory/:id", inventoryController.getMyInventoryById);
router.put("/inventory/:id", inventoryController.updateMyInventory);
router.delete("/inventory/:id", inventoryController.deleteMyInventory);
module.exports = router;
