const Partner = require("../../models/Partners/Partner");
const PartnerOTP = require("../../models/Partners/PartnerOTP");
const PartnerTemp = require("../../models/Partners/PartnerTemp");
const bcrypt = require("bcrypt");
const Joi = require("joi");
const sequelize = require("../../config/db");
const crypto = require("crypto");
const { Op } = require("sequelize");
const speakeasy = require("speakeasy");
const { OAuth2Client } = require("google-auth-library");
const { captchaVerification } = require("../../utils/helpers/captchaHelper");
const {
  sendOtpMail,
  BCRYPT_ROUNDS,
  getRealIp,
  generateOtp,
  isValidEmail,
  getOption,
} = require("../../utils/helper");
const PartnerSession = require("../../models/Partners/PartnerSession");
const {
  handlePartnerSessionCreate,
} = require("../../utils/helpers/authHelper");
require("dotenv").config();

async function registerPartner(req, res) {
  const registerPartnerSchema = Joi.object({
    username: Joi.string()
      .pattern(/^[A-Za-z0-9_.]+$/)
      .min(3)
      .max(30)
      .required()
      .messages({
        "string.pattern.base":
          "username can only contain letters, numbers, underscores, and dots.",
        "string.min": "username must be at least 3 characters long.",
        "string.max": "username cannot exceed 30 characters.",
        "any.required": "username is required.",
      }),

    email: Joi.string().email().required().messages({
      "string.email": "Please enter a valid email address.",
      "any.required": "Email is required.",
    }),

    password: Joi.string().min(8).max(24).required().messages({
      "string.min": "Password must be at least 8 characters long.",
      "string.max": "Password cannot exceed 24 characters.",
      "any.required": "Password is required.",
    }),

    captchaToken: Joi.string().optional().messages({
      "string.base": "Invalid captcha verification.",
    }),
  });

  const { error, value } = registerPartnerSchema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
  });

  if (error) {
    console.log("Validation Errors:");
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      data: null,
    });
  }

  // Captcha verification
  const isCaptchaOk = await captchaVerification(req, "partner_register");
  if (!isCaptchaOk) {
    return res.status(400).json({
      success: false,
      message: "Captcha verification failed",
      data: null,
    });
  }

  const t = await sequelize.transaction();
  try {
    // Check if the username already exists
    const isusernameAvailable = await Partner.findOne({
      where: { username: value.username },
      transaction: t,
    });
    if (isusernameAvailable) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: "username already taken",
        data: null,
      });
    }

    // Check if the email already exists in the main Partner table
    const isEmailAvailable = await Partner.findOne({
      where: { email: value.email },
      transaction: t,
    });
    if (isEmailAvailable) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: "Email already registered",
        data: null,
      });
    }

    // Hash the password
    const password = await bcrypt.hash(value.password, BCRYPT_ROUNDS);
    const requestIp = getRealIp(req);

    const register_two_fa_enable = await getOption(
      "partner_register_two_fa_enable",
      "true"
    );

    if (register_two_fa_enable === "true") {
      // Create TempPartner

      const temp = await PartnerTemp.create(
        {
          username: value.username.toLowerCase(),
          email: value.email,
          password,
        },
        { transaction: t }
      );

      // Create OTP linked to TempPartner
      const otp = generateOtp();

      const otp_expires_register_minutes = parseInt(
        await getOption("partner_otp_expires_register_minutes", 5)
      );

      const otpExpiresAt = new Date(
        Date.now() + otp_expires_register_minutes * 60 * 1000
      ); // n minutes expiry

      const myOtp = await PartnerOTP.create(
        {
          partnerId: temp.id,
          otp,
          expiry: otpExpiresAt,
          action: "register",
        },
        { transaction: t }
      );

      await sendOtpMail(temp, myOtp, "Mail for register", "register");

      await t.commit();
      return res.status(201).json({
        success: true,
        requires2FA: true,
        message: "register OTP sent to email. Verify to complete register.",
        data: temp.id,
      });
    }

    // Create the Partner directly if 2FA is not enabled
    const partner = await Partner.create(
      {
        username: value.username,
        email: value.email,
        password,
        registeredIp: requestIp,
      },
      { transaction: t }
    );

    const id = String(partner.id);
    const secretKey = process.env.PUBLIC_UID_SECRET;

    const publicId = crypto
      .createHmac("sha256", secretKey)
      .update(id)
      .digest("hex");
    await Partner.update({ publicId: publicId }, { transaction: t });

    // if eveything is good retun session
    const { token, expiresAt } = await handlePartnerSessionCreate(
      req,
      partner.id
    );
    await t.commit();
    await partner.reload({
      attributes: [
        "publicId",
        "username",
        "firstName",
        "lastName",
        "email",
        "avatar",
        "country",
        "phoneNo",
        "gender",
        "language",
        "twoFactorEnabled",
      ],
    });
    return res.status(201).json({
      success: true,
      requires2FA: false,
      message: "Partner created successfully",
      data: {
        partner,
        token,
        tokenExpiresAt: expiresAt,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("error during [registerPartner] :", err);
    return res.status(500).json({
      success: false,
      message: "Somthing Went wrong. Try again later.",
      data: null,
    });
  }
}

// function to handle otp verifcation for registration
async function verifyRegisterPartner(req, res) {
  const verifyRegistrationSchema = Joi.object({
    tempId: Joi.alternatives()
      .try(Joi.number().integer(), Joi.string())
      .required()
      .messages({
        "any.required": "Temporary ID (tempId) is required.",
        "alternatives.match": "Temporary ID must be a valid number or string.",
        "number.base": "Temporary ID must be a number.",
        "string.base": "Temporary ID must be a string.",
      }),

    otp: Joi.string().length(6).trim().required().messages({
      "string.length": "OTP must be exactly 6 digits.",
      "any.required": "OTP is required.",
      "string.empty": "OTP cannot be empty.",
    }),
  });
  const { error, value } = verifyRegistrationSchema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      message:
        error?.details?.[0]?.message || error.message || "Validation error",
      data: null,
    });
  }

  const isTwoFAEnableOnRegister = await getOption(
    "partner_register_two_fa_enable",
    "true"
  );
  if (isTwoFAEnableOnRegister !== "true") {
    return res.status(400).json({
      success: false,
      message: "2FA disabled.",
      data: null,
    });
  }
  const t = await sequelize.transaction();
  const tempId = Number(value.tempId);

  try {
    // 1) load temp Partner
    const temp = await PartnerTemp.findOne({
      where: { id: tempId },
      transaction: t,
    });
    if (!temp) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "something went wrong",
        data: null,
      });
    }

    // 2) load latest, non-expired OTP
    const now = new Date();
    const otpRow = await PartnerOTP.findOne({
      where: {
        partnerId: temp.id,
        action: "register",
        status: 0,
        expiry: { [Op.gt]: now },
      },
      order: [["expiry", "DESC"]],
      transaction: t,
    });

    // 3) hard guard: OTP must exist and match
    if (!otpRow) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
        data: null,
      });
    }

    if (Number(value.otp) !== Number(otpRow.otp)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
        data: null,
      });
    }

    // 4) create final Partner (temp.password is already hashed)
    const partner = await Partner.create(
      {
        username: temp.username,
        email: temp.email,
        password: temp.password,
        registeredIp: getRealIp(req),
      },
      { transaction: t }
    );

    // 5) generate publicUid
    const id = String(partner.id);
    const secretKey = process.env.PUBLIC_UID_SECRET;
    const publicId = crypto
      .createHmac("sha256", secretKey)
      .update(id)
      .digest("hex");

    await partner.update({ publicId: publicId }, { transaction: t });

    const { token, expiresAt } = await handlePartnerSessionCreate(
      req,
      partner.id
    );
    await t.commit();
    await partner.reload({
      attributes: [
        "publicId",
        "username",
        "email",
        "avatar",
        "country",
        "phoneNo",
        "gender",
        "language",
        "twoFactorEnabled",
      ],
    });
    await otpRow.update({ status: 1 });
    return res.status(200).json({
      success: true,
      message: "Email verified. Account created.",
      data: {
        partner,
        token,
        expiresAt,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("[verifyRegistration] error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Internal Server having Error",
      data: null,
    });
  }
}

