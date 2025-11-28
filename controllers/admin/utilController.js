const { createChallenge } = require("altcha-lib");
const Option = require("../../models/Option");
const { Op } = require("sequelize");
const { getOption } = require("../../utils/helper");

async function getAllOptions(req, res) {
  try {
    const ids = [
      1, 2, 5, 8, 10, 13, 18, 23, 24, 32, 33, 42, 43, 44, 45, 46, 47, 48, 49, 53, 55, 57
    ];

    const rows = await Option.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ["id", "name", "value"],
    });

    const config = {};

    for (const row of rows) {
      config[row.name] = row.value;
    }

    return res.json({
      success: true,
      message: "Setting fetched successfully",
      data: config,
    });
  } catch (err) {
    console.log("error");
    return err;
  }
}

async function altchaCaptchaChallenge(req, res) {
  try {
    const hmacKey = await getOption("altcha_captcha_key");
    const numChallenge = parseInt(
      await getOption("altcha_captcha_challenge_number", 1000000)
    , 10);
    // Create a new challenge and send it to the client:
    const challenge = await createChallenge({
      hmacKey,
      maxNumber: numChallenge, // the maximum random number
    });
    res.json(challenge);
  } catch (error) {
    console.error("Error during altchaCaptchaChallenge:", error);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

module.exports = { getAllOptions, altchaCaptchaChallenge };
