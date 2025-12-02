const bcrypt = require("bcryptjs");
const Joi = require("joi");
const { captchaVerification } = require("../../utils/helpers/captchaHelper");
const {
  isValidEmail,
  detectSuspiciousAdminLogin,
  getOption,
  sendAdmin2FAOtp,
  verifyTwoFAToken,
  generateOtp,
  generateOtpExpiration,
  getLocation,
  getRealIp,
  noReplyMail,
  isOtpValid, //
  // getOptionsByIds,
} = require("../../utils/helper");
const {
  // isAdminSessionValid,
  handleAdminSessionCreate,
  isAdminSessionValid,
} = require("../../utils/helpers/authHelper");
const Admin = require("../../models/Admin/Admin");
const sequelize = require("../../config/db");
const AdminSession = require("../../models/Admin/AdminSession");
const AdminOTP = require("../../models/Admin/AdminOTP");
const { Op } = require("sequelize");
const {
  suspiciousUserMail,
  loginMail,
  forgotPasswordMail, //
} = require("../../utils/helpers/mailUIHelper");

const { transporter } = require("../../config/mail");

async function adminLogin(req, res) {
  // 1) validate
  const adminLoginSchema = Joi.object({
    login: Joi.alternatives()
      .try(
        Joi.string().email().messages({
          "string.email": "Please enter a valid email address.",
        }),
        Joi.string().min(3).max(50).messages({
          "string.min": "Username must be at least 3 characters long.",
          "string.max": "Username cannot exceed 50 characters.",
        })
      )
      .required()
      .messages({
        "any.required": "Email or username is required.",
        "alternatives.match": "Please enter a valid email or username.",
      }),
    password: Joi.string().min(8).required().messages({
      "any.required": "Password is required.",
      "string.min": "Password must be at least 8 characters long.",
    }),
    captchaToken: Joi.string().optional(),
  });

  const { error, value } = adminLoginSchema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      msg: error.details[0].message,
      data: null,
    });
  }

  // 2) captcha
  const isCaptchaOk = await captchaVerification(req, "admin_login");
  if (!isCaptchaOk) {
    return res.status(400).json({
      success: false,
      msg: "Invaild Captcha",
      data: null,
    });
  }

  try {
    const isEmail = isValidEmail(value.login);
    let admin;

    // 3) find admin
    if (isEmail) {
      admin = await Admin.findOne({ where: { email: value.login } });
    } else {
      admin = await Admin.findOne({ where: { username: value.login } });
    }

    if (!admin) {
      return res.status(404).json({
        success: false,
        msg: "Invalid credentials",
        data: null,
      });
    }

    // 4) password check
    const okPass = await bcrypt.compare(value.password, admin.password);
    if (!okPass) {
      return res.status(401).json({
        success: false,
        msg: "Invalid credentials",
        data: null,
      });
    }

    // 5) status check
    if (admin.status !== 1) {
      return res.status(403).json({
        success: false,
        msg: `This account is ${admin.status === 2 ? "suspended" : "disabled"}`,
        data: null,
      });
    }

    // ---------- NEW: derive 2FA type from twoFactorEnabled or legacy columns ----------
    // twoFactorEnabled: 0 = off, 1 = app, 2 = email
    const twoFAType = (() => {
      if (typeof admin.twoFactorEnabled === "number") {
        if (admin.twoFactorEnabled === 1) return "app";
        if (admin.twoFactorEnabled === 2) return "email";
        return "off";
      }

      // legacy fallback (two_fa + two_fa_method)
      if (admin.two_fa === 1) {
        if (admin.two_fa_method === "auth_app") return "app";
        if (admin.two_fa_method === "email") return "email";
      }
      return "off";
    })();
    // -----------------------------------------------------------------------

    // 6) global 2FA toggle for admin login
    const adminLogin2FA = await getOption("admin_login_two_fa_enable", "true"); // your options store "true"/"false"

    if (adminLogin2FA === "true" && twoFAType !== "off") {
      // case A: authenticator app
      if (twoFAType === "app" && admin.two_fa_secret) {
        return res.status(200).json({
          success: true,
          requires2FA: true,
          msg: "Use your authenticator app to complete login.",
          data: null,
        });
      }

      // case B: email-based 2FA (twoFactorEnabled = 2, or legacy email mode)
      if (twoFAType === "email") {
        const otp = generateOtp();

        const otpExpiresMinutes = parseInt(
          await getOption("admin_otp_expires_login_minutes", 5),
          10
        );

        const otpExpiresAt = new Date(
          Date.now() + otpExpiresMinutes * 60 * 1000
        );

        // save OTP to admin OTP table
        const createdOtp = await AdminOTP.create({
          adminId: admin.id,
          otp,
          expiry: otpExpiresAt,
          action: "login",
        });

        if (!createdOtp) {
          return res.status(500).json({
            success: false,
            msg: "Could not create OTP. Try again.",
            data: null,
          });
        }

        // send OTP email
        await transporter.sendMail({
          from: noReplyMail,
          to: admin.email,
          subject: "Your admin login OTP",
          html: loginMail(otp, admin),
        });

        return res.status(200).json({
          success: true,
          requires2FA: true,
          msg: "Login OTP sent to email. Verify to finish login.",
          data: { email: admin.email },
        });
      }
    }

    // 7) no 2FA needed → create session
    const { token, expiresAt } = await handleAdminSessionCreate(admin, req);

    // optionally reload
    await admin.reload({
      attributes: [
        "id",
        "email",
        "username",
        "firstName",
        "lastName",
        "two_fa",
        "two_fa_method",
        "two_fa_secret",
      ],
    });

    return res.status(200).json({
      success: true,
      requires2FA: false,
      msg: "Login successful",
      data: {
        admin,
        token,
        expiresAt,
      },
    });
  } catch (err) {
    console.error("Error during [adminLogin]:", err);
    return res.status(500).json({
      success: false,
      msg: "Login failed",
      data: null,
    });
  }
}

