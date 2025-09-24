// user-service/src/clients/llmClient.ts
import { HfInference } from "@huggingface/inference";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function getHf() {
  return new HfInference(process.env.HF_TOKEN);
}

/**
 * Minimal wrapper around HF chatCompletion.
 * Returns assistant text (string). We do JSON extraction/parse in the service.
 */
export async function chatCompletionJSON(opts: {
  messages: ChatMessage[];
  temperature?: number;
  model?: string;     // optional override; falls back to env or a safe default
  max_tokens?: number;
}): Promise<string> {
  const hf = getHf();
  const model = opts.model ?? process.env.HF_MODEL ?? "HuggingFaceTB/SmolLM3-3B";

  // Use the SDK so we avoid brittle raw endpoints (the 404s you saw)
  const completion: any = await hf.chatCompletion({
    model,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.max_tokens ?? 300,
    // TS note: the SDK has its own message type; casting keeps our code simple
    messages: opts.messages as any,
  } as any);

  const choice = completion?.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    // Items are often { type: "text", text: string }
    return content
      .map((c: any) => (typeof c === "string" ? c : typeof c?.text === "string" ? c.text : ""))
      .join("");
  }

  return "";
}
