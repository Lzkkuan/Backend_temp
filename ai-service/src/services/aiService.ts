// user-service/src/services/aiService.ts
import { chatCompletionJSON } from "../clients/llmClient";

// -------------------- Types -----------------------
export type Mood = 1 | 2 | 3 | 4 | 5;

export type UnpackResult = {
  summary: string;
  signals: { mood: Mood; stressors: string[]; risk_flags: string[] };
  suggestions: string[];
  questions: string[];
};

// ------------------ Utils -------------------------
function clampMood(x: number): Mood {
  return Math.max(1, Math.min(5, Math.round(x))) as Mood;
}
function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
function pick<T>(arr: T[], n: number): T[] {
  const out: T[] = [];
  for (const x of arr) { if (out.length >= n) break; if (!out.includes(x)) out.push(x); }
  return out;
}

// --------------- Rules-based analyzer -------------
function analyze(text: string): {
  mood: Mood; stressors: string[]; risk_flags: string[]; summary: string;
} {
  const t = text.toLowerCase();

  const positive = ["happy","good","excited","calm","relaxed","joy","glad","okay","ok","proud"];
  const negative = ["sad","down","nervous","anxious","stressed","angry","tired","lonely","overwhelmed","depressed","bad","worried"];

  const stressorMap: Record<string,string> = {
    exam: "exams", exams: "exams", test: "exams", tests: "exams", study: "exams", studying: "exams",
    friend: "friends", friends: "friends", cca: "friends", teammate: "friends",
    sleep: "sleep", tired: "sleep", insomnia: "sleep", nap: "sleep",
    family: "family", parent: "family", parents: "family", mum: "family", mom: "family", dad: "family",
    teacher: "school", school: "school", hw: "school", homework: "school", assignment: "school", project: "school",
    bully: "bullying", bullying: "bullying"
  };

  const riskPhrases = [
    "kill myself","suicide","self-harm","self harm","cut myself","end my life","want to die","hurt myself"
  ];

  const posHits = positive.filter(w => t.includes(w)).length;
  const negHits = negative.filter(w => t.includes(w)).length;
  const mood = clampMood(3 + posHits - negHits);

  const stressors = new Set<string>();
  Object.keys(stressorMap).forEach(k => { if (t.includes(k)) stressors.add(stressorMap[k]); });

  const risk_flags: string[] = [];
  if (riskPhrases.some(p => t.includes(p))) risk_flags.push("self-harm");

  const summary = risk_flags.length
    ? "Text shows distress signals; consider gentle check-in."
    : (mood >= 4 ? "Generally positive mood." : mood <= 2 ? "Low mood signs present." : "Neutral mood overall.");

  return { mood, stressors: Array.from(stressors), risk_flags, summary };
}

// ---------------- Question bank -------------------
const QB = {
  generalOpeners: [
    "What was the hardest part about today?",
    "When did you feel it most strongly?",
    "What helped even a little bit?",
    "If this feeling could talk, what would it say?",
  ],
  exams: [
    "What part of studying feels most stressful right now?",
    "Would breaking tasks into tiny steps help? Which step could be first?",
    "Who could you study with for a short session?",
  ],
  friends: [
    "How did time with your friends affect how you felt?",
    "Is there someone you feel safe sharing this with?",
  ],
  sleep: [
    "What usually makes it easier to fall asleep for you?",
    "Would a short wind-down routine help tonight?",
  ],
  family: [
    "Is there anything at home that made this tougher or easier?",
    "What kind of support would feel helpful from family?",
  ],
  school: [
    "Which school task is taking the most energy right now?",
    "Would a 20-minute focus block help to get started?",
  ],
  bullying: [
    "Have you been feeling unsafe around anyone?",
    "Who is a trusted adult you could talk to about this?",
  ],
  lowMood: [
    "What is one small thing that might make today 1% better?",
    "When did you last feel a bit lighter? What was different then?",
  ],
  neutral: [
    "What would you like more of this week?",
    "Is there a small action that could keep things steady?",
  ],
  positive: [
    "What went well that you’d like to repeat?",
    "Who or what gave you energy today?",
  ],
  safety: [
    "Thanks for sharing this. Do you feel safe right now?",
    "Would you like help finding someone to talk to?",
  ],
};

function buildQuestions(mood: Mood, stressors: string[], risk_flags: string[]): string[] {
  const q: string[] = [];
  if (risk_flags.includes("self-harm")) q.push(...QB.safety);
  for (const s of stressors) if ((QB as any)[s]) q.push(...(QB as any)[s]);
  if (mood <= 2) q.push(...QB.lowMood);
  else if (mood >= 4) q.push(...QB.positive);
  else q.push(...QB.neutral);
  q.push(...QB.generalOpeners);
  return pick(uniq(q), 5);
}

