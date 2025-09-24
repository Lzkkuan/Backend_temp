import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app: Application = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Health-check only
app.get("/health-check", (_req: Request, res: Response) => {
  res.status(200).json({ status: "success", message: "OK" });
});

export default app;
