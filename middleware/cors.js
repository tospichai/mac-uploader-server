import cors from "cors";

/**
 * CORS configuration options
 */
const corsOptions = {
  origin: "*", // Allow frontend and server origins
  methods: ["GET", "PUT", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Cache-Control"],
  credentials: false, // Set to true if you need to handle credentials
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

/**
 * Custom CORS middleware with additional headers
 */
export function setupCors(app) {
  // Use the cors middleware with our options
  app.use(cors(corsOptions));

  // Additional CORS headers for compatibility
  app.use((req, res, next) => {
    // Debug logging for CORS requests
    console.log(
      `CORS Request: ${req.method} ${req.url} - Origin: ${req.headers.origin}`
    );

    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Cache-Control"
    );
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

    if (req.method === "OPTIONS") {
      console.log("CORS preflight request received");
      res.sendStatus(200);
    } else {
      next();
    }
  });
}

/**
 * CORS middleware for SSE endpoints (specific configuration)
 */
export function corsForSSE(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Cache-Control");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
}

export default cors(corsOptions);
