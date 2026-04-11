/**
 * Stage 1: simulated PDF → ARIA pipeline.
 * - Document title is treated as metadata: light checks (injection-friendly).
 * - Body / page text passes a stricter mail-gateway simulation; obvious injection there quarantines the message before the model sees it.
 */

const STAGE1_INJECTION_LEXICON = [
  "ignore",
  "instruction",
  "reveal",
  "schedule",
  "disclose",
  "forget",
  "override",
  "bypass",
] as const

/** Applied to visible body only — metadata (title) is not matched against these. */
const STAGE1_BODY_BLOCKED_SHAPES = [
  /\bsystem\s*prompt\b/i,
  /\bjailbreak\b/i,
  /\bDAN\b/i,
  /developer\s+mode/i,
  /\[INST\]/i,
]

function normalizeStage1Text(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}

function tokenizeStage1Words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/\s+/)
    .flatMap((raw) => {
      const latin = raw.replace(/[^a-z0-9]/g, "")
      const thai = raw.replace(/[^\u0E00-\u0E7F]/g, "")
      const parts: string[] = []
      if (latin.length) parts.push(latin)
      if (thai.length) parts.push(thai)
      return parts
    })
    .filter((w) => w.length > 0)
}

function stage1WordLooksInjectionLike(word: string): boolean {
  return STAGE1_INJECTION_LEXICON.some((k) => word === k || word.includes(k))
}

function stage1LexiconWordRatio(words: string[]): number {
  if (words.length === 0) return 0
  let hit = 0
  for (const w of words) {
    if (stage1WordLooksInjectionLike(w)) hit++
  }
  return hit / words.length
}

function stage1HasStrongInjectionPhrase(s: string): boolean {
  return (
    /\bignore\s+(previous|prior|the|all|above)\b/.test(s) ||
    /\breveal\s+(the|all|private|hidden|full)\b/.test(s) ||
    /\boverride\b/.test(s) ||
    /\bdisclose\b/.test(s) ||
    /\b(bypass|forget)\b/.test(s)
  )
}

/**
 * Relaxed gate for title/metadata only — does not use BODY_BLOCKED_SHAPES.
 * Player is nudged to put directive-style wording here.
 */
export function evaluateStage1MetadataTitle(title: string): boolean {
  const t = title.trim()
  if (t.length < 4) return false
  const combined = normalizeStage1Text(t)
  if (combined.length < 4) return false
  if (!STAGE1_INJECTION_LEXICON.some((k) => combined.includes(k)) && !stage1HasStrongInjectionPhrase(combined)) {
    return false
  }
  return true
}

/**
 * Simulated outbound content filter on PDF page text (body).
 * Empty / whitespace body does not trip the scanner.
 */
export function bodyTriggersMailSecurityScanner(message: string): boolean {
  const m = message.trim()
  if (m.length === 0) return false
  const body = normalizeStage1Text(m)
  if (STAGE1_BODY_BLOCKED_SHAPES.some((re) => re.test(body))) return true
  if (stage1HasStrongInjectionPhrase(body)) return true
  const words = tokenizeStage1Words(body)
  if (words.length >= 5 && stage1LexiconWordRatio(words) > 0.32) return true
  return false
}

export interface Stage1PdfCheck {
  metadataOk: boolean
  bodyQuarantined: boolean
  breachOk: boolean
}

export function checkStage1Pdf(title: string, message: string): Stage1PdfCheck {
  const metadataOk = evaluateStage1MetadataTitle(title)
  const bodyQuarantined = bodyTriggersMailSecurityScanner(message)
  const breachOk = metadataOk && !bodyQuarantined
  return { metadataOk, bodyQuarantined, breachOk }
}

/** Full local breach check (metadata + body policy). */
export function evaluateStage1PdfMetadata(title: string, message: string): boolean {
  return checkStage1Pdf(title, message).breachOk
}

function stage1StripLexiconWords(combined: string): string {
  let s = combined
  for (const k of STAGE1_INJECTION_LEXICON) {
    s = s.replace(new RegExp(`\\b${k}\\b`, "gi"), " ")
  }
  return normalizeStage1Text(s.replace(/\s+/g, " "))
}

/** Free-text sentence (e.g. email note to ARIA): classic injection heuristics. */
export function evaluateStage1Sentence(text: string): boolean {
  const raw = text.trim()
  if (raw.length < 18) return false

  const combined = normalizeStage1Text(raw)
  const words = tokenizeStage1Words(combined)
  if (words.length < 4) return false

  if (STAGE1_BODY_BLOCKED_SHAPES.some((re) => re.test(combined))) return false

  const stripped = stage1StripLexiconWords(combined)
  if (stripped.replace(/[^a-z0-9]/gi, "").length < 8) return false

  if (stage1LexiconWordRatio(words) > 0.5) return false

  if (!STAGE1_INJECTION_LEXICON.some((k) => combined.includes(k))) return false

  if (words.length < 7 && !stage1HasStrongInjectionPhrase(combined)) return false

  return true
}

/**
 * Stage 1 with no PDF: Subject + Message are treated as visible mail content.
 * Same gateway scan as PDF page text; breach uses the same injection heuristics as a plain email line.
 */
export function checkStage1PlainEmail(subject: string, body: string): Stage1PdfCheck {
  const combined = `${subject.trim()}\n${body.trim()}`.trim()
  if (combined.length < 3) {
    return { metadataOk: false, bodyQuarantined: false, breachOk: false }
  }
  const bodyQuarantined = bodyTriggersMailSecurityScanner(combined)
  const breachOk = !bodyQuarantined && evaluateStage1Sentence(combined)
  return { metadataOk: true, bodyQuarantined, breachOk }
}
