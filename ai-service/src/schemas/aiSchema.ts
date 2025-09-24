import { z } from "zod";

export const UnpackSchema = z.object({
  text: z.string().min(1).max(4000),
  context: z.object({ mode: z.enum(["journal", "prompt"]).optional() }).optional(),
});

export type UnpackInput = z.infer<typeof UnpackSchema>;