// function to handle login the Partner
async function loginPartner(req, res) {
  const loginPartnerSchema = Joi.object({
    login: Joi.alternatives()
      .try(
        Joi.string().email().messages({
          "string.email": "Please enter a valid email address.",
        }),
        Joi.string()
          .pattern(/^[a-z0-9_.]+$/)
          .min(3)
          .max(30)
          .messages({
            "string.pattern.base":
              "username can only contain lowercase letters, numbers, underscores, and dots.",
            "string.min": "username must be at least 3 characters long.",
            "string.max": "username cannot exceed 30 characters.",
          })
      )
      .required()
      .messages({
        "any.required": "Email or username is required.",
        "alternatives.match":
          "Please enter a valid email or username to log in.",
      }),

    password: Joi.string().required().messages({
      "any.required": "Password is required.",
      "string.empty": "Password cannot be empty.",
    }),

    captchaToken: Joi.string().optional().messages({
      "string.base": "Invalid captcha verification.",
    }),
  });
  const { error, value } = loginPartnerSchema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      data: null,
    });
  }

  // Captcha verification
  const isCaptchaOk = await captchaVerification(req, "partner_login");
  if (!isCaptchaOk) {
    return res.status(400).json({
      success: false,
      message: "Captcha verification failed",
      data: null,
    });
  }

  try {
    const isEmail = isValidEmail(value.login);
    let partner = null;
    // Find the Partner by email or username
    if (isEmail) {
      partner = await Partner.findOne({
        where: {
          email: value.login,
        },
      });
    } else {
      partner = await Partner.findOne({
        where: {
          username: value.login,
        },
      });
    }

    // If Partner not found
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    // Check if password is correct
    const isCorrectPass = await bcrypt.compare(
      value.password,
      partner.password
    );
    if (!isCorrectPass) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials", data: null });
    }

    // Check if 2FA is enabled
    const login_two_fa_enable = await getOption(
      "partner_login_two_fa_enable",
      "true"
    );

    if (login_two_fa_enable === "true") {
      if (
        partner.twoFactorEnabled === 1 &&
        partner.twoFactorSecretkey !== null
      ) {
        return res.status(200).json({
          success: true,
          requires2FA: true,
          message:
            " use Otp with your authenticator app to enable two-factor authentication.",
        });
      } else if (partner.twoFactorEnabled === 2) {
        //via email
        const otp = generateOtp();

        const otp_expires_login_minutes = parseInt(
          await getOption("partner_otp_expires_login_minutes", 5)
        );
        const otpExpiresAt = new Date(
          Date.now() + otp_expires_login_minutes * 60 * 1000
        ); // n minutes expiry

        // Create OTP in the database
        const createdOtp = await PartnerOTP.create({
          partnerId: partner.id,
          otp,
          expiry: otpExpiresAt,
          action: "login",
        });

        // Ensure OTP is successfully created
        if (!createdOtp) {
          return res.status(500).json({
            success: false,
            message: "Someting went wrong!!!",
            data: null,
          });
        }

        // Send OTP email with OTP and expiry
        await sendOtpMail(partner, createdOtp, "Your login OTP", "login");

        return res.status(200).json({
          success: true,
          requires2FA: true,
          message: "Login OTP sent to email. Verify to finish login.",
          data: partner.email,
        });
      }
    }

    // If 2FA is disabled, directly create a session
    const { token, expiresAt } = await handlePartnerSessionCreate(
      req,
      partner.id
    );

    await partner.reload({
      attributes: [
        "publicId",
        "username",
        "email",
        "avatar",
        "country",
        "phoneNo",
        "gender",
        "language",
        "twoFactorEnabled",
      ],
    });
    return res.status(200).json({
      success: true,
      requires2FA: false,
      message: "Login successful",
      data: {
        partner,
        token,
        tokenExpiresAt: expiresAt,
      },
    });
  } catch (err) {
    console.error("Error during [loginPartner]:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      data: null,
    });
  }
}

