// ai-service/src/services/aiService.ts
import type { Request } from "express";

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

/**
 * Deterministic unpack (RULES engine), upgraded:
 * - No network calls.
 * - One supportive paragraph (`guidance`) + structured fields.
 * - Style profiles & paraphrases (deterministic but varied).
 * - Tiny mirroring for personalization.
 * - Anti-repetition LRU to avoid near-duplicate consecutive outputs.
 */
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

  // --------- deterministic seed & pickers ----------
  const seed = hash32(lc || "empty");
  const pick = <T>(arr: T[], salt = 0) => arr[(seed + salt) % Math.max(1, arr.length)];

  // --------- suggestion library (tiny, targeted) ----------
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

  // --------- style profiles & paraphrases (deterministic) ----------
  const STYLE_PROFILES: Array<{ order: Array<"opener"|"body"|"action"|"ask"|"crisis">; openerSet: number; askSet: number }> = [
    { order: ["opener","body","action","ask","crisis"], openerSet: 0, askSet: 0 },
    { order: ["body","opener","action","ask","crisis"], openerSet: 1, askSet: 1 },
    { order: ["opener","action","body","ask","crisis"], openerSet: 2, askSet: 2 },
    { order: ["action","opener","body","ask","crisis"], openerSet: 1, askSet: 3 },
  ];
  const PHRASES = {
    tryNext: [
      "Try this next:",
      "A small next move:",
      "One doable step:",
      "Consider trying:",
      "To get unstuck:",
    ],
    questions: [
      "What’s the smallest next step you can complete in the next 15 minutes?",
      "If you only did 10%, where would you start?",
      "Which single task would make tomorrow easier if you did it now?",
      "What would a good-enough first step look like?",
    ],
  };

  const profile = pickProfile(seed, STYLE_PROFILES);
  const tryLabel = pick(PHRASES.tryNext);
  const askAlt = pick(PHRASES.questions, 1);
  const mirrored = mirrorFragment(raw);

  // --------- build guidance paragraph (varied order) ----------
  const opener = chooseOpener(mood, seed, profile.openerSet);
  const body = (mirrored ? mirrored : "") + chooseBody(stressors, mood, seed);
  const action = suggestions.length ? `${tryLabel} ${formatList(suggestions, "and")}.` : "";
  const ask = askAlt;
  const crisis = risk_flags.length ? crisisLine() : "";

  const parts: Record<string,string> = { opener, body, action, ask, crisis };
  let guidance = profile.order.map(k => parts[k]).filter(Boolean).join(" ");

  // --------- target lengths scale with input size ----------
  const [minLen, maxLen] = lengthTargetsFor(raw);
  guidance = enforceLength(guidance, minLen, maxLen);

  // --------- anti-repetition guard (compares with recent outputs) ----------
  if (isTooSimilarToRecent(guidance)) {
    // Flip to a different profile deterministically and rebuild
    const altProfile = STYLE_PROFILES[(STYLE_PROFILES.indexOf(profile) + 1) % STYLE_PROFILES.length];
    const opener2 = chooseOpener(mood, seed + 7, altProfile.openerSet);
    const ask2 = PHRASES.questions[(seed + 11) % PHRASES.questions.length];
    const parts2: Record<string,string> = {
      opener: opener2,
      body,
      action,
      ask: ask2,
      crisis
    };
    guidance = altProfile.order.map(k => parts2[k]).filter(Boolean).join(" ");
    guidance = enforceLength(guidance, minLen, maxLen);
  }
  rememberOutput(guidance);

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

function chooseOpener(mood: string, seed: number, setIdx = 0): string {
  const commonSets: string[][] = [
    [
      "Thanks for sharing this—what you’re feeling is valid.",
      "I hear you, and it makes sense that you feel this way.",
      "You’re not alone in feeling like this, and it’s okay to slow down.",
    ],
    [
      "I appreciate you saying this—your feelings make sense.",
      "Given what you’ve described, it’s understandable to feel this way.",
      "It’s okay to feel this—let’s make things smaller and kinder.",
    ],
    [
      "Thanks for opening up—your reaction is valid.",
      "It’s reasonable to feel like this with everything going on.",
      "You’re not alone; many people feel this under similar pressure.",
    ],
  ];

  const tailored: Record<string,string[][]> = {
    overwhelmed: [
      [
        "Feeling overloaded is understandable given everything on your plate.",
        "It’s natural to feel swamped when deadlines pile up.",
      ],
      [
        "When the list keeps growing, it’s normal to feel flooded.",
        "A busy week can make any task feel bigger than it is.",
      ],
      [
        "Overload can blur priorities; we’ll simplify it.",
        "Pressure stacks quickly—let’s take one step at a time.",
      ],
    ],
    tired: [
      [
        "When energy is low, it’s wise to keep steps small and gentle.",
        "Fatigue makes everything feel heavier—small resets can still help.",
      ],
      [
        "Low energy narrows focus; tiny steps count.",
        "Restful pauses can restore just enough momentum.",
      ],
      [
        "When you’re drained, the next step should be very small.",
        "Let’s respect your energy and take one light step.",
      ],
    ],
    low: [
      [
        "Low mood can shrink motivation—being kind to yourself matters here.",
        "When things feel heavy, tiny forward steps still count.",
      ],
      [
        "Motivation dips are human; gentleness helps you restart.",
        "Heavy feelings don’t erase your ability to take one step.",
      ],
      [
        "It’s okay to move slowly; small progress still matters.",
        "We’ll keep it simple and manageable.",
      ],
    ],
    frustrated: [
      [
        "Frustration shows you care about the outcome—let’s channel it into one next step.",
        "It’s okay to pause and reset before moving again.",
      ],
      [
        "That edge of frustration can be turned into focused action.",
        "A short reset often brings clarity.",
      ],
      [
        "Frustration is a signal you want it to work—let’s shape it into action.",
        "A brief pause can convert friction into momentum.",
      ],
    ],
    neutral: [[] , [] , []],
  };

  const commons = commonSets[setIdx % commonSets.length];
  const tails = (tailored[mood] ?? [[],[],[]])[setIdx % 3];
  const arr = [...commons, ...tails];
  return arr[(seed >> 1) % Math.max(1, arr.length)] || commons[0];
}

