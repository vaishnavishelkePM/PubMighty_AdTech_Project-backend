const { transporter } = require("../config/mail");
const Option = require("../models/Option");
const { returnMailTemplate } = require("./helpers/mailUIHelper");
const crypto = require("crypto");
const UAParser = require("ua-parser-js");
const geoip = require("geoip-lite");
const AdminSession = require("../models/Admin/AdminSession");
const { Op } = require("sequelize");
const path = require("path");
const maxmind = require("maxmind");
const AdminOTP = require("../models/Admin/AdminOTP");
// Path to the GeoLite2-City database in the same folder
const dbPath = path.join(__dirname, "/ip-db/GeoLite2-City.mmdb");
let lookup;
const BCRYPT_ROUNDS = 12;
const noReplyMail = "no-reply@gplinks.org";
/**
 * Helper function to get location data for a given IP
 * @param {string} ip - The IP address to look up
 * @returns {Object} - Object containing city and country
 */
async function getLocation(ip) {
  if (!lookup) {
    try {
      lookup = await maxmind.open(dbPath);
      // console.log("GeoLite2 database loaded successfully.");
    } catch (err) {
      console.error("Error loading GeoLite2 database:", err);
      return {
        city: "Unknown",
        state: "Unknown",
        country: "Unknown",
        countryCode: "Unk",
      };
    }
  }

  try {
    const locationData = lookup.get(ip) || {};
    return {
      city: locationData.city?.names?.en || "Unknown",
      state: locationData.subdivisions?.[0]?.names?.en || "Unknown",
      country: locationData.country?.names?.en || "Unknown",
      countryCode: locationData.country?.iso_code || "Unk", // ISO code for the country
    };
  } catch (err) {
    console.error("Error looking up IP:", err);
    return {
      city: "Unknown",
      state: "Unknown",
      country: "Unknown",
      countryCode: "Unk",
    };
  }
}

function getUserAgentData(req) {
  const headers = req && req.headers ? req.headers : {};
  const ua = headers["user-agent"] || "";
  const parsed = new UAParser(ua).getResult();

  return {
    os: parsed.os?.name
      ? `${parsed.os.name} ${parsed.os.version || ""}`.trim()
      : "unknown",
    browser: parsed.browser?.name
      ? `${parsed.browser.name} ${parsed.browser.version || ""}`.trim()
      : "unknown",
    userAgent: ua,
  };
}

// function getUserAgentData(req) {
//   const ua = req.headers["user-agent"] || "";
//   const parsed = new UAParser(ua).getResult();

//   return {
//     os: parsed.os?.name
//       ? `${parsed.os.name} ${parsed.os.version || ""}`.trim()
//       : "unknown",
//     browser: parsed.browser?.name
//       ? `${parsed.browser.name} ${parsed.browser.version || ""}`.trim()
//       : null,
//     userAgent: ua,
//   };
// }

// function getRealIp(req) {
//   // Check for Cloudflare's header first
//   const cfIp = req.headers["cf-connecting-ip"];
//   if (cfIp) return cfIp;

//   // Check for X-Forwarded-For header (usually used by proxies)
//   const forwardedIps = req.headers["x-forwarded-for"];
//   if (forwardedIps) {
//     const ips = forwardedIps.split(",");
//     return ips[0].trim(); // Return the first IP in the list
//   }

//   // Fallback to req.ip, which is the IP of the client directly connected to the server
//   return req.ip || req.connection.remoteAddress;
// }

function getRealIp(req) {
  // make sure req and req.headers exist
  const headers = req && req.headers ? req.headers : {};

  // cloudflare
  const cfIp = headers["cf-connecting-ip"];
  if (cfIp) return cfIp;

  // proxy / nginx
  const xff = headers["x-forwarded-for"];
  if (xff) {
    // can be: "client, proxy1, proxy2"
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }

  // express' own
  if (req && req.ip) return req.ip;

  // node fallback
  const conn = req && req.connection;
  if (conn && conn.remoteAddress) return conn.remoteAddress;

  const socket = req && req.socket;
  if (socket && socket.remoteAddress) return socket.remoteAddress;

  return "Unknown";
}

// async function getOption(optionName, dValue = null) {
//   try {
//     const option = await Option.findOne({ where: { name: optionName } });
//     if (option) {
//       option.dValue = dValue;
//     }

//     return dValue; // Return default value if option is not found
//   } catch (error) {
//     console.error("Error fetching option:", error);
//     return dValue; // Return default value in case of error
//   }
// }

async function getOption(optionName, dValue = null) {
  try {
    const option = await Option.findOne({ where: { name: optionName } });

    if (option && option.value != null) {
      return option.value;
    }

    return dValue;
  } catch (error) {
    console.error("Error fetching option:", error);
    return dValue;
  }
}

