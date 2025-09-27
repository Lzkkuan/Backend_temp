import { Router, Request, Response } from "express";
import { unpackHandler } from "../controllers/aiController";

const router = Router();

// Simple health/debug route
router.get("/ping", (_req: Request, res: Response) => {
  console.log("➡️  /api/ai/ping hit");
  res.status(200).json({ ok: true, from: "aiRoutes" });
});

// Root route just to confirm wiring
router.get("/", (_req: Request, res: Response) => {
  console.log("➡️  /api/ai/ root hit");
  res.json({ message: "AI service is alive. Try POST /api/ai/unpack" });
});

// Actual business route
router.post("/unpack", (req: Request, res: Response, next) => {
  console.log("➡️  /api/ai/unpack hit with body:", req.body);
  next();
}, unpackHandler);

export default router;