// function to handle otp verifcation for loginPartner
async function verifyLoginPartner(req, res) {
  try {
    // 2) Validate input: accept either "login" or "email"
    const verifyLoginOtpSchema = Joi.object({
      login: Joi.string().email().messages({
        "string.email": "Please enter a valid email address.",
        "string.empty": "Email cannot be empty.",
      }),

      otp: Joi.string().length(6).trim().required().messages({
        "string.length": "OTP must be exactly 6 digits.",
        "any.required": "OTP is required.",
        "string.empty": "OTP cannot be empty.",
      }),

      password: Joi.string().required().messages({
        "any.required": "Password is required.",
        "string.empty": "Password cannot be empty.",
      }),
    })
      .xor("login", "email") // Enforce: either "login" or "email", but not both
      .messages({
        "object.missing": "You must provide either email or login to verify.",
        "object.xor": "Please provide either email or login, not both.",
      });

    const { error, value } = verifyLoginOtpSchema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });
    if (error) {
      return res
        .status(400)
        .json({ success: false, errors: error.details[0].message });
    }

    const twoFAEnabled = await getOption("partner_login_two_fa_enable", "true");
    if (twoFAEnabled === "false") {
      return res.status(400).json({
        success: false,
        message: "2FA disabled.",
        data: null,
      });
    }

    const isEmail = isValidEmail(value.login);
    let partner = null;
    // Find the Partner by email or username
    if (isEmail) {
      partner = await Partner.findOne({
        where: {
          email: value.login,
        },
      });
    } else {
      partner = await Partner.findOne({
        where: {
          username: value.login,
        },
      });
    }

    if (!Partner) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid credentials", data: null });
    }

    // 4) Verify password (adjust field names as per your model)
    const passwordHash = partner.password; // pick your actual hash field
    const isPassCorrect = await bcrypt.compare(value.password, passwordHash);
    if (!isPassCorrect) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials", data: null });
    }

    if (partner.twoFactorEnabled === 1 && partner.twoFactorSecretkey !== null) {
      const verified = speakeasy.totp.verify({
        secret: partner.twoFactorSecretkey,
        encoding: "base32",
        token: value.otp,
      });

      if (!verified) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
          data: null,
        });
      }
    } else if (partner.twoFactorEnabled === 2) {
      // 5) Verify OTP (login action; not register). Ensure not expired.
      const now = new Date();
      const row = await PartnerOTP.findOne({
        where: {
          partnerId: partner.id,
          action: "login",
          status: 0,
          expiry: { [Op.gt]: now },
        },
        order: [["expiry", "DESC"]],
      });
      if (!row) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
          data: null,
        });
      }

      if (String(value.otp) !== String(row.otp)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid OTP", data: null });
      }

      // OTP one-time use
      await row.update({ status: 1 });
    }

    const { token, expiresAt } = await handlePartnerSessionCreate(
      req,
      partner.id
    );

    await partner.reload({
      attributes: [
        "publicId",
        "username",
        "email",
        "avatar",
        "country",
        "phoneNo",
        "gender",
        "language",
        "twoFactorEnabled",
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Login verified..",
      data: {
        partner,
        token,
        expiresAt,
      },
    });
  } catch (err) {
    console.error("error during [verifyLoginOtp] :", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error", data: null });
  }
}

