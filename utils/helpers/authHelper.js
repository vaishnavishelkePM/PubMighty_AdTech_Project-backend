const AdminSession = require("../../models/Admin/AdminSession");
const PublisherSession = require("../../models/Publishers/PublisherSession");
const PartnerSession = require("../../models/Partners/PartnerSession");
const { Op } = require("sequelize");
const {
  getOption,
  getRealIp,
  getUserAgentData,
  getLocation,
} = require("../helper");
const crypto = require("crypto");

async function handleAdminSessionCreate(user, req, transaction = null) {
  // 1. gather context
  const ip = getRealIp(req);
  const locationData = await getLocation(ip);
  const userAgentData = await getUserAgentData(req);

  // options (your getOption currently always returns default, but that's fine)
  const maxSessionDays = parseInt(
    await getOption("max_admin_session_duration_days", 7),
    10
  );
  const maxSessionSeconds = maxSessionDays * 24 * 3600;

  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxSessionSeconds * 1000);

  // 2. mark already-expired active sessions for THIS admin as inactive
  await AdminSession.update(
    { status: 2 },
    {
      where: {
        adminId: user.id, // <-- was userId
        status: 1,
        expiresAt: { [Op.lt]: now },
      },
      transaction,
    }
  );

  // 3. count current sessions for this admin
  const activeCount = await AdminSession.count({
    where: { adminId: user.id },
    transaction,
  });

  const maxUserSessions = parseInt(
    await getOption("max_admin_sessions", 4),
    10
  );

  // common payload for create/update
  const sessionPayload = {
    adminId: user.id,
    sessionToken: token,
    ip: ip,
    userAgent: userAgentData.userAgent,
    country: locationData.countryCode,
    os: userAgentData.os,
    browser: userAgentData.browser,
    status: 1,
    expiresAt: expiresAt,
  };

  if (activeCount < maxUserSessions) {
    // 4a. create new session
    await AdminSession.create(sessionPayload, { transaction });
    return { token, expiresAt };
  }

  // 4b. otherwise reuse oldest
  const oldestActive = await AdminSession.findOne({
    where: { adminId: user.id },
    order: [["expiresAt", "ASC"]],
    transaction,
  });

  if (!oldestActive) {
    // fallback: create
    await AdminSession.create(sessionPayload, { transaction });
    return { token, expiresAt };
  }

  await oldestActive.update(sessionPayload, { transaction });
  return { token, expiresAt };
}

async function isAdminSessionValid(req) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer")) {
      return {
        success: false,
        message: "Missing or invalid Authorization header",
        data: null,
      };
    }

    const token = authHeader.split(" ")[1];
    const session = await AdminSession.findOne({
      where: { sessionToken: token, status: 1 },
    });

    if (!session) {
      return { success: false, message: "Invalid session", data: null };
    }

    const now = new Date();
    if (session.expiresAt && session.expiresAt < now) {
      await session.update({ status: 2 });
      return { success: false, message: "Session expired", data: null };
    }
    const SLIDING_IDLE_SEC =
      parseInt(await getOption("admin_min_update_interval", 30)) * 60 * 1000; // Convert to milliseconds

    // Sliding idle TTL
    if (SLIDING_IDLE_SEC > 0) {
      const lastActivityAt = session.lastActivityAt;
      if (lastActivityAt) {
        const timeDifference = now - new Date(lastActivityAt);

        if (timeDifference >= SLIDING_IDLE_SEC) {
          // If 30 minutes have passed, update lastActivityAt
          await session.update({ lastActivityAt: now });
          console.log("Updated lastActivityAt to current time.");
        }
      } else {
        await session.update({ lastActivityAt: now });
      }
    }

    return {
      success: true,
      message: "Sesssion is valid",
      data: session.adminId,
    };
  } catch (err) {
    console.error("Auth error:", err);
    return {
      success: false,
      message: "Server error during auth",
      data: null,
    };
  }
}