async function sendOtpMail(user, otpObj, title, action) {
  // Destructure otp and expiry from otpObj
  const { otp, expiry } = otpObj;

  // Ensure that OTP and expiry are correctly destructured
  if (!otp || !expiry) {
    console.error("Invalid OTP object:", otpObj); // Log invalid OTP object
    throw new Error("OTP object is missing required properties");
  }

  const htmlContent = returnMailTemplate(user, otpObj, action);

  return transporter.sendMail({
    from: `Mighty Games <no-reply@gplinks.org>`,
    // from: `"Mighty Games" <no-reply@mightygames.com>`,
    to: user.email,
    subject: title,
    text: `Your OTP is: ${otp} (valid for 5 minutes)`,
    html: htmlContent,
  });
}

function generateOtp() {
  const otp = crypto.randomInt(100000, 1000000); // Generates a number between 100000 and 999999
  return otp.toString(); // Return the OTP as a string
}

function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email); // Returns true if it's a valid email, false otherwise
}

function getRange(period = "thisweek", now = new Date()) {
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  const p = String(period).toLowerCase();
  let start, end;

  switch (p) {
    case "today": {
      start = startOfDay(now);
      end = endOfDay(now);
      break;
    }

    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      start = startOfDay(y);
      end = endOfDay(y);
      break;
    }

    case "last7": {
      end = endOfDay(now);
      const s = new Date(end);
      s.setDate(end.getDate() - 6);
      start = startOfDay(s);
      break;
    }

    case "last30": {
      end = endOfDay(now);
      const s = new Date(end);
      s.setDate(end.getDate() - 29);
      start = startOfDay(s);
      break;
    }

    case "lastweek": {
      const [thisWeekStart] = thisWeek();
      start = new Date(thisWeekStart);
      start.setDate(start.getDate() - 7);
      end = new Date(thisWeekStart);
      end.setMilliseconds(-1);
      start = startOfDay(start);
      end = endOfDay(end);
      break;
    }

    case "thismonth": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start = startOfDay(start);
      end = endOfDay(now);
      break;
    }

    case "lastmonth": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      start = startOfDay(start);
      end = endOfDay(end);
      break;
    }

    case "thisyear": {
      start = new Date(now.getFullYear(), 0, 1);
      return [startOfDay(start), endOfDay(now)];
    }

    case "lastyear": {
      const y = now.getFullYear() - 1;
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31);
      start = startOfDay(start);
      end = endOfDay(end);
      break;
    }

    default: {
      const day = now.getDay();
      const monDiff = day === 0 ? -6 : 1 - day;
      start = new Date(now);
      start.setDate(now.getDate() + monDiff);
      start = startOfDay(start);
      end = endOfDay(now);
      break;
    }
  }
  return [start, end];
}

async function generateUniqueUsername(base) {
  const cleaned = (base || "user").toLowerCase().replace(/[^a-z0-9_.]/g, "");
  let candidate =
    cleaned.length >= 3
      ? cleaned.slice(0, 30)
      : `user${crypto.randomInt(1000, 9999)}`;
  let i = 0;

  while (true) {
    const exists = await User.findOne({ where: { username: candidate } });
    if (!exists) return candidate;
    i += 1;
    candidate = (cleaned || "user").slice(0, 24) + i;
  }
}

async function ensurePublicId(user) {
  if (user.publicId) return;
  const id = String(user.id);
  const secretKey = process.env.PUBLIC_UID_SECRET;
  const publicId = crypto
    .createHmac("sha256", secretKey)
    .update(id)
    .digest("hex");
  await user.update({ publicId });
}

function resolveDateRange(preset, startDateStr, endDateStr) {
  const now = new Date();
  const todayStart = toStartOfDay(now);
  const todayEnd = toEndOfDay(now);

  const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);

  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999
  );

  const thisWeekStart = getMonday(now);
  const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
  const lastWeekStart = getMonday(
    new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  );

  switch ((preset || "").toLowerCase()) {
    case "today":
      return { start: todayStart, end: todayEnd };
    case "yesterday": {
      const y = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      return { start: toStartOfDay(y), end: toEndOfDay(y) };
    }
    case "this_week":
      return { start: thisWeekStart, end: todayEnd };
    case "last_week":
      return { start: lastWeekStart, end: lastWeekEnd };
    case "this_month":
      return { start: toStartOfDay(firstOfThisMonth), end: todayEnd };
    case "last_month":
      return { start: toStartOfDay(firstOfLastMonth), end: endOfLastMonth };
    case "last_3_months": {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 3);
      return { start: toStartOfDay(s), end: todayEnd };
    }
    case "last_6_months": {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 6);
      return { start: toStartOfDay(s), end: todayEnd };
    }
    case "this_year":
      return { start: toStartOfDay(yearStart), end: todayEnd };
    case "custom": {
      // defensive: accept startDater / End Date variations
      const sd = startDateStr || undefined;
      const ed = endDateStr || undefined;
      if (!sd || !ed) return null;
      const sDate = toStartOfDay(new Date(sd));
      const eDate = toEndOfDay(new Date(ed));
      if (isNaN(sDate) || isNaN(eDate)) return null;
      return { start: sDate, end: eDate };
    }
    default:
      return null; // no date filter
  }
}

