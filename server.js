// const express = require("express");
// const sequelize = require("./config/db");
// const cors = require("cors");

// //const { initAssociations } = require("./models/Associations");
// const publisherRoutes = require("./routes/publisherRoutes");
// const partnerRoutes = require("./routes/partnerRoutes");
// const adminRoutes = require("./routes/adminRoutes");
// const { runOptionsCreation } = require("./script/OptionModify");
// require("dotenv").config();
// const { initAssociations } = require("./models/Associations");
// const app = express();
// const PORT = process.env.PORT || 5000;

// // Trust the first proxy (required for X-Forwarded-For)
// app.set("trust proxy", 1);

// // Serve static files from the 'public' folder
// app.use(express.static("public"));

// app.use(cors());

// app.use(express.json({ limit: "3mb" }));

// app.use("/v1/admin", adminRoutes);
// app.use("/v1/publisher", publisherRoutes);
// app.use("/v1/partner", partnerRoutes);

// (async () => {
//   try {
//     await sequelize.authenticate();
//     // initAssociations();
//     await sequelize.sync({ alter: false });
//     initAssociations();
//     //await runOptionsCreation();

//     app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
//   } catch (e) {
//     console.error("DB init error:", e);
//     process.exit(1);
//   }
// })();
const express = require("express");
const sequelize = require("./config/db");
const cors = require("cors");
require("dotenv").config();

const publisherRoutes = require("./routes/publisherRoutes");
const partnerRoutes = require("./routes/partnerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { runOptionsCreation } = require("./script/OptionModify");
const { initAssociations } = require("./models/Associations");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:3001",
  "http://192.168.1.247:3001", // if you open the panel via IP
  // add your production domain later, e.g. "https://panel.pubmighty.com"
];

const corsOptions = {
  origin(origin, callback) {
    // Allow tools like Postman / curl (no origin)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true); // will set Access-Control-Allow-Origin to that origin
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true, // allow cookies / sessions
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    // Just send 204 No Content with CORS headers already set by cors()
    return res.sendStatus(204);
  }
  next();
});

app.set("trust proxy", 1);
app.use(express.static("public"));
app.use(express.json({ limit: "3mb" }));

app.use("/v1/admin", adminRoutes);
app.use("/v1/publisher", publisherRoutes);
app.use("/v1/partner", partnerRoutes);

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: false });

    initAssociations();
    // await runOptionsCreation(); // enable only when you actually need it

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (e) {
    console.error("DB init error:", e);
    process.exit(1);
  }
})();
