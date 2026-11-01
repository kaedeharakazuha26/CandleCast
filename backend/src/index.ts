import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { Server } from "socket.io";
import { config } from "./config.js";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { attachMarketStream } from "./websocket/marketStream.js";
import { startAlertMonitor } from "./services/alerts.js";
import { openApiSpec } from "./utils/openapi.js";
import { prisma } from "./database/prisma.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: config.frontendOrigin.split(","),
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use("/api", router);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.frontendOrigin.split(","), credentials: true },
});
attachMarketStream(io);
const stopAlertMonitor = startAlertMonitor(io);

server.listen(config.port, () => {
  console.log(`API listening on ${config.port}`);
});

async function shutdown() {
  stopAlertMonitor();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
