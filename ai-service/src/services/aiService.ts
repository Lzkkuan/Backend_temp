// ai-service/src/services/aiService.ts
import type { Request } from "express";
import { getGuidanceLLM } from "../clients/llmClient";

/**
 * Public result type (backward compatible: `guidance` kept)
 */
export type UnpackResult = {
  guidance: string;
  summary: string;
  signals: {
    mood: string;              // e.g., "anxious", "overwhelmed", "low", "frustrated", "tired", "neutral"
    stressors: string[];       // e.g., ["exams","deadlines","workload"]
    risk_flags: string[];      // e.g., ["self_harm_terms_detected"]
  };
  suggestions: string[];       // 2–4 small steps
};

export async function health(): Promise<{ ok: true; from: "aiService" }> {
  return { ok: true, from: "aiService" };
}

export async function unpack(
  text: string,
  context?: { mode?: "journal" | "prompt" }
): Promise<UnpackResult> {
  const raw0 = (text ?? "").replace(/\s+/g, " ").trim();

  // Long-input handling: compress first to a couple of key phrases
  const raw = raw0.length > 500 ? compressLongInput(raw0) : raw0;
  const lc = raw.toLowerCase();

  // --------- lightweight NLP-ish extraction ----------
  const stressorLex = [
    "exam","exams","test","tests","deadline","deadlines","assignment","assignments","project","projects",
    "workload","homework","sleep","insomnia","fatigue","family","relationship","friend","team","group",
    "money","finance","health","presentation","interview","coding","bug","debug","grade","grades","gpa","thesis"
  ];
  const stressors = uniq(
    stressorLex.filter(k => lc.includes(k)).map(normalizeStressor)
  );

  const mood = detectMood(lc);
  const risk_flags = detectRisk(lc);

  // --------- summary (one-line) ----------
  const summary = buildSummary(raw, stressors, mood);

  // --------- supportive suggestions ----------
  const seed = hash32(lc || "empty");
  const pick = <T>(arr: T[], salt = 0) => arr[(seed + salt) % Math.max(1, arr.length)];

  const baseSteps = [
    "Break one task into a 10-minute starter step and do just that.",
    "Write a 3-item do-next list and highlight the first item only.",
    "Set a 15-minute timer, silence notifications, and begin.",
    "Do a 5-minute brain dump to clear your head, then choose one item.",
    "Stand up, drink water, and take 10 slow breaths to reset.",
    "Ask a classmate/teammate one specific question you’ve been stuck on.",
    "Plan a 20-minute review block tonight and a 20-minute block tomorrow.",
    "Move the toughest task to your peak-focus hour and calendar it."
  ];
  const sleepSteps = [
    "Try a short wind-down: dim lights, no screens for 20 minutes, and breathe slowly.",
    "Prepare for sleep: list tomorrow’s top 1–2 tasks so your mind can let go.",
  ];
  const examSteps = [
    "Do one timed practice (10–15 minutes) on a single weak topic.",
    "Create a tiny formula/ideas sheet and review it aloud once.",
  ];
  const teamSteps = [
    "Post a quick update in your group chat with your next concrete step.",
    "Ask for a 10-minute sync to align on priorities and responsibilities.",
  ];

  const chosen: string[] = [];
  if (hasAny(stressors, ["sleep"])) chosen.push(pick(sleepSteps));
  if (hasAny(stressors, ["exam","exams","test","tests"])) chosen.push(pick(examSteps));
  if (hasAny(stressors, ["team","group","project","projects","presentation"])) chosen.push(pick(teamSteps));
  chosen.push(pick(baseSteps));
  chosen.push(pick(rotated(baseSteps, seed >> 3)));
  const suggestions = uniq(chosen).slice(0, 3);

  // --------- guidance from OpenRouter ----------
  let guidance: string;
  try {
    guidance = await getGuidanceLLM(raw);
  } catch (e) {
    console.warn("[unpack] OpenRouter failed, falling back to static guidance:", e);
    guidance =
      "I hear you—it makes sense you feel this way. Try one small step forward, and ask yourself what might ease the pressure right now.";
  }

  return {
    guidance,
    summary,
    signals: { mood, stressors, risk_flags },
    suggestions,
  };
}

// ---------------- Helpers ----------------

function normalizeStressor(s: string): string {
  const map: Record<string,string> = {
    exams: "exams", exam: "exams", tests: "exams", test: "exams",
    deadlines: "deadlines", deadline: "deadlines",
    assignments: "assignments", assignment: "assignments",
    projects: "projects", project: "projects",
    team: "team", group: "team",
    bug: "coding", debug: "coding", coding: "coding",
    grade: "grades", grades: "grades", gpa: "grades"
  };
  return map[s] ?? s;
}

function detectMood(lc: string): string {
  const rules: Array<[string[], string]> = [
    [["overwhelm","overwhelmed","stressed","stress","panic","anxious","worry","worried","pressure"], "overwhelmed"],
    [["tired","exhausted","fatigue","drained","sleepy","insomnia"], "tired"],
    [["sad","down","low","depressed","hopeless"], "low"],
    [["angry","frustrated","annoyed","irritated"], "frustrated"],
  ];
  for (const [keys, label] of rules) {
    if (keys.some(k => lc.includes(k))) return label;
  }
  return "neutral";
}

function detectRisk(lc: string): string[] {
  const crisisTerms = [
    "suicide","kill myself","end my life","self-harm","self harm","cut myself","harm myself","want to die",
    "no reason to live","hopeless","worthless"
  ];
  const found = crisisTerms.filter(k => lc.includes(k));
  return found.length ? ["self_harm_terms_detected"] : [];
}

function buildSummary(raw: string, stressors: string[], mood: string): string {
  const base = raw.length > 140 ? raw.slice(0, 140).replace(/\s+\S*$/, "") + "…" : raw;
  if (!base) return "User shared feelings and context.";
  const label = stressors.length ? `(${mood}; ${stressors.slice(0,3).join(", ")})` : `(${mood})`;
  return `${base} ${label}`.trim();
}

function compressLongInput(src: string): string {
  const trimmed = src.slice(0, 800);
  const sentences = trimmed.split(/(?<=[.!?])\s+/).slice(0, 5);
  const scored = sentences
    .map(s => ({ s, score: scoreSentence(s) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 2)
    .map(x => x.s.trim());
  const out = scored.join(" ");
  return out.length > 250 ? out.slice(0, 250).replace(/\s+\S*$/, "") + "…" : out;
}

function scoreSentence(s: string): number {
  const ws = s.split(/\s+/).filter(Boolean);
  const nounish = ws.filter(w => /^[A-Za-z]{4,}$/.test(w)).length;
  return Math.sqrt(ws.length) + nounish * 0.2;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
function hasAny(hay: string[], needles: string[]): boolean {
  return needles.some(n => hay.includes(n));
}
function rotated<T>(arr: T[], by: number): T[] {
  const n = arr.length || 1;
  const k = ((by % n) + n) % n;
  return arr.slice(k).concat(arr.slice(0, k));
}
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
