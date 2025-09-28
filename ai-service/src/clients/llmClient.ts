import axios from "axios";
import * as https from "node:https";

// ---------- Env & defaults ----------
const OR_TOKEN = process.env.OPENROUTER_API_KEY?.trim();
const OR_MODEL = process.env.OPENROUTER_MODEL?.trim() || "deepseek/deepseek-r1-0528:free";
const TIMEOUT_MS = Math.max(2000, Number(process.env.AI_HTTP_TIMEOUT ?? 20000));

// ---- Axios client ----
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  rejectUnauthorized: true,
});

const api = axios.create({
  baseURL: "https://openrouter.ai/api/v1",
  timeout: TIMEOUT_MS,
  headers: {
    Authorization: `Bearer ${OR_TOKEN ?? ""}`,
    "Content-Type": "application/json",
  },
  httpsAgent,
  responseType: "json",
  transitional: { clarifyTimeoutError: true },
});

/**
 * getGuidanceLLM — call OpenRouter chat/completions
 */
export async function getGuidanceLLM(userText: string): Promise<string> {
  if (!OR_TOKEN) {
    throw new Error("OpenRouter not configured (OPENROUTER_API_KEY missing).");
  }

  const system =
    "You are SoulSeed, a warm, concise mental-health coach for teens. " +
    "Respond in one short paragraph: validate feelings, suggest one doable next step, " +
    "and end with a gentle question. Avoid medical/diagnostic language.";

  const body = {
    model: OR_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
  };

  const res = await api.post("/chat/completions", body);
  const choice = res.data?.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    console.error("[llmClient] Bad response from OpenRouter:", JSON.stringify(res.data, null, 2));
    throw new Error("Empty response from OpenRouter");
  }

  return normalizeOneLine(text);
}

// ---------- Utils ----------
function normalizeOneLine(s: string): string {
  return s
    .replace(/^<s>\s*/i, "")       // remove leading <s>
    .replace(/^\[OUT\]\s*/i, "")   // remove leading [OUT]
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[*\-•]\s*/g, "")
    .trim();
}

