import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed assets (JS/CSS) — cache aggressively. index.html — never cache,
  // so browsers always fetch the latest filename references.
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  // Exclude OPTIONS so CORS preflight is never swallowed by the SPA catch-all
  app.use("/{*path}", (req, res) => {
    if (req.method === "OPTIONS") {
      // Let CORS middleware (registered earlier) handle it
      res.sendStatus(204);
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
