// @ts-check
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { createGameServer } from "./game-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.join(__dirname, "..", "build");

const app = express();

app.use(
  "/assets",
  express.static(path.join(BUILD_DIR, "client", "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);

app.use(
  express.static(path.join(BUILD_DIR, "client"), {
    maxAge: "1h",
  }),
);

app.all(
  "*",
  createRequestHandler({
    build: () =>
      import(pathToFileURL(path.join(BUILD_DIR, "server/index.js")).href),
    mode: process.env.NODE_ENV,
  }),
);

const server = http.createServer(app);
createGameServer(server, { path: "/ws" });

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`HTTP + WebSocket server listening on http://localhost:${port}`);
});
