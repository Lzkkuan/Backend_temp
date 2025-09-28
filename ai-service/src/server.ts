import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import aiRoutes from "./routes/aiRoutes";
import { provider as LLM_PROVIDER } from "./clients/llmClient";
console.log(
  `[aiService] provider=${LLM_PROVIDER} HF_MODEL=${process.env.HF_MODEL ?? "(unset)"} HF_TOKEN=${process.env.HF_TOKEN ? "present" : "missing"}`
);


const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/ai", aiRoutes);

app.get("/health-check", (_req: Request, res: Response) => {
  res.status(200).json({ status: "success", message: "OK" });
});

const port = process.env.PORT || 3002;
app.listen(port, () => console.log(`AI service running on port ${port}`));