async function verifyAdminLogin(req, res) {
  try {
    const schema = Joi.object({
      login: Joi.string().min(3).required(),
      otp: Joi.string()
        .length(6)
        .pattern(/^[0-9]{6}$/)
        .required(),
      password: Joi.string().min(8).optional(),
      action: Joi.string().optional(),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    const { login, otp } = value;

    // find admin
    const admin = isValidEmail(login)
      ? await Admin.findOne({ where: { email: login } })
      : await Admin.findOne({ where: { username: login } });

    if (!admin) {
      return res.status(400).json({ success: false, msg: "User not found" });
    }

    // status check
    if (admin.status !== 1) {
      return res.status(403).json({
        success: false,
        msg: `This account is ${admin.status === 2 ? "suspended" : "disabled"}`,
      });
    }

    // ---------- derive 2FA type same way as in adminLogin ----------
    const twoFAType = (() => {
      if (typeof admin.twoFactorEnabled === "number") {
        if (admin.twoFactorEnabled === 1) return "app";
        if (admin.twoFactorEnabled === 2) return "email";
        return "off";
      }

      if (admin.two_fa === 1) {
        if (admin.two_fa_method === "auth_app") return "app";
        if (admin.two_fa_method === "email") return "email";
      }
      return "off";
    })();
    // ----------------------------------------------------------------

    if (twoFAType === "app" && admin.two_fa_secret) {
      const ok = await verifyTwoFAToken(admin, otp);
      if (!ok) {
        return res.status(400).json({ success: false, msg: "Invalid OTP" });
      }
    } else {
      // email OTP flow (twoFactorEnabled = 2 or legacy email mode)
      const otpRecord = await AdminOTP.findOne({
        where: {
          adminId: admin.id,
          status: 0,
          expiry: { [Op.gt]: new Date() },
        },
        order: [["createdAt", "DESC"]],
      });

      if (!otpRecord) {
        return res
          .status(404)
          .json({ success: false, msg: "Invalid login or OTP" });
      }

      if (String(otpRecord.otp) !== String(otp)) {
        return res.status(400).json({ success: false, msg: "Invalid OTP" });
      }

      await otpRecord.update({ status: 1 });
    }

    let sessionToken;
    try {
      const crypto = require("node:crypto");
      sessionToken = crypto.randomBytes(32).toString("base64url");
    } catch (e) {
      sessionToken = Buffer.from(
        `${Date.now()}-${admin.id}-${Math.random()}`
      ).toString("base64");
    }

    const maxDays = parseInt(
      await getOption("max_admin_session_duration_days", 7),
      10
    );
    const expiresAt = new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000);

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
    const userAgent = req.headers["user-agent"] || "";

    await AdminSession.create({
      adminId: admin.id,
      sessionToken: sessionToken,
      ip,
      userAgent,
      expiresAt,
      status: 1,
    });

    // 🔐 set the same cookie your normal login uses
    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

    res.cookie("session_key", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: maxAgeMs,
    });

    return res.status(200).json({
      success: true,
      msg: "Login verified",
      data: {
        admin,
        token: sessionToken,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("Error during verifyAdminLogin:", error);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}


async function sendOTPAgain(req, res) {
  try {
    const sendOTPAgainSchema = Joi.object({
      login: Joi.string().min(3).required().messages({
        "string.base": "Login must be a string",
        "string.min": "Username/Email must be at least 3 characters",
        "any.required": "Login is required",
      }),
      action: Joi.string().required().messages({
        "any.required": "Invalid Data",
      }),
    });
    const { error, value } = sendOTPAgainSchema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    const { login, action } = value;

    // Find user by either email or username
    let user = isValidEmail(login)
      ? await Admin.findOne({ where: { email: login } })
      : await Admin.findOne({ where: { username: login } });

    if (!user) {
      return res.status(400).json({ success: false, msg: "User not found" });
    }

    // Getting time for otp expiration
    const admin_otp_valid_minutes = parseInt(
      await getOption("admin_otp_valid_minutes", 5),
      10
    );

    // Generate OTP for 2FA
    const otp = generateOtp();
    const otpExpiration = generateOtpExpiration(admin_otp_valid_minutes);

    // Destroy all otps

    // Creating new OTP
    await AdminOTP.create({
      adminId: user.id,
      otp: otp,
      expiry: otpExpiration,
      action: action,
      status: 0,
    });

    let title = "";
    let mailUI = "";

    if (action === "suspicious_user_login") {
      title = "Suspicious Login Attempt – Verify with OTP";
      const locationData = await getLocation(getRealIp(req));
      const location_city = locationData.city;
      const location_state = locationData.state;
      const location_country_name = locationData.country;
      const suspiciousUser = {
        location: `${location_city}, ${location_state}, ${location_country_name}`,
        loginTime: new Date(),
      };
      mailUI = suspiciousUserMail(otp, user, suspiciousUser);
    } else if (action === "login_2fa") {
      title = "Verify Your Account Login – Verify with OTP";
      mailUI = loginMail(otp, user);
    }

    await transporter.sendMail({
      from: noReplyMail,
      to: user.email, // Send OTP to the user's registered email
      subject: title,
      html: mailUI,
    });

    return res.status(200).json({
      success: true,
      msg: "OTP sent again",
    });
  } catch (error) {
    console.error("Error during sendOTPAgain:", error);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function forgotAdminPassword(req, res) {
  try {
    // Handle validation errors
    const forgotPasswordSchema = Joi.object({
      email: Joi.string().email().required().messages({
        "string.base": "Email must be a string",
        "string.email": "Email must be valid",
        "any.required": "Email is required",
      }),
      captchaToken: Joi.string().optional().allow(null),
    });

    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, msg: error.details[0].message });
    }

    const canGo = await captchaVerification(req, "admin_forgot_password");
    if (!canGo) {
      return res.status(404).json({ success: false, msg: "Invaild Captcha" });
    }

    const { email } = value;

    // Find user by either email
    const user = await Admin.findOne({ where: { email: email } });
    if (!user) {
      return res
        .status(400)
        .json({ success: false, msg: "Otp send if email is correct." });
    }

    if (user.status !== 1) {
      return res.status(404).json({
        success: false,
        msg: `This account is ${user.status === 2 ? "suspended" : "disabled"}`,
      });
    }

    // Getting time for otp expiration
    const admin_otp_valid_minutes = parseInt(
      await getOption("admin_otp_expires_forgot_password_minutes", 5),
      10
    );

    // Generate OTP for 2FA
    const otp = generateOtp();
    const otpExpiration = generateOtpExpiration(admin_otp_valid_minutes);

    // Save new admin otp
    await AdminOTP.create({
      adminId: user.id,
      otp: otp,
      expiry: otpExpiration,
      action: "forgot_password",
    });

    await transporter.sendMail({
      from: noReplyMail,
      to: user.email, // Send OTP to the user's registered email
      subject: "Your OTP for Forgot Password Action For GPLinks",
      html: forgotPasswordMail(otp, user),
    });

    return res.status(200).json({
      success: true,
      msg: "OTP sent.",
      action: "forgot_password",
    });
  } catch (error) {
    console.error("Error during forgotAdminPassword:", error);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

// ADMIN: verify forgot-password OTP and reset password
async function verifyForgotPassword(req, res) {
  try {
    // 1) validate input – matches what you send from Postman
    const schema = Joi.object({
      email: Joi.string().trim().email().required(),
      password: Joi.string().trim().min(8).required(),
      otp: Joi.string()
        .length(6)
        .pattern(/^[0-9]{6}$/)
        .required(),
    });

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        msg: error.details[0].message,
        data: null,
      });
    }

    const { email, password, otp } = value;

    // 2) find admin
    const admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      return res.status(400).json({
        success: false,
        msg: "User not found",
        data: null,
      });
    }

    // 3) get latest valid OTP for this admin, for 'forgot_password'
    const now = new Date();
    const otpRecord = await AdminOTP.findOne({
      where: {
        adminId: admin.id,
        action: "forgot_password",
        status: 0,
        expiry: { [Op.gt]: now },
      },
      order: [["createdAt", "DESC"]],
    });

    // if no row, it's expired or never created
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        msg: "Invalid OTP or expired.",
        data: null,
      });
    }

    // 4) compare as string so number/string mismatch doesn't break it
    if (String(otpRecord.otp) !== String(otp)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid OTP or expired.",
        data: null,
      });
    }

    // 5) hash and update admin password
    const hashed = await bcrypt.hash(password, 12);
    await admin.update({ password: hashed });

    // 6) mark this OTP as used
    await otpRecord.update({ status: 1 });

    return res.status(200).json({
      success: true,
      msg: "Password updated successfully.",
    });
  } catch (error) {
    console.error("Error during verifyForgotPassword:", error);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

async function checkIsSessionValid(req, res) {
  try {
    // 2) Validate admin session
    const session = await isAdminSessionValid(req, res);

    console.warn(session);
    if (!session?.success) {
      return res
        .status(401)
        .json({ success: false, msg: session?.msg || "Unauthorized" });
    }

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("Error during checkIsSessionValid:", error);
    return res
      .status(500)
      .json({ success: false, msg: "Internal server error" });
  }
}

module.exports = {
  verifyForgotPassword,
  forgotAdminPassword,
  sendOTPAgain,
  verifyAdminLogin,
  adminLogin,
  checkIsSessionValid,
};