function toNullIfEmpty(v) {
  // Handle undefined and null early
  if (v === undefined || v === null) return null;

  // If value is a number (or numeric string)
  if (!isNaN(v)) {
    return v === "" ? null : v;
  }

  // If value is non-numeric string or other type
  if (typeof v === "string") {
    return v.trim() === "" ? null : v.trim();
  }

  // Return as-is for all other types (e.g., objects, booleans)
  return v;
}

const getOptionsByIds = async (ids) => {
  return await Option.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ["id", "name", "value"],
  });
};

// Helper function to detect suspicious login
async function detectSuspiciousAdminLogin(user, req) {
  const userAgent = req.headers["user-agent"] || "Unknown";
  const locationData = await getLocation(getRealIp(req));
  const location_city = locationData.city;
  const location_country = locationData.country;

  const oldSession = await AdminSession.findOne({
    where: {
      adminId: user.id,
      status: 1,
      userAgent: userAgent,
      // location_city: location_city,
      country: location_country,
    },
    order: [["createdAt", "DESC"]],
  });

  return !oldSession; // If no old session found, it's suspicious
}

// Helper function to send 2FA OTP
async function sendAdmin2FAOtp(user, req, action) {
  // Getting time for otp expiration
  const otp_valid_minutes_admin = parseInt(
    await getOption("admin_otp_valid_minutes", 15),
    10
  );

  // Generate OTP for 2FA
  const otp = generateOtp();
  const otpExpiration = generateOtpExpiration(otp_valid_minutes_admin);

  await AdminOTP.destroy({
    where: {
      adminId: user.id,
      action: action,
    },
  });

  // Save new OTP in the OTP table
  await AdminOTP.create({
    adminId: user.id,
    otp: otp,
    expiry: otpExpiration,
    action: action,
    status: 0, // New OTP is unused (status 0)
  });

  const locationData = await getLocation(getRealIp(req));
  const location_city = locationData.city;
  const location_state = locationData.state;
  const location_country_name = locationData.country;
  const suspiciousUser = {
    location: `${location_city}, ${location_state}, ${location_country_name}`,
    loginTime: new Date(),
  };

  // Send OTP via email
  await transporter.sendMail({
    from: noReplyMail,
    to: user.email, // Send OTP to the user's registered email
    subject:
      action === "suspicious_user_login"
        ? "Suspicious GPlinks Account Login Attempt – Verify with OTP"
        : "Verify Your GPlinks Account Login – Verify with OTP",
    html:
      action === "suspicious_user_login"
        ? suspiciousUserMail(otp, user, suspiciousUser)
        : loginMail(otp, user),
  });
}
// Helper function to generate expiration time for OTP (10 minutes from now)
function generateOtpExpiration(time) {
  return new Date(Date.now() + time * 60 * 1000); // 10 minutes from now
}

async function verifyTwoFAToken(user, token) {
  try {
    if (!user) {
      // console.warn("User object is missing.");
      return false;
    }

    // Handle user status (suspended)
    if (user.status === 3) {
      return false;
    }

    // Extract the 2FA secret from the user object
    const userSecret = user.two_fa_secret;
    if (!userSecret) {
      // console.warn("User does not have a 2FA secret.");
      return false;
    }

    // Validate the 2FA token
    const isVerified = validateTwoFAToken(userSecret, token);

    if (isVerified) {
      // console.info("2FA token verified successfully.");
      return true;
    } else {
      // console.warn("Invalid 2FA token.");
      return false;
    }
  } catch (error) {
    console.error("Error verifying 2FA token:", error.message);
    return false;
  }
}

function verifyAdminRole(admin, work) {
  return true;
}
function isOtpValid(inputOtp, otpRecord) {
  if (!otpRecord) {
    // console.warn("OTP record is missing.");
    return false;
  }
  const { otp_secret, otp_expiration, status } = otpRecord;

  if (!inputOtp || !otp_secret) {
    // console.warn("Missing OTP or secret.");
    return false;
  }

  const currentTime = new Date();

  // Validation checks
  if (inputOtp !== otp_secret) {
    // console.warn("OTP does not match.");
    return false;
  }

  if (currentTime > otp_expiration) {
    // console.warn("OTP has expired.");
    return false;
  }

  if (status !== 0) {
    // Assuming 0 means unused
    // console.warn("OTP has already been used or is inactive.");
    return false;
  }

  // console.info("OTP is valid.");
  return true;
}
module.exports = {
  getLocation,
  getUserAgentData,
  getRealIp,
  getOption,
  sendOtpMail,
  BCRYPT_ROUNDS,
  generateOtp,
  isValidEmail,
  getRange,
  generateUniqueUsername,
  ensurePublicId,
  resolveDateRange,
  toNullIfEmpty,
  getOptionsByIds,
  detectSuspiciousAdminLogin,
  noReplyMail,
  sendAdmin2FAOtp,
  generateOtpExpiration,
  verifyTwoFAToken,
  verifyAdminRole,
  isOtpValid,
};