async function handlePublisherSessionCreate(req, userId, transaction = null) {
  const ip = getRealIp(req);
  const locationData = await getLocation(ip);
  const userAgentData = await getUserAgentData(req);
  const maxUserSessionDurationDays = parseInt(
    await getOption("max_publisher_session_duration_days", 7)
  );
  const maxUserSessionDurationSeconds = maxUserSessionDurationDays * 24 * 3600;

  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + maxUserSessionDurationSeconds * 1000
  );

  // Mark already-expired active sessions as inactive (status: 2=inactive 1=active)
  await PublisherSession.update(
    { status: 2 },
    {
      where: {
        userId,
        status: 1,
        expiresAt: { [Op.lt]: now },
      },
      transaction,
    }
  );

  // Count current ACTIVE sessions
  const activeCount = await PublisherSession.count({
    where: { userId },
    transaction,
  });

  const maxUserSessions = parseInt(
    await getOption("max_publisher_sessions", 4)
  );

  if (activeCount < maxUserSessions) {
    // CREATE new active session
    await PublisherSession.create(
      {
        userId,
        sessionToken: token,
        ip: ip,
        userAgent: userAgentData.userAgent,
        country: locationData.countryCode,
        os: userAgentData.os,
        browser: userAgentData.browser,
        status: 1, // active
        expiresAt: expiresAt,
      },
      { transaction }
    );
    return { token, expiresAt };
  }

  // Get the oldest active session
  const oldestActive = await PublisherSession.findOne({
    where: { userId },
    order: [["expiresAt", "ASC"]],
    transaction,
  });

  if (!oldestActive) {
    // fallback: create if none found
    await PublisherSession.create(
      {
        userId,
        sessionToken: token, // correct column name
        ip: ip,
        userAgent: userAgentData.userAgent,
        country: locationData.countryCode,
        os: userAgentData.os,
        browser: userAgentData.browser,
        status: 1, // active
        expiresAt: expiresAt,
      },
      { transaction }
    );
    return { token, expiresAt };
  }

  await oldestActive.update(
    {
      userId,
      sessionToken: token,
      ip: ip,
      userAgent: userAgentData.userAgent,
      country: locationData.countryCode,
      os: userAgentData.os,
      browser: userAgentData.browser,
      status: 1, // active
      expiresAt: expiresAt,
    },
    { transaction }
  );

  return { token, expiresAt };
}

async function isPublisherSessionValid(req) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Missing or invalid Authorization header",
        data: null,
      };
    }

    const token = authHeader.split(" ")[1];
    const session = await PublisherSession.findOne({
      where: { sessionToken: token, status: 1 }, // correct column + numeric
    });

    if (!session) {
      return { success: false, message: "Invalid session", data: null };
    }

    const now = new Date();
    if (session.expiresAt && session.expiresAt < now) {
      await session.update({ status: 2 }); // 2 = inactive/expired
      return { success: false, message: "Session expired", data: null };
    }
    const SLIDING_IDLE_SEC =
      parseInt(await getOption("publisher_min_update_interval", 30)) *
      60 *
      1000; // Convert to milliseconds

    // Sliding idle TTL
    if (SLIDING_IDLE_SEC > 0) {
      const lastActivityAt = session.lastActivityAt;
      if (lastActivityAt) {
        const timeDifference = now - new Date(lastActivityAt);

        if (timeDifference >= SLIDING_IDLE_SEC) {
          // If 30 minutes have passed, update lastActivityAt
          await session.update({ lastActivityAt: now });
          console.log("Updated lastActivityAt to current time.");
        }
      } else {
        await session.update({ lastActivityAt: now });
      }
    }

    return {
      success: true,
      message: "Sesssion is valid",
      data: session.userId,
    };
  } catch (err) {
    console.error("Auth error:", err);
    return {
      success: false,
      message: "Server error during auth",
      data: null,
    };
  }
}

