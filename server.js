require("dotenv").config();
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5173;
const API_URL = process.env.API_URL || "http://localhost:3000";

console.log(`Proxying API requests to: ${API_URL}`);

// 1. Proxy FIRST — before static files
app.use(
  "/auth",
  createProxyMiddleware({
    target: API_URL,
    changeOrigin: true,
    pathRewrite: { "^/": "/auth/" }, // preserve /auth prefix
    on: {
      proxyReq: (proxyReq, req) => {
        console.log(`[PROXY /auth] ${req.method} ${req.url}`);
      },
      error: (err, req, res) => {
        console.error("[PROXY ERROR]", err.message);
        res.status(502).json({ status: "error", message: "Backend unavailable" });
      },
    },
  })
);

app.use(
  "/api",
  createProxyMiddleware({
    target: API_URL,
    changeOrigin: true,
    pathRewrite: { "^/": "/api/" }, //  preserve /api prefix
    on: {
      proxyReq: (proxyReq, req) => {
        console.log(`[PROXY /api] ${req.method} ${req.url}`);
      },
      error: (err, req, res) => {
        console.error("[PROXY ERROR]", err.message);
        res.status(502).json({ status: "error", message: "Backend unavailable" });
      },
    },
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

//SPA fallback
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Web portal: http://localhost:${PORT}`);
});