// function to handle forgot password
async function forgotPassword(req, res) {
  const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required().messages({
      "any.required": "Email is required to reset your password.",
      "string.empty": "Email cannot be empty.",
    }),

    captchaToken: Joi.string().optional().messages({
      "string.base": "Invalid captcha verification.",
    }),
  });

  const { error, value } = forgotPasswordSchema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      data: null,
    });
  }

  // Captcha verification
  const isCaptchaOk = await captchaVerification(req, "partner_forgot_password");
  if (!isCaptchaOk) {
    return res.status(400).json({
      success: false,
      message: "Captcha verification failed",
      data: null,
    });
  }

  try {
    const partner = await Partner.findOne({ where: { email: value.email } });
    if (!Partner) {
      return res.status(200).json({
        success: true,
        message: "OTP has been sent.if email is exist ",
        data: value.email,
      });
    }

    const otp = generateOtp(); // keep leading zeros

    const otp_expires_forgot_password_minutes = parseInt(
      await getOption("partner_otp_expires_forgot_password_minutes", 5)
    );
    const otpExpiresAt = new Date(
      Date.now() + otp_expires_forgot_password_minutes * 60 * 1000
    ); // n minutes expiry

    const newOtp = await PartnerOTP.create({
      partnerId: partner.id,
      otp,
      expiry: otpExpiresAt,
      action: "forgot_password",
    });

    await sendOtpMail(
      partner,
      newOtp,
      "Your password reset OTP",
      "forgot_password"
    );

    return res.status(200).json({
      success: true,
      message: "OTP has been sent.if email is valid",
      data: value.email,
    });
  } catch (err) {
    console.error("error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong", data: null });
  }
}

// function to handle otp verifcation for forgot password
async function verifyForgotPassword(req, res) {
  const resetPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(6).trim().required(),
    newPassword: Joi.string().min(8).max(72).required(),
  });

  const { error, value } = resetPasswordSchema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      data: null,
    });
  }

  try {
    const partner = await Partner.findOne({ where: { email: value.email } });
    if (!partner) {
      return res.status(200).json({
        success: true,
        message: "Invalid OTP.",
        data: value.email,
      });
    }

    // 2) find valid OTP
    const now = new Date();
    const otpRow = await PartnerOTP.findOne({
      where: {
        partnerId: partner.id,
        action: "forgot_password",
        status: 0,
        expiry: { [Op.gt]: now },
      },
      order: [["createdAt", "DESC"]],
    });

    if (!otpRow) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP or expired.",
        data: null,
      });
    }

    if (String(value.otp) !== String(otpRow.otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP or expired",
        data: null,
      });
    }

    const password = await bcrypt.hash(value.newPassword, BCRYPT_ROUNDS);
    await Partner.update(
      { password },
      {
        where: { id: partner.id },
      }
    );

    await otpRow.update({ status: 1 });

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully.",
    });
  } catch (err) {
    console.error("error during [resetPasswordWithOtp] :", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}



module.exports = {
  verifyForgotPassword,
  forgotPassword,
  verifyLoginPartner,
  loginPartner,
  registerPartner,
  verifyRegisterPartner,
};
