import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import aiRoutes from "./routes/aiRoutes";
console.log(
  `[aiService] provider=openrouter OR_MODEL=${process.env.OPENROUTER_MODEL ?? "(unset)"} OR_TOKEN=${process.env.OPENROUTER_API_KEY ? "present" : "missing"}`
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
