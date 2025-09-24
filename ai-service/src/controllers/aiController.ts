import type { Request, Response } from "express";
import { UnpackSchema, type UnpackInput } from "../schemas/aiSchema";
import { unpack } from "../services/aiService";

export async function unpackHandler(req: Request, res: Response) {
  console.log("[/api/ai/unpack] body:", req.body);
  const parsed = UnpackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid body", issues: parsed.error.issues });
  const { text } = parsed.data as UnpackInput;
  const result = await unpack(text);
  return res.status(200).json({ result });
}
