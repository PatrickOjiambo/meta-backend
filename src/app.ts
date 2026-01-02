import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import WasmRouter from "./routes/wasm.js";
import type MessageResponse from "./interfaces/message-response.js";

import api from "./api/index.js";
import * as middlewares from "./middlewares.js";

const app = express();

app.use(morgan("dev"));
app.use(helmet());
app.use(cors());
app.use(express.json({limit: '20mb'}));
app.use(express.urlencoded({limit: '20mb'}));
// Trust proxy for rate limiting behind reverse proxies
app.set("trust proxy", 1);

app.get("/", (req, res) => {
  res.json({
    message: "🏆 Casper Prize Vault API",
    version: "1.0.0",
    docs: "/api/v1",
  });
});

app.use("/api/v1", api);
app.use("/", WasmRouter);
app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

export default app;
