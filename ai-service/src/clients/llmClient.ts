import axios from "axios";
import * as https from "node:https";

// ---------- Env & defaults ----------
const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? "RULES").toUpperCase(); // "HUGGINGFACE" | "RULES"
const HF_TOKEN = process.env.HF_TOKEN?.trim();
const HF_MODEL = process.env.HF_MODEL?.trim() || "Qwen/Qwen2.5-7B-Instruct";
const TIMEOUT_MS = Math.max(2000, Number(process.env.AI_HTTP_TIMEOUT ?? 20000));
const MAX_RETRIES = Math.max(0, Number(process.env.AI_MAX_RETRIES ?? 3));
const RETRY_BASE_MS = Math.max(100, Number(process.env.AI_RETRY_BASE_MS ?? 400));

export type Provider = "HUGGINGFACE" | "RULES";
export const provider: Provider =
  LLM_PROVIDER === "HUGGINGFACE" && HF_TOKEN ? "HUGGINGFACE" : "RULES";

// ---- Axios client tuned for Windows/Proxies/IPv4 ----
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  // Some Windows/ISP setups flake on IPv6/ALPN; keep things boring
  rejectUnauthorized: true,
});

const api = axios.create({
  baseURL: "https://api-inference.huggingface.co",
  timeout: TIMEOUT_MS,
  headers: {
    Authorization: `Bearer ${HF_TOKEN ?? ""}`,
    "Content-Type": "application/json",
    // Avoid certain caches that sometimes mess with chunked responses
    "x-use-cache": "false",
  },
  httpsAgent,
  // Never stream; always return a JSON body
  responseType: "json",
  transitional: { clarifyTimeoutError: true },
});

/**
 * getGuidanceLLM — stable NON-STREAMING call via REST (Axios)
 * Hits: POST /models/{MODEL}?wait_for_model=true
 */
export async function getGuidanceLLM(userText: string): Promise<string> {
  if (provider !== "HUGGINGFACE" || !HF_TOKEN) {
    throw new Error("HF not configured (provider not HUGGINGFACE or HF_TOKEN missing).");
  }

  const system =
    "You are SoulSeed, a warm, concise mental-health coach for teens. " +
    "Respond in one short paragraph: validate feelings, suggest one doable next step, " +
    "and end with a gentle question. Avoid medical/diagnostic language.";

  const prompt = `${system}\n\nUser: ${userText}\n\nAssistant:`;

  const body = {
    inputs: prompt,
    parameters: {
      max_new_tokens: 220,
      temperature: 0.6,
      top_p: 0.95,
      repetition_penalty: 1.1,
      return_full_text: false,
    },
    options: {
      wait_for_model: true,
      use_cache: false,
    },
  };

  const url = `/models/${encodeURIComponent(HF_MODEL)}?wait_for_model=true`;
  const text = await callWithRetry(url, body);
  return normalizeOneLine(text);
}

async function callWithRetry(url: string, body: any): Promise<string> {
  let attempt = 0;
  let lastErr: any;

  while (attempt <= MAX_RETRIES) {
    try {
      const res = await api.post(url, body);
      // HF serverless may return array or object; normalize both
      const data = res.data;
      const text: string =
        Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
      if (!text || typeof text !== "string") {
        throw new Error("Empty generated_text from HF response");
      }
      return text.trim();
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      const msg = String(e?.message || e);

      // Classify
      const isAuth = status === 401 || status === 403 || /invalid credentials/i.test(msg);
      const isNotFound = status === 404 || /not found/i.test(msg);
      const isRate = status === 429 || /rate/i.test(msg);
      const isServer = status && status >= 500 && status <= 599;
      const isNet =
        /ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|socket|TLS|certificate|fetch|blob/i.test(msg);

      if (isAuth) throw new Error("HF auth failed (check HF_TOKEN or accept model license).");
      if (isNotFound) throw new Error(`HF model not found/unavailable: "${HF_MODEL}".`);

      const shouldRetry = isRate || isServer || isNet;
      if (!shouldRetry || attempt === MAX_RETRIES) {
        const hint = isRate
          ? "HF rate-limited."
          : isServer
          ? "HF server error."
          : isNet
          ? "Network/SSL transport error."
          : `HF error (status ${status ?? "n/a"}).`;
        throw new Error(`${hint} Underlying: ${msg}`);
      }

      // exponential backoff + jitter
      const wait = Math.round(RETRY_BASE_MS * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5));
      if (attempt === 0) {
        console.warn(`[llmClient] HF REST transient error, retrying... (status ${status ?? "n/a"}; ${msg})`);
      }
      await sleep(wait);
      attempt += 1;
    }
  }
  throw lastErr ?? new Error("Unknown HF error");
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ---------- Utils ----------
function normalizeOneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").replace(/^[*\-•]\s*/g, "").trim();
}
