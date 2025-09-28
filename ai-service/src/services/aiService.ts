/**
 * aiService.ts — Guidance-only service (keeps the name `unpack`)
 *
 * Public API:
 *    export async function unpack(text: string): Promise<{ guidance: string }>
 *
 * Behavior:
 *   1) If OPENAI_API_KEY is set → uses OpenAI chat
 *   2) Else if HF_TOKEN is set → uses Hugging Face Inference
 *   3) Else → rule-based fallback
 *
 * Env (optional):
 *   - OPENAI_API_KEY
 *   - OPENAI_MODEL (default: gpt-4o-mini)
 *   - HF_TOKEN
 *   - HF_MODEL (default: mistralai/Mixtral-8x7B-Instruct-v0.1)
 *   - AI_USE_LLM = "false" to force rules-only
 *   - AI_HTTP_TIMEOUT (ms, default 20000)
 */

export type GuidanceResult = { guidance: string };

// feature flag: set AI_USE_LLM=false to force rules-only during tests
const USE_LLM = (process.env.AI_USE_LLM ?? "true").toLowerCase() !== "false";

// --- Public API -------------------------------------------------------------

export async function unpack(text: string): Promise<GuidanceResult> {
  const cleaned = (text ?? "").toString().trim();
  if (!cleaned) {
    return {
      guidance:
        "Thanks for sharing. Let’s start small: take three slow breaths, then pick the easiest next step and set a 5-minute timer. What’s one tiny thing you’d be okay trying right now?",
    };
  }

  if (USE_LLM) {
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (openaiKey) {
      try {
        const g = await generateGuidanceOpenAI(cleaned, openaiKey);
        if (g) return { guidance: g };
      } catch (err) {
        console.warn("[aiService] OpenAI failed, falling back:", (err as Error)?.message);
      }
    }

    const hfToken = process.env.HF_TOKEN?.trim();
    const hfModel = process.env.HF_MODEL?.trim();
    if (hfToken) {
      try {
        const g = await generateGuidanceHF(cleaned, hfToken, hfModel);
        if (g) return { guidance: g };
      } catch (err) {
        console.warn("[aiService] HF failed, falling back:", (err as Error)?.message);
      }
    }
  }

  // Always have a helpful answer
  return { guidance: buildGuidanceFallback(cleaned) };
}

// simple health helper if your /ping uses it elsewhere
export async function health(): Promise<{ ok: true; from: "aiService" }> {
  return { ok: true, from: "aiService" };
}

// --- Providers --------------------------------------------------------------

async function generateGuidanceOpenAI(text: string, apiKey: string): Promise<string> {
  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.6,
    max_tokens: 140,
    messages: [
      {
        role: "system",
        content:
          "You are a concise, supportive counselor for Singapore teens. Respond with EXACTLY ONE empathetic message (55–85 words). Start with brief validation in plain language, include ONE tiny actionable step, and end with ONE short reflective question. Avoid diagnoses, disclaimers, quotations, lists, or markdown. Output only the message.",
      },
      {
        role: "user",
        content: `User text:\n"""${text}"""\n\nNow produce the single message.`,
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.AI_HTTP_TIMEOUT ?? 20000)),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status} ${res.statusText}: ${await safeRead(res)}`);
  const json: any = await res.json();
  const out = (json?.choices?.[0]?.message?.content ?? "").toString().trim();
  return normalizeOneLine(out);
}

async function generateGuidanceHF(text: string, token: string, modelOverride?: string): Promise<string> {
  const model = modelOverride || process.env.HF_DEFAULT_MODEL || "mistralai/Mixtral-8x7B-Instruct-v0.1";

  const prompt =
    `System: You are a concise, supportive counselor for Singapore teens. ` +
    `Respond with EXACTLY ONE empathetic message (55–85 words). Start with brief validation, ` +
    `include ONE tiny actionable step, and end with ONE short reflective question. ` +
    `Avoid diagnoses, disclaimers, quotations, lists, or markdown.\n\n` +
    `User: ${text}\nAssistant:`;

  const res = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: 140, temperature: 0.6, return_full_text: false },
    }),
    signal: AbortSignal.timeout(Number(process.env.AI_HTTP_TIMEOUT ?? 20000)),
  });

  if (!res.ok) throw new Error(`HF ${res.status} ${res.statusText}: ${await safeRead(res)}`);
  const json: any = await res.json();
  const out =
    Array.isArray(json) ? (json[0]?.generated_text ?? "") : (json?.generated_text ?? json?.choices?.[0]?.text ?? "");
  return normalizeOneLine((out ?? "").toString().trim());
}

// --- Fallback ---------------------------------------------------------------

function buildGuidanceFallback(text: string): string {
  const lower = text.toLowerCase();
  const themes: string[] = [];
  if (/\bexam|test|school|assignment|study|deadline/.test(lower)) themes.push("schoolwork");
  if (/\bfamily|parents|mum|dad/.test(lower)) themes.push("family");
  if (/\bfriend|classmate|bully|bullying/.test(lower)) themes.push("friends");
  if (/\bsleep|tired|exhausted|insomnia/.test(lower)) themes.push("sleep");
  const reflect =
    themes.length > 0
      ? `It sounds like ${themes.join(" and ")} has been weighing on you`
      : "It sounds like things have been heavy lately";

  const step =
    "Try two slow minutes of box-breathing (inhale 4, hold 4, exhale 4, hold 4), then pick the smallest next step and set a 10-minute timer.";
  const question = "What would make today feel even 1% easier for you?";

  return `${capitalize(reflect)}, and it makes sense you’re feeling stretched. ${step} ${question}`;
}

// --- Utilities --------------------------------------------------------------

function normalizeOneLine(s: string): string {
  return s
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[*\-•]\s*/g, "")
    .trim();
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

async function safeRead(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no-body>";
  }
}
