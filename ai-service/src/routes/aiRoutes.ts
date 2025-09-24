import { Router } from "express";
import { unpackHandler } from "../controllers/aiController";

const router = Router();
router.get("/ping", (_req, res) => res.status(200).json({ ok: true, from: "aiRoutes" }));
router.post("/unpack", unpackHandler);
export default router;
