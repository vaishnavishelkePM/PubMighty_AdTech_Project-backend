const sequelize = require("../config/db");
const Option = require("../models/Option");

async function set(name, value) {
  await Option.findOrCreate({
    where: { name },
    defaults: { value: String(value) }, // store as string "true"/"false"
  });
}

async function runOptionsCreation() {
  try {
    await Option.destroy({
      where: {},
      truncate: true,
      restartIdentity: true, // ensures AUTO_INCREMENT resets to 1
    });

    await set("is_app_twoFA_enable_on_admin_login", false);
    await set("is_email_verifiy_on_suspicious_admin_login", false);

    // Two-factor toggle
    await set("publisher_login_two_fa_enable", true);
    await set("partner_login_two_fa_enable", true);
    await set("admin_login_two_fa_enable", true);

    await set("max_publisher_session_duration_days", 7);
    await set("max_partner_session_duration_days", 7);
    await set("max_admin_session_duration_days", 7);

    await set("min_time_to_update_last_activity_at_minute", 30);

    await set("update_last_activity_for_admin", 30);
    await set("update_last_activity_for_publisher", 30);
    await set("update_last_activity_for_partner", 30);

    await set("admin_otp_valid_minutes", 15);
    await set("publisher_otp_valid_minutes", 15);
    await set("partner_otp_valid_minutes", 15);

    await set("publisher_register_two_fa_enable", true);
    await set("partner_register_two_fa_enable", true);
    // Global provider toggles

    await set("max_admin_sessions", 4);
    await set("max_publisher_sessions", 4);
    await set("max_publisher_sessions", 4);

    await set("partner_otp_expires_register_minutes", 5);
    await set("partner_otp_expires_login_minutes", 5);
    await set("partner_otp_expires_forgot_password_minutes", 5);

    await set("admin_otp_expires_login_minutes", 5);
    await set("admin_otp_expires_forgot_password_minutes", 5);

    await set("publisher_otp_expires_register_minutes", 5);
    await set("publisher_otp_expires_login_minutes", 5);
    await set("publisher_otp_expires_forgot_password_minutes", 5);

    // Per-flow configs
    await set("publisher_login_captcha_enabled", true);
    await set("publisher_login_captcha", "altcha");
    await set("partner_login_captcha_enabled", true);
    await set("partner_login_captcha", "altcha");
    await set("admin_login_captcha_enabled", true);
    await set("admin_login_captcha", "altcha");

    await set("publisher_register_captcha_enabled", true);
    await set("publisher_register_captcha", "altcha");
    await set("partner_register_captcha_enabled", true);
    await set("partner_register_captcha", "altcha");

    await set("publisher_forgot_password_captcha_enabled", false);
    await set("publisher_forgot_password_captcha", "altcha");
    await set("partner_forgot_password_captcha_enabled", false);
    await set("partner_forgot_password_captcha", "altcha");
    await set("admin_forgot_password_captcha_enabled", false);
    await set("admin_forgot_password_captcha", "altcha");

    await set("is_recaptcha_enable", false);
    await set("is_hcaptcha_enable", false);
    await set("is_cloudflare_turnstile_enable", false);
    await set("is_svg_image_enable", false);
    await set("is_altcha_enable", true);

    await set("admin_per_page", 10);
    await set("total_maxpage_for_inventory", 100);
    await set("default_per_page_inventory", 20);
    
    await set("recaptcha_secret_key", '');
    await set("recaptcha_site_key", '');

   await set("hcaptcha_secret_key", "");
   await set("hcaptcha_site_key", "");

   await set("cloudflare_turnstile_secret_key", "");
   await set("cloudflare_turnstile_site_key", "");

   await set("altcha_captcha_key", "pybmekv1sjcoiu57x7e8");
   await set("altcha_captcha_challenge_number", 1000000);



    console.log("Options inserted/verified");
    process.exit(0);
  } catch (e) {
    console.error("inserting error:", e);
    process.exit(1);
  }
}

module.exports = {
  runOptionsCreation,
};