function buildSuggestions(stressors: string[]): string[] {
  const s: string[] = [];
  if (stressors.includes("exams")) s.push("Try short study blocks with 5-minute breaks");
  if (stressors.includes("friends")) s.push("Spend a few minutes with someone supportive");
  if (stressors.includes("sleep")) s.push("Try a simple wind-down (dim lights, no phone for 20 mins)");
  if (stressors.includes("school")) s.push("Break tasks into one tiny, concrete next step");
  if (!s.length) s.push("Take a short walk and breathe slowly for 1 minute");
  return pick(uniq(s), 3);
}

export async function unpackRules(text: string): Promise<UnpackResult> {
  const a = analyze(text);
  return {
    summary: a.summary,
    signals: { mood: a.mood, stressors: a.stressors, risk_flags: a.risk_flags },
    suggestions: buildSuggestions(a.stressors),
    questions: buildQuestions(a.mood, a.stressors, a.risk_flags),
  };
}

// --------------- HF integration -------------------
const SYSTEM_PROMPT = `
You analyze a Singapore teen's short text and return ONLY a JSON object with this exact shape:

{
  "summary": string,
  "signals": { "mood": 1|2|3|4|5, "stressors": string[], "risk_flags": string[] },
  "suggestions": string[],
  "questions": string[]
}

Rules:
- Mood: 1 very low … 3 neutral … 5 very positive.
- Stressors from: ["exams","friends","family","sleep","school","bullying"] if relevant.
- Risk flags: ["self-harm"] only if explicit signals appear; else [].
- Suggestions: 1–3 short, supportive, non-clinical ideas.
- Questions: 3–5 open-ended, blame-free follow-ups.
- Keep it concise, neutral, judgment-free. No diagnoses.
- Output JSON only, no markdown or commentary.
`;

function buildUserPrompt(text: string): string {
  return `Text:
"""${text}"""
Return ONLY the JSON object.`;
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return s.slice(start, end + 1);
  return s;
}

function asStringArray(x: unknown): string[] {
  if (Array.isArray(x)) return x.map(String).filter(s => s.trim().length > 0);
  if (typeof x === "string") return x.trim() ? [x.trim()] : [];
  return [];
}
function asMood(x: unknown): Mood {
  const n = Number(x);
  if (Number.isFinite(n)) return Math.max(1, Math.min(5, Math.round(n))) as Mood;
  return 3;
}
function normalize(obj: any): UnpackResult {
  const summary = typeof obj?.summary === "string" && obj.summary.trim() ? obj.summary.trim()
                  : "Neutral mood overall.";
  const signals = obj?.signals ?? {};
  const stressors = asStringArray(signals.stressors);
  const risk_flags = asStringArray(signals.risk_flags);
  const mood = asMood(signals.mood);

  const suggestions = asStringArray(obj?.suggestions).slice(0, 3);
  const questions = asStringArray(obj?.questions).slice(0, 5);

  return {
    summary,
    signals: { mood, stressors, risk_flags },
    suggestions: suggestions.length ? suggestions : ["Take a short walk and breathe slowly for 1 minute"],
    questions: questions.length ? questions : [
      "What was the hardest part about today?",
      "When did you feel it most strongly?",
      "What helped even a little bit?",
    ],
  };
}

async function unpackHf(text: string): Promise<UnpackResult> {
  if (!process.env.HF_TOKEN) return unpackRules(text);

  const content = await chatCompletionJSON({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(text) },
    ],
    temperature: 0.2,
    model: process.env.HF_MODEL || "HuggingFaceTB/SmolLM3-3B",
    max_tokens: 350,
  });

  const json = extractJson(content);
  try {
    const parsed = JSON.parse(json);
    return normalize(parsed);
  } catch (e) {
    console.error("[LLM] HF JSON parse failed:", e);
    return unpackRules(text);
  }
}

// --------------- Provider switch ------------------
export async function unpack(text: string): Promise<UnpackResult> {
  const provider = (process.env.LLM_PROVIDER ?? "RULES").toUpperCase();
  console.log("[LLM] provider:", provider);

  switch (provider) {
    case "HUGGINGFACE":
      try {
        console.log("[LLM] calling HF model:", process.env.HF_MODEL ?? "HuggingFaceTB/SmolLM3-3B");
        return await unpackHf(text);
      } catch (e: any) {
        console.error("[LLM] HF failed:", e?.message ?? e);
        return unpackRules(text);
      }
    case "RULES":
    default:
      return unpackRules(text);
  }
}