async function handlePartnerSessionCreate(req, userId, transaction = null) {
  const ip = getRealIp(req);
  const locationData = await getLocation(ip);
  const userAgentData = await getUserAgentData(req);
  const maxUserSessionDurationDays = parseInt(
    await getOption("max_partner_session_duration_days", 7)
  );
  const maxUserSessionDurationSeconds = maxUserSessionDurationDays * 24 * 3600;

  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + maxUserSessionDurationSeconds * 1000
  );

  // Mark already-expired active sessions as inactive (status: 2=inactive 1=active)
  await PartnerSession.update(
    { status: 2 },
    {
      where: {
        userId,
        status: 1,
        expiresAt: { [Op.lt]: now },
      },
      transaction,
    }
  );

  // Count current ACTIVE sessions
  const activeCount = await PartnerSession.count({
    where: { userId },
    transaction,
  });

  const maxUserSessions = parseInt(await getOption("max_partner_sessions", 4));

  if (activeCount < maxUserSessions) {
    // CREATE new active session
    await PartnerSession.create(
      {
        userId,
        sessionToken: token,
        ip: ip,
        userAgent: userAgentData.userAgent,
        country: locationData.countryCode,
        os: userAgentData.os,
        browser: userAgentData.browser,
        status: 1, // active
        expiresAt: expiresAt,
      },
      { transaction }
    );
    return { token, expiresAt };
  }

  // Get the oldest active session
  const oldestActive = await PartnerSession.findOne({
    where: { userId },
    order: [["expiresAt", "ASC"]],
    transaction,
  });

  if (!oldestActive) {
    // fallback: create if none found
    await PartnerSession.create(
      {
        userId,
        sessionToken: token, // correct column name
        ip: ip,
        userAgent: userAgentData.userAgent,
        country: locationData.countryCode,
        os: userAgentData.os,
        browser: userAgentData.browser,
        status: 1, // active
        expiresAt: expiresAt,
      },
      { transaction }
    );
    return { token, expiresAt };
  }

  await oldestActive.update(
    {
      userId,
      sessionToken: token,
      ip: ip,
      userAgent: userAgentData.userAgent,
      country: locationData.countryCode,
      os: userAgentData.os,
      browser: userAgentData.browser,
      status: 1, // active
      expiresAt: expiresAt,
    },
    { transaction }
  );

  return { token, expiresAt };
}

async function isPartnerSessionValid(req) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Missing or invalid Authorization header",
        data: null,
      };
    }

    const token = authHeader.split(" ")[1];
    const session = await PartnerSession.findOne({
      where: { sessionToken: token, status: 1 }, // correct column + numeric
    });

    if (!session) {
      return { success: false, message: "Invalid session", data: null };
    }

    const now = new Date();
    if (session.expiresAt && session.expiresAt < now) {
      await session.update({ status: 2 }); // 2 = inactive/expired
      return { success: false, message: "Session expired", data: null };
    }
    const SLIDING_IDLE_SEC =
      parseInt(await getOption("partner_min_update_interval", 30)) * 60 * 1000; // Convert to milliseconds

    // Sliding idle TTL
    if (SLIDING_IDLE_SEC > 0) {
      const lastActivityAt = session.lastActivityAt;
      if (lastActivityAt) {
        const timeDifference = now - new Date(lastActivityAt);

        if (timeDifference >= SLIDING_IDLE_SEC) {
          // If 30 minutes have passed, update lastActivityAt
          await session.update({ lastActivityAt: now });
          console.log("Updated lastActivityAt to current time.");
        }
      } else {
        await session.update({ lastActivityAt: now });
      }
    }

    return {
      success: true,
      message: "Sesssion is valid",
      data: session.userId,
    };
  } catch (err) {
    console.error("Auth error:", err);
    return {
      success: false,
      message: "Server error during auth",
      data: null,
    };
  }
}

module.exports = {
  isPartnerSessionValid,
  handlePartnerSessionCreate,
  isPublisherSessionValid,
  handlePublisherSessionCreate,
  isAdminSessionValid,
  handleAdminSessionCreate,
};
