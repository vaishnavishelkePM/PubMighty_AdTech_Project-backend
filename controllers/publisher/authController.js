const bcrypt = require("bcrypt");
const Joi = require("joi");
const sequelize = require("../../config/db");
const Publisher = require("../../models/Publishers/Publisher");
const crypto = require("crypto");
const { Op } = require("sequelize");
const PublisherTemp = require("../../models/Publishers/PublisherTemp");

const PublisherOTP = require("../../models/Publishers/PublisherOTP");
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
const {
  handlePublisherSessionCreate,
} = require("../../utils/helpers/authHelper.js");
require("dotenv").config();

async function registerPublisher(req, res) {
  const registerPublisherSchema = Joi.object({
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

  const { error, value } = registerPublisherSchema.validate(req.body, {
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

  const isCaptchaOk = await captchaVerification(req, "publisher_register");
  if (!isCaptchaOk) {
    return res.status(400).json({
      success: false,
      message: "Captcha verification failed",
      data: null,
    });
  }

  const t = await sequelize.transaction();
  try {
    // check username
    const isusernameAvailable = await Publisher.findOne({
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

    // check email
    const isEmailAvailable = await Publisher.findOne({
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

    // hash password
    const password = await bcrypt.hash(value.password, BCRYPT_ROUNDS);
    const requestIp = getRealIp(req);

    const register_two_fa_enable = await getOption(
      "publisher_register_two_fa_enable",
      "true"
    );

    if (register_two_fa_enable === "true") {
      // temp publisher
      const temp = await PublisherTemp.create(
        {
          username: value.username.toLowerCase(),
          email: value.email,
          password,
        },
        { transaction: t }
      );

      // otp
      const otp = generateOtp();

      const otpMinutesRaw = await getOption("otp_expires_register_minutes", 5);
      const otp_expires_register_minutes = Number(otpMinutesRaw) || 5;

      const otpExpiresAt = new Date(
        Date.now() + otp_expires_register_minutes * 60 * 1000
      );

      const myOtp = await PublisherOTP.create(
        {
          publisherId: temp.id,
          otp,
          expiry: otpExpiresAt,
          action: "register",
          status: 0,
        },
        { transaction: t }
      );

      await t.commit();

      try {
        await sendOtpMail(temp, myOtp, "Mail for register", "register");
      } catch (mailErr) {
        console.error("sendOtpMail failed (register):", mailErr);
        // we don't fail the API, OTP is in DB
      }

      return res.status(201).json({
        success: true,
        requires2FA: true,
        message: "register OTP sent to email. Verify to complete register.",
        data: temp.id,
      });
    }

    // direct register (no 2FA)
    const publisher = await Publisher.create(
      {
        username: value.username,
        email: value.email,
        password,
        registeredIp: requestIp,
      },
      { transaction: t }
    );

    const id = String(publisher.id);
    const secretKey = process.env.PUBLIC_UID_SECRET;

    const publicId = crypto
      .createHmac("sha256", secretKey)
      .update(id)
      .digest("hex");

    await publisher.update({ publicId }, { transaction: t });

    // create session
    const { token, expiresAt } = await handlePublisherSessionCreate(
      req,
      publisher.id
    );

    await t.commit();

    await publisher.reload({
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
      message: "Publisher created successfully",
      data: {
        publisher,
        token,
        tokenExpiresAt: expiresAt,
      },
    });
  } catch (err) {
    // if commit already happened, this will throw, but in normal case it's fine
    await t.rollback();
    console.error("error during [registerPublisher] :", err);
    return res.status(500).json({
      success: false,
      message: "Somthing Went wrong. Try again later.",
      data: null,
    });
  }
}


async function verifyRegisterPublisher(req, res) {
  const verifyRegistrationSchema = Joi.object({
    tempId: Joi.alternatives()
      .try(Joi.number().integer(), Joi.string())
      .required(),
    otp: Joi.string().length(6).trim().required(),
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
    "publisher_register_two_fa_enable",
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
    const temp = await PublisherTemp.findOne({
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

    const now = new Date();
    const otpRow = await PublisherOTP.findOne({
      where: {
        publisherId: temp.id,
        action: "register",
        status: 0,
        expiry: { [Op.gt]: now },
      },
      order: [["expiry", "DESC"]],
      transaction: t,
    });

    if (!otpRow || Number(value.otp) !== Number(otpRow.otp)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
        data: null,
      });
    }

    const publisher = await Publisher.create(
      {
        username: temp.username,
        email: temp.email,
        password: temp.password,
        registeredIp: getRealIp(req),
      },
      { transaction: t }
    );

    const id = String(publisher.id);
    const secretKey = process.env.PUBLIC_UID_SECRET;
    const publicId = crypto
      .createHmac("sha256", secretKey)
      .update(id)
      .digest("hex");

    await publisher.update({ publicId }, { transaction: t });

    await otpRow.update({ status: 1 }, { transaction: t });

    // ✅ DB part done
    await t.commit();

    // try to create session, but don't break if session model has userId mismatch
    let token = null;
    let expiresAt = null;
    try {
      const sessionData = await handlePublisherSessionCreate(req, publisher.id);
      token = sessionData.token;
      expiresAt = sessionData.expiresAt;
    } catch (e) {
      console.error("publisher session create failed:", e.message);
    }

    await publisher.reload({
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

    return res.status(200).json({
      success: true,
      message: "Email verified. Account created.",
      data: {
        publisher,
        token,
        expiresAt,
      },
    });
  } catch (err) {
    if (!t.finished || t.finished !== "commit") {
      await t.rollback();
    }
    console.error("[verifyRegistration] error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Internal Server having Error",
      data: null,
    });
  }
}

// function to handle login the Publisher
async function loginPublisher(req, res) {
  const loginPublisherSchema = Joi.object({
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

  const { error, value } = loginPublisherSchema.validate(req.body, {
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

  const isCaptchaOk = await captchaVerification(req, "publisher_login");
  if (!isCaptchaOk) {
    return res.status(400).json({
      success: false,
      message: "Captcha verification failed",
      data: null,
    });
  }

  try {
    const isEmail = isValidEmail(value.login);
    let publisher = null;

    if (isEmail) {
      publisher = await Publisher.findOne({
        where: { email: value.login },
      });
    } else {
      publisher = await Publisher.findOne({
        where: { username: value.login },
      });
    }

    if (!publisher) {
      return res.status(404).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    const isCorrectPass = await bcrypt.compare(
      value.password,
      publisher.password
    );
    if (!isCorrectPass) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials", data: null });
    }

    // 2FA check
    const login_two_fa_enable = await getOption(
      "publisher_login_two_fa_enable",
      "true"
    );

    if (login_two_fa_enable === "true") {
      // authenticator app
      if (
        publisher.twoFactorEnabled === 1 &&
        publisher.twoFactorSecretkey !== null
      ) {
        return res.status(200).json({
          success: true,
          requires2FA: true,
          message:
            " use Otp with your authenticator app to enable two-factor authentication.",
        });
      }
      // email OTP
      else if (publisher.twoFactorEnabled === 2) {
        const otp = generateOtp();

        const otp_expires_login_minutes = parseInt(
          await getOption("otp_expires_login_minutes", 5)
        );
        const otpExpiresAt = new Date(
          Date.now() + otp_expires_login_minutes * 60 * 1000
        );

        const createdOtp = await PublisherOTP.create({
          publisherId: publisher.id,
          otp,
          expiry: otpExpiresAt,
          action: "login",
          status: 0,
        });

        await sendOtpMail(publisher, createdOtp, "Your login OTP", "login");

        return res.status(200).json({
          success: true,
          requires2FA: true,
          message: "Login OTP sent to email. Verify to finish login.",
          data: publisher.email,
        });
      }
    }

    // no 2FA → create session
    const { token, expiresAt } = await handlePublisherSessionCreate(
      req,
      publisher.id
    );

    await publisher.reload({
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

    return res.status(200).json({
      success: true,
      requires2FA: false,
      message: "Login successful",
      data: {
        publisher,
        token,
        tokenExpiresAt: expiresAt,
      },
    });
  } catch (err) {
    console.error("Error during [loginPublisher]:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      data: null,
    });
  }
}

// function to handle otp verifcation for loginPublisher
async function verifyLoginPublisher(req, res) {
  try {
    // Accept login or email
    const verifyLoginOtpSchema = Joi.object({
      login: Joi.string().email().messages({
        "string.email": "Please enter a valid email address.",
        "string.empty": "Email cannot be empty.",
      }),
      email: Joi.string().email(),
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
      .xor("login", "email")
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

    const twoFAEnabled = await getOption(
      "publisher_login_two_fa_enable",
      "true"
    );
    if (twoFAEnabled === "false") {
      return res.status(400).json({
        success: false,
        message: "2FA disabled.",
        data: null,
      });
    }

    const loginValue = value.login || value.email;
    const isEmail = isValidEmail(loginValue);
    let publisher = null;
    // Find the Publisher by email or username
    if (isEmail) {
      publisher = await Publisher.findOne({
        where: {
          email: loginValue,
        },
      });
    } else {
      publisher = await Publisher.findOne({
        where: {
          username: loginValue,
        },
      });
    }

    if (!publisher) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid credentials", data: null });
    }

    // 4) Verify password
    const passwordHash = publisher.password;
    const isPassCorrect = await bcrypt.compare(value.password, passwordHash);
    if (!isPassCorrect) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials", data: null });
    }

    if (
      publisher.twoFactorEnabled === 1 &&
      publisher.twoFactorSecretkey !== null
    ) {
      const verified = speakeasy.totp.verify({
        secret: publisher.twoFactorSecretkey,
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
    } else if (publisher.twoFactorEnabled === 2) {
      // 5) Verify OTP (login action; not register). Ensure not expired.
      const now = new Date();
      const row = await PublisherOTP.findOne({
        where: {
          publisherId: publisher.id,
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
      await row.update({ status: true });
    }

    const { token, expiresAt } = await handlePublisherSessionCreate(
      req,
      publisher.id
    );

    await publisher.reload({
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

    return res.status(200).json({
      success: true,
      message: "Login verified..",
      data: {
        publisher,
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
  const isCaptchaOk = await captchaVerification(
    req,
    "publisher_forgot_password_captcha_enabled"
  );
  if (!isCaptchaOk) {
    return res.status(400).json({
      success: false,
      message: "Captcha verification failed",
      data: null,
    });
  }

  try {
    const publisher = await Publisher.findOne({
      where: { email: value.email },
    });
    if (!publisher) {
      return res.status(200).json({
        success: true,
        message: "OTP has been sent.if email is exist ",
        data: value.email,
      });
    }

    const otp = generateOtp(); // keep leading zeros

    const otp_expires_forgot_password_minutes = parseInt(
      await getOption("otp_expires_forgot_password_minutes", 5)
    );
    const otpExpiresAt = new Date(
      Date.now() + otp_expires_forgot_password_minutes * 60 * 1000
    ); // n minutes expiry

    const newOtp = await PublisherOTP.create({
      publisherId: publisher.id,
      otp,
      expiry: otpExpiresAt,
      action: "forgot_password",
      status: 0,
    });

    await sendOtpMail(
      publisher,
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
    email: Joi.string().email().required().messages({
      "string.email": "Please enter a valid email address.",
      "any.required": "Email is required to reset your password.",
      "string.empty": "Email cannot be empty.",
    }),

    otp: Joi.string().length(6).trim().required().messages({
      "string.length": "OTP must be exactly 6 digits.",
      "any.required": "OTP is required to reset your password.",
      "string.empty": "OTP cannot be empty.",
    }),

    newPassword: Joi.string().min(8).max(72).required().messages({
      "string.min": "New password must be at least 8 characters long.",
      "string.max": "New password cannot exceed 72 characters.",
      "any.required": "New password is required.",
      "string.empty": "New password cannot be empty.",
    }),
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
    const publisher = await Publisher.findOne({
      where: { email: value.email },
    });
    if (!publisher) {
      return res.status(200).json({
        success: true,
        message: "Invalid OTP.",
        data: value.email,
      });
    }

    const now = new Date();
    const otpRow = await PublisherOTP.findOne({
      where: {
        publisherId: publisher.id,
        action: "forgot_password",
        status: 0,
        expiry: { [Op.gt]: now },
      },
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

    // update password
    const password = await bcrypt.hash(value.newPassword, BCRYPT_ROUNDS);
    await publisher.update({ password });

    //  mark OTP as used with number 1, not true
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
  registerPublisher,
  verifyRegisterPublisher,
  loginPublisher,
  verifyLoginPublisher,
  forgotPassword,
  verifyForgotPassword,
};
