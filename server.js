require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");
const apicache = require("apicache");

// Local imports
const nbaRoutes = require("./routes/nba");
const dbRoutes = require("./routes/db");
const youtubeRoutes = require("./routes/youtube");
const f1Routes = require("./routes/f1");
const fantasyRoutes = require("./routes/fantasy");
const galleryRoutes = require("./routes/gallery");
const medJournalRoutes = require("./routes/med-journal");
const feedbackRoutes = require("./routes/feedback");
const chatgptRoutes = require("./routes/chat-gpt");
const calendarRoutes = require("./routes/calendar");
const vitalsRoutes = require("./routes/vitals");

const app = express();
const port = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(
  // apply CORS to my actually deployed website
  cors({
    origin: [
      "https://paulsumido.com",
      "https://develop.paulsumido.com",
      "http://localhost:3000",
    ],
  }),
);

// Performance middleware
app.use(compression());

// Caching middleware
const cache = apicache.middleware;
const oneHourCache = cache("1 hour");

// Apply 1-hour cache to specific API routes
app.use("/api/nba", oneHourCache);
app.use("/api/f1", oneHourCache);
app.use("/api/fantasy", oneHourCache);

// Request parsing middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Logging middleware
app.use(morgan("dev"));

// Routes
app.use("/api/nba", nbaRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/f1", f1Routes);
app.use("/api/fantasy", fantasyRoutes);
app.use("/api/gallery", galleryRoutes);
app.use("/api/med-journal", medJournalRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/chatgpt", chatgptRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/vitals", vitalsRoutes);
app.use("/api", dbRoutes);

// Error handling middleware
app.use((err, req, res, _next) => {
  if (err.status === 401 || err.name === "UnauthorizedError") {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing token",
    });
  }
  console.error("Unhandled error:", {
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Start server
app.listen(port, () => {
  console.log(
    `Server running on port ${port} [${process.env.NODE_ENV || "development"}]`,
  );
});
