import type { RequestHandler } from "express";
import { z, type ZodType, type infer as ZInfer } from "zod";

export const validate =
  <S extends ZodType<any>>(schema: S): RequestHandler =>
  (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const tree = z.treeifyError(parsed.error);
      return res.status(400).json({
        message: "Invalid request body",
        errors: tree,
      });
    }
    req.validated = parsed.data as ZInfer<S>;
    next();
  };
