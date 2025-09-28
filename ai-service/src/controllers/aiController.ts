import type { Request, Response } from "express";
import { UnpackSchema, type UnpackInput } from "../schemas/aiSchema";
import { unpack } from "../services/aiService";

export async function unpackHandler(req: Request, res: Response) {
  console.log("[/api/ai/unpack] body:", req.body);
  const parsed = UnpackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid body", issues: parsed.error.issues });
  }
  const { text, context } = parsed.data as UnpackInput;

  try {
    const result = await unpack(text, context);
    return res.status(200).json({ result });
  } catch (err: any) {
    const msg = String(err?.message || err);
    console.warn("[/api/ai/unpack] rules engine failed:", msg);
    return res.status(500).json({ message: "Internal error" });
  }
}