function chooseBody(stressors: string[], mood: string, seed: number): string {
  const bits: string[] = [];
  if (stressors.includes("exams") || stressors.includes("deadlines") || stressors.includes("assignments")) {
    bits.push("Given the pressure from exams and deadlines, keep today’s plan small and focused.");
    bits.push("With exams and deadlines ahead, narrowing to one doable step can restore momentum.");
  }
  if (stressors.includes("sleep")) {
    bits.push("Sleep struggles amplify stress; a short wind-down later can help your mind settle.");
  }
  if (stressors.includes("team") || stressors.includes("projects")) {
    bits.push("A quick alignment with teammates can reduce uncertainty and share the load.");
  }
  if (!bits.length) {
    bits.push("Let’s reduce overwhelm by narrowing scope to one clear next move.");
    bits.push("Clarity grows when you shrink the target to a single small action.");
  }
  return bits[(seed >> 2) % bits.length];
}

function chooseQuestion(stressors: string[], mood: string, seed: number): string {
  const qs = [
    "What’s the smallest next step you can complete in the next 15 minutes?",
    "Which single task would make tomorrow easier if you did it now?",
    "If you gave yourself permission to do just 10% of the task, where would you start?",
    "Who could you message for a 1-line nudge or quick clarification?",
  ];
  return qs[(seed >> 3) % qs.length];
}

function crisisLine(): string {
  return "If you’re thinking about harming yourself or feel unsafe, please reach out to someone you trust now or local support (e.g., SOS 1767 in Singapore). You deserve immediate support.";
}

function formatList(items: string[], conj: "and" | "or" = "and"): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}

function enforceLength(s: string, min: number, max: number): string {
  let out = s.replace(/\s+/g, " ").trim();
  if (out.length < min) {
    out = out + " " + "Could starting with just five minutes help you get moving?";
  }
  if (out.length > max) {
    out = out.slice(0, max).replace(/\s+\S*$/, "") + ".";
  }
  return out;
}

function lengthTargetsFor(raw: string): [number, number] {
  const n = raw.length;
  if (n < 120) return [90, 200];
  if (n < 300) return [140, 320];
  return [180, 420];
}

// --- Personalization & profiles ---

function mirrorFragment(text: string): string {
  // Take a safe 2–6 word fragment (letters/spaces only), quote it once
  const m = (text.match(/\b([A-Za-z]{3,}\s+){2,6}[A-Za-z]{3,}\b/)?.[0] || "").trim();
  if (!m) return "";
  const cleaned = m.replace(/[.,;:!?()[\]'"`]/g, "");
  if (cleaned.length < 10) return "";
  return `About “${cleaned.slice(0, 60)}”… `;
}

function pickProfile<T extends { order: any; openerSet: number; askSet: number }>(
  seed: number,
  profiles: T[]
): T {
  const day = Math.floor(Date.now() / 86400000); // day-of-epoch: adds slow, deterministic variety
  return profiles[(seed + day) % profiles.length];
}

// --- Anti-repetition guard (simple LRU with similarity check) ---

const LAST_OUTPUTS: string[] = [];
const LRU_SIZE = 10;

function isTooSimilarToRecent(out: string): boolean {
  for (const prev of LAST_OUTPUTS) {
    if (jaccardSimilarity(tokens(prev), tokens(out)) >= 0.85) return true;
  }
  return false;
}

function rememberOutput(out: string) {
  LAST_OUTPUTS.unshift(out);
  if (LAST_OUTPUTS.length > LRU_SIZE) LAST_OUTPUTS.pop();
}

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const inter = new Set([...a].filter(x => b.has(x))).size;
  const union = new Set([...a, ...b]).size || 1;
  return inter / union;
}

// --- Long-input compression ---

function compressLongInput(src: string): string {
  // Keep at most ~2 sentences or ~250 chars of key content.
  const trimmed = src.slice(0, 800); // limit work
  const sentences = trimmed.split(/(?<=[.!?])\s+/).slice(0, 5);
  // pick 2 most content-dense sentences (longer ~ more content; simple heuristic)
  const scored = sentences
    .map(s => ({ s, score: scoreSentence(s) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 2)
    .map(x => x.s.trim());
  const out = scored.join(" ");
  return out.length > 250 ? out.slice(0, 250).replace(/\s+\S*$/, "") + "…" : out;
}

function scoreSentence(s: string): number {
  // crude score: words^0.5 + count of nouns-ish tokens
  const ws = s.split(/\s+/).filter(Boolean);
  const nounish = ws.filter(w => /^[A-Za-z]{4,}$/.test(w)).length;
  return Math.sqrt(ws.length) + nounish * 0.2;
}

// --- Utilities ---

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
    h = Math.imul(h, 16777619) >>> 0; // FNV-1a
  }
  return h;
}
