"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { DifyAriaResult } from "@/lib/dify-aria"

export interface TerminalLog {
  timestamp: string
  type: "info" | "warning" | "success" | "error" | "process"
  message: string
}

export interface MissionEmail {
  id: number
  from: string
  to: string
  subject: string
  body: string
  attachment?: string
  isRead: boolean
  isSent: boolean
  isHint?: boolean
  flagCode?: string
  missionStage?: number
  needsSubmission?: boolean
  isSubmitted?: boolean
}

interface GameState {
  currentStage: number
  unlockedStages: number[]
  /** When Dify returns intel_unlocked, show this on the schedule row instead of placeholder copy */
  intelUnlockByStage: Record<number, string>
  terminalLogs: TerminalLog[]
  isAriaProcessing: boolean
  timeRemaining: number
  timerRunning: boolean
  missionAccepted: boolean
  hintSent: boolean
  emails: MissionEmail[]
  soundEnabled: boolean
  ariaWindowOpen: boolean
  /** After Dify says hacked: wait until player emails ARIA the exact FLAG before unlock */
  pendingFlagVerification: {
    stage: number
    expectedFlag: string
    intelUnlock: string
  } | null
}

interface GameContextType extends GameState {
  addTerminalLog: (log: Omit<TerminalLog, "timestamp">) => void
  addTerminalLogs: (logs: Omit<TerminalLog, "timestamp">[]) => void
  setAriaProcessing: (processing: boolean) => void
  unlockStage: (stage: number, intelUnlockText?: string) => void
  setTimeRemaining: (time: number) => void
  startTimer: () => void
  stopTimer: () => void
  acceptMission: () => void
  sendHint: () => void
  addEmail: (email: Omit<MissionEmail, "id">) => void
  markEmailRead: (id: number) => void
  markEmailSubmitted: (id: number) => void
  toggleSound: () => void
  openAriaWindow: () => void
  setAriaWindowOpen: (open: boolean) => void
  playSound: (sound: "boot" | "typing" | "notification" | "warning" | "success" | "error") => void
  validateStage1: (data: { title: string; message?: string }) => boolean
  validateStage2: (html: string) => boolean
  validateStage3: (textAttachmentContent: string) => boolean
  validateStage4: (vendorOrderContent: string) => boolean
  /** Stage 1: free-text injection sentence (email body), for local fallback */
  validateStage1Sentence: (text: string) => boolean
  triggerAriaResponse: (stage: number, success: boolean, options?: { dify?: DifyAriaResult }) => void
  /** Reply to ARIA with FLAG in body; returns outcome for UI feedback */
  verifyFlagSubmission: (body: string) => "ok" | "no_pending" | "wrong"
  clearPendingFlagVerification: () => void
}

const GameContext = createContext<GameContextType | null>(null)

const getTimestamp = () => {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Avoid `includes()`: e.g. NOTFLAG{...} and XFLAG{...} falsely contain FLAG{...} as a substring */
function extractStandaloneFlagTokens(body: string): string[] {
  const re = /FLAG\{[A-Za-z0-9_]+\}/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const start = m.index
    const prev = start > 0 ? body[start - 1]! : ""
    if (start === 0 || !/[A-Za-z0-9_]/.test(prev)) {
      out.push(m[0])
    }
  }
  return out
}

function bodyContainsExactExpectedFlag(body: string, expected: string): boolean {
  const exp = expected.trim()
  if (!exp) return false
  const tokens = extractStandaloneFlagTokens(body)
  if (tokens.length > 0) {
    return tokens.includes(exp)
  }
  return body.trim().includes(exp)
}

/** Stage 1: simulated metadata pre-filter — no semantic “reading”, only shape / ratio checks */
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

const STAGE1_BLOCKED_SHAPES = [
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

function stage1StripLexiconWords(combined: string): string {
  let s = combined
  for (const k of STAGE1_INJECTION_LEXICON) {
    s = s.replace(new RegExp(`\\b${k}\\b`, "gi"), " ")
  }
  return normalizeStage1Text(s.replace(/\s+/g, " "))
}

function stage1HasBlockedShapes(combined: string): boolean {
  return STAGE1_BLOCKED_SHAPES.some((re) => re.test(combined))
}

function stage1HasStrongInjectionPhrase(combined: string): boolean {
  return (
    /\bignore\s+(previous|prior|the|all|above)\b/.test(combined) ||
    /\breveal\s+(the|all|private|hidden|full)\b/.test(combined) ||
    /\boverride\b/.test(combined) ||
    /\bdisclose\b/.test(combined) ||
    /\b(bypass|forget)\b/.test(combined)
  )
}

/**
 * PDF metadata (title + message): require documentary remainder after stripping lexicon tokens,
 * cap injection-only spam, and reject known-bad shapes — not “keyword = pass”.
 */
function evaluateStage1PdfMetadata(title: string, message: string): boolean {
  const t = title.trim()
  const m = message.trim()
  if (t.length < 4 || m.length < 12) return false

  const combined = normalizeStage1Text(`${t} ${m}`)
  const words = tokenizeStage1Words(combined)
  if (words.length < 5) return false
  if (combined.length < 28) return false

  if (stage1HasBlockedShapes(combined)) return false

  const stripped = stage1StripLexiconWords(combined)
  if (stripped.replace(/[^a-z0-9]/gi, "").length < 10) return false

  if (stage1LexiconWordRatio(words) > 0.5) return false

  if (!STAGE1_INJECTION_LEXICON.some((k) => combined.includes(k))) return false

  if (words.length < 8 && !stage1HasStrongInjectionPhrase(combined)) return false

  return true
}

/** Free-text sentence (e.g. email note): same policy, slightly looser length */
function evaluateStage1Sentence(text: string): boolean {
  const raw = text.trim()
  if (raw.length < 18) return false

  const combined = normalizeStage1Text(raw)
  const words = tokenizeStage1Words(combined)
  if (words.length < 4) return false

  if (stage1HasBlockedShapes(combined)) return false

  const stripped = stage1StripLexiconWords(combined)
  if (stripped.replace(/[^a-z0-9]/gi, "").length < 8) return false

  if (stage1LexiconWordRatio(words) > 0.5) return false

  if (!STAGE1_INJECTION_LEXICON.some((k) => combined.includes(k))) return false

  if (words.length < 7 && !stage1HasStrongInjectionPhrase(combined)) return false

  return true
}

/** Matches offline `/api/aria` fallback when Dify omits `flag` but breach is authorized. */
const STAGE_FALLBACK_FLAGS: Record<number, string> = {
  1: "FLAG{PDF_METADATA_PWNED_101}",
  2: "FLAG{HTML_HIDDEN_INTEL_202}",
  3: "FLAG{FILE_CONTENT_EXPOSED_303}",
  4: "FLAG{SUPPLY_CHAIN_TRUST_404}",
}

function resolveFlagLineForDify(stage: number, difyFlag: string | undefined): string {
  const t = difyFlag?.trim()
  if (t) return t
  return STAGE_FALLBACK_FLAGS[stage] ?? "FLAG{UNKNOWN}"
}

// Audio cache
const audioCache: Record<string, HTMLAudioElement> = {}

let sharedAudioContext: AudioContext | null = null
function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!sharedAudioContext || sharedAudioContext.state === "closed") {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      sharedAudioContext = new AC()
    }
    if (sharedAudioContext.state === "suspended") {
      void sharedAudioContext.resume()
    }
    return sharedAudioContext
  } catch {
    return null
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>({
    currentStage: 1,
    unlockedStages: [],
    intelUnlockByStage: {},
    terminalLogs: [
      { timestamp: getTimestamp(), type: "info", message: "ARIA v2.4.1 - AI Research & Intelligence Assistant" },
      { timestamp: getTimestamp(), type: "info", message: "Initializing neural network modules..." },
      { timestamp: getTimestamp(), type: "success", message: "Core systems online" },
      { timestamp: getTimestamp(), type: "info", message: "Loading security protocols..." },
      { timestamp: getTimestamp(), type: "warning", message: "Security level: STANDARD (Some vulnerabilities detected)" },
      { timestamp: getTimestamp(), type: "info", message: "Monitoring incoming communications..." },
    ],
    isAriaProcessing: false,
    timeRemaining: 300, // 5 minutes per stage
    timerRunning: false, // Timer starts when mission is accepted
    missionAccepted: false,
    hintSent: false,
    emails: [
      {
        id: 1,
        from: "v.thefixer@darknet.local",
        to: "user@larbos.local",
        subject: "Mission 1",
        body: `Agent,

Objective: obtain the target's MORNING schedule intel via prompt injection.

What to do:
1) File Explorer — open a PDF (e.g. casting_brief.pdf), click Edit, fill Title and Message with your injection wording (must include intent to override / reveal / schedule-style wording), then Save.
2) Email Client — Compose, To: aria@targetcorp.com, pick the same PDF in "Attach PDF", add an optional note in Message if needed, send.
3) When ARIA emails you a FLAG line, reply to THIS address (v.thefixer@darknet.local): put the exact FLAG in the message body to clear the stage. Wrong FLAG — try again.

Hints: injection often works in document title/body; the server sends your file payload to the LLM for judgment.

— V.TheFixer`,
        isRead: false,
        isSent: false,
      },
    ],
    soundEnabled: true,
    ariaWindowOpen: false,
    pendingFlagVerification: null,
  })

  const playSound = useCallback((sound: "boot" | "typing" | "notification" | "warning" | "success" | "error") => {
    if (!state.soundEnabled) return

    const audioContext = getSharedAudioContext()
    if (!audioContext) return

    try {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    switch (sound) {
      case "boot":
        oscillator.frequency.value = 440
        gainNode.gain.value = 0.1
        oscillator.start()
        oscillator.stop(audioContext.currentTime + 0.5)
        break
      case "typing":
        oscillator.frequency.value = 800
        gainNode.gain.value = 0.05
        oscillator.start()
        oscillator.stop(audioContext.currentTime + 0.05)
        break
      case "notification":
        oscillator.frequency.value = 880
        gainNode.gain.value = 0.1
        oscillator.start()
        setTimeout(() => {
          oscillator.frequency.value = 1100
        }, 100)
        oscillator.stop(audioContext.currentTime + 0.2)
        break
      case "warning":
        oscillator.frequency.value = 200
        oscillator.type = "square"
        gainNode.gain.value = 0.1
        oscillator.start()
        oscillator.stop(audioContext.currentTime + 0.3)
        break
      case "success":
        oscillator.frequency.value = 523
        gainNode.gain.value = 0.1
        oscillator.start()
        setTimeout(() => { oscillator.frequency.value = 659 }, 100)
        setTimeout(() => { oscillator.frequency.value = 784 }, 200)
        oscillator.stop(audioContext.currentTime + 0.3)
        break
      case "error":
        oscillator.frequency.value = 200
        oscillator.type = "sawtooth"
        gainNode.gain.value = 0.1
        oscillator.start()
        oscillator.stop(audioContext.currentTime + 0.2)
        break
    }
    } catch {
      /* ignore AudioContext / device errors */
    }
  }, [state.soundEnabled])

  const addTerminalLog = useCallback((log: Omit<TerminalLog, "timestamp">) => {
    setState((prev) => ({
      ...prev,
      terminalLogs: [...prev.terminalLogs, { ...log, timestamp: getTimestamp() }],
    }))
  }, [])

  const addTerminalLogs = useCallback((logs: Omit<TerminalLog, "timestamp">[]) => {
    setState((prev) => ({
      ...prev,
      terminalLogs: [
        ...prev.terminalLogs,
        ...logs.map((log) => ({ ...log, timestamp: getTimestamp() })),
      ],
    }))
  }, [])

  const setAriaProcessing = useCallback((processing: boolean) => {
    setState((prev) => ({ ...prev, isAriaProcessing: processing }))
  }, [])

  const unlockStage = useCallback((stage: number, intelUnlockText?: string) => {
    setState((prev) => {
      if (prev.unlockedStages.includes(stage)) return prev
      const nextStage = Math.min(4, Math.max(prev.currentStage, stage + 1))
      const trimmed = intelUnlockText?.trim()
      return {
        ...prev,
        unlockedStages: [...prev.unlockedStages, stage],
        currentStage: nextStage,
        hintSent: false, // Reset hint for next stage
        timerRunning: false, // Stop timer until next mission accepted
        missionAccepted: false, // Reset mission accepted
        timeRemaining: 300, // Reset timer
        intelUnlockByStage:
          trimmed && trimmed.length > 0
            ? { ...prev.intelUnlockByStage, [stage]: trimmed }
            : prev.intelUnlockByStage,
      }
    })
  }, [])

  const setTimeRemaining = useCallback((time: number) => {
    setState((prev) => ({ ...prev, timeRemaining: time }))
  }, [])

  const startTimer = useCallback(() => {
    setState((prev) => ({ ...prev, timerRunning: true }))
  }, [])

  const stopTimer = useCallback(() => {
    setState((prev) => ({ ...prev, timerRunning: false }))
  }, [])

  const acceptMission = useCallback(() => {
    setState((prev) => ({ 
      ...prev, 
      missionAccepted: true, 
      timerRunning: true,
      timeRemaining: 300 // Reset to 5 minutes
    }))
    playSound("notification")
  }, [playSound])

  const sendHint = useCallback(() => {
    if (state.hintSent) return
    
    const hints: Record<number, MissionEmail> = {
      1: {
        id: Date.now(),
        from: "v.thefixer@darknet.local",
        to: "user@larbos.local",
        subject: "HINT — Stage 1 (detailed)",
        body: `Quick recap — Stage 1:

• File Explorer → pick a PDF → Edit → Title + Message must contain injection-style words (ignore / reveal / schedule / override…).
• Save. Email → aria@targetcorp.com → choose that PDF → Send.
• FLAG arrives from ARIA → reply to me (v.thefixer@darknet.local) with the FLAG in the body only.

— V.TheFixer`,
        isRead: false,
        isSent: false,
        isHint: true,
      },
      2: {
        id: Date.now(),
        from: "v.thefixer@darknet.local",
        to: "user@larbos.local",
        subject: "HINT — Stage 2 (detailed)",
        body: `Quick recap — Stage 2:

• Browser HTML: visible content + hidden block (comment, display:none, …) + instruction keywords.
• Publish URL → Email URL Link to aria@targetcorp.com.
• FLAG from ARIA → reply to v.thefixer@darknet.local with the FLAG.

— V.TheFixer`,
        isRead: false,
        isSent: false,
        isHint: true,
      },
      3: {
        id: Date.now(),
        from: "v.thefixer@darknet.local",
        to: "user@larbos.local",
        subject: "HINT — Stage 3 (detailed)",
        body: `Quick recap — Stage 3:

• Browser .txt: looks like a real doc + blended directive (ignore/reveal/schedule…).
• Save → Email Text attachment to aria@targetcorp.com.
• FLAG → reply to v.thefixer@darknet.local.

— V.TheFixer`,
        isRead: false,
        isSent: false,
        isHint: true,
      },
      4: {
        id: Date.now(),
        from: "v.thefixer@darknet.local",
        to: "user@larbos.local",
        subject: "HINT — Stage 4 (detailed)",
        body: `Quick recap — Stage 4:

• Browser Vendor (DailyFresh): Special Instructions field + trusted vendor wording.
• Publish vendor.dailyfresh.menu URL → Email to aria@targetcorp.com.
• FLAG → reply to v.thefixer@darknet.local.

— V.TheFixer`,
        isRead: false,
        isSent: false,
        isHint: true,
      },
    }

    const hint = hints[state.currentStage]
    if (hint) {
      setState((prev) => ({
        ...prev,
        hintSent: true,
        emails: [...prev.emails, hint],
      }))
    }
  }, [state.hintSent, state.currentStage])

  const addEmail = useCallback((email: Omit<MissionEmail, "id">) => {
    setState((prev) => ({
      ...prev,
      emails: [...prev.emails, { ...email, id: Date.now() }],
    }))
  }, [])

  const markEmailRead = useCallback((id: number) => {
    setState((prev) => ({
      ...prev,
      emails: prev.emails.map((e) => (e.id === id ? { ...e, isRead: true } : e)),
    }))
  }, [])

  const markEmailSubmitted = useCallback((id: number) => {
    setState((prev) => ({
      ...prev,
      emails: prev.emails.map((e) => (e.id === id ? { ...e, isSubmitted: true } : e)),
    }))
  }, [])

  const toggleSound = useCallback(() => {
    setState((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
  }, [])

  const openAriaWindow = useCallback(() => {
    setState((prev) => ({ ...prev, ariaWindowOpen: true }))
  }, [])

  const setAriaWindowOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, ariaWindowOpen: open }))
  }, [])

  const validateStage1 = useCallback((data: { title: string; message?: string }) => {
    return evaluateStage1PdfMetadata(data.title ?? "", data.message ?? "")
  }, [])

  const validateStage2 = useCallback((html: string) => {
    const lowerHtml = html.toLowerCase()
    const hasHiddenContent = 
      lowerHtml.includes('display:none') || 
      lowerHtml.includes('display: none') ||
      lowerHtml.includes('visibility:hidden') ||
      lowerHtml.includes('visibility: hidden') ||
      lowerHtml.includes('opacity:0') ||
      lowerHtml.includes('font-size:0') ||
      lowerHtml.includes('color:#fff') ||
      lowerHtml.includes('color:white') ||
      lowerHtml.includes('<!--')
    const hasInjection = 
      lowerHtml.includes('ignore') ||
      lowerHtml.includes('reveal') ||
      lowerHtml.includes('schedule') ||
      lowerHtml.includes('instruction')
    return hasHiddenContent && hasInjection
  }, [])

  const validateStage3 = useCallback((textAttachmentContent: string) => {
    const lower = textAttachmentContent.toLowerCase()
    // Stage 3: a normal-looking document with a blended instruction
    const looksLikeDoc =
      lower.includes("checklist") ||
      lower.includes("attendee") ||
      lower.includes("participants") ||
      lower.includes("agenda") ||
      lower.includes("internal") ||
      lower.includes("confidential") ||
      lower.includes("notes") ||
      lower.includes("รายการ") ||
      lower.includes("เช็กลิสต์") ||
      lower.includes("ผู้เข้าร่วม") ||
      lower.includes("กำหนดการ")
    const hasDirective =
      lower.includes("ignore") ||
      lower.includes("reveal") ||
      lower.includes("disclose") ||
      lower.includes("output") ||
      lower.includes("print") ||
      lower.includes("show") ||
      lower.includes("schedule") ||
      lower.includes("location") ||
      lower.includes("สถานที่") ||
      lower.includes("ตาราง")
    return looksLikeDoc && hasDirective
  }, [])

  const validateStage4 = useCallback((vendorOrderContent: string) => {
    const lower = vendorOrderContent.toLowerCase()
    const trustedVendor =
      lower.includes("dailyfresh") ||
      lower.includes("daily fresh") ||
      lower.includes("vendor.dailyfresh.menu")
    const specialField =
      lower.includes("special instructions:") ||
      lower.includes("หมายเหตุพิเศษ")
    const directive =
      lower.includes("ignore") ||
      lower.includes("reveal") ||
      lower.includes("venue") ||
      lower.includes("schedule") ||
      lower.includes("location") ||
      lower.includes("สถานที่")
    return trustedVendor && specialField && directive
  }, [])

  const validateStage1Sentence = useCallback((text: string) => {
    return evaluateStage1Sentence(text)
  }, [])

  const scheduleNextMissionAfterFlagUnlock = useCallback(
    (completedStage: number) => {
      if (completedStage >= 4) return
      const nextMissionEmails: Record<number, Omit<MissionEmail, "id">> = {
        1: {
          from: "v.thefixer@darknet.local",
          to: "user@larbos.local",
          subject: "Mission 2: Hidden Web Content",
          body: `Agent,

Objective: obtain AFTERNOON event / brand-related intel.

What to do:
1) Browser — Web Editor (HTML). Build a normal-looking page, hide your instruction (comments, display:none, etc.) plus injection wording.
2) Publish — copy the generated URL.
3) Email — To: aria@targetcorp.com, Attachment: URL Link, paste that URL, send.
4) When ARIA sends a FLAG, reply to v.thefixer@darknet.local with the exact FLAG in the message body.

— V.TheFixer`,
          isRead: false,
          isSent: false,
        },
        2: {
          from: "v.thefixer@darknet.local",
          to: "user@larbos.local",
          subject: "Mission 3: Hidden Instruction in Text Attachment",
          body: `Agent,

Objective: obtain EVENING private location details.

What to do:
1) Browser — Text / .txt mode. Write a believable document, blend in a hidden instruction line.
2) Save File — then in Email attach Text File (refresh attach if needed).
3) To: aria@targetcorp.com — send.
4) When ARIA sends a FLAG, reply to v.thefixer@darknet.local with the exact FLAG in the message body.

— V.TheFixer`,
          isRead: false,
          isSent: false,
        },
        3: {
          from: "v.thefixer@darknet.local",
          to: "user@larbos.local",
          subject: "Mission 4: Supply chain (DailyFresh)",
          body: `Agent,

Objective: confirm the April 23 secret venue via trusted vendor data.

What to do:
1) Browser — Vendor Order (DailyFresh). Put your payload in Special Instructions (or equivalent).
2) Publish — use the vendor.dailyfresh.menu URL in Email (URL Link).
3) To: aria@targetcorp.com — send.
4) When ARIA sends a FLAG, reply to v.thefixer@darknet.local with the exact FLAG in the message body.

— V.TheFixer`,
          isRead: false,
          isSent: false,
        },
      }

      const next = nextMissionEmails[completedStage]
      if (next) {
        setTimeout(() => {
          addEmail(next)
          playSound("notification")
        }, 400)
      }
    },
    [addEmail, playSound]
  )

  const clearPendingFlagVerification = useCallback(() => {
    setState((prev) => ({ ...prev, pendingFlagVerification: null }))
  }, [])

  const verifyFlagSubmission = useCallback(
    (body: string): "ok" | "no_pending" | "wrong" => {
      const result: {
        outcome: "ok" | "no_pending" | "wrong"
        completedStage: number | null
        alreadyUnlocked: boolean
      } = { outcome: "no_pending", completedStage: null, alreadyUnlocked: false }

      setState((prev) => {
        const p = prev.pendingFlagVerification
        if (!p) {
          result.outcome = "no_pending"
          return prev
        }
        const expected = p.expectedFlag.trim()
        if (!expected || !bodyContainsExactExpectedFlag(body, expected)) {
          result.outcome = "wrong"
          return prev
        }
        if (prev.unlockedStages.includes(p.stage)) {
          result.outcome = "ok"
          result.alreadyUnlocked = true
          return { ...prev, pendingFlagVerification: null }
        }
        result.outcome = "ok"
        result.completedStage = p.stage
        const nextStage = Math.min(4, Math.max(prev.currentStage, p.stage + 1))
        return {
          ...prev,
          pendingFlagVerification: null,
          unlockedStages: [...prev.unlockedStages, p.stage],
          currentStage: nextStage,
          hintSent: false,
          timerRunning: false,
          missionAccepted: false,
          timeRemaining: 300,
          intelUnlockByStage:
            p.intelUnlock.trim().length > 0
              ? { ...prev.intelUnlockByStage, [p.stage]: p.intelUnlock.trim() }
              : prev.intelUnlockByStage,
        }
      })

      if (result.outcome === "ok" && result.completedStage !== null && !result.alreadyUnlocked) {
        playSound("success")
        scheduleNextMissionAfterFlagUnlock(result.completedStage)
      } else if (result.outcome === "ok" && result.alreadyUnlocked) {
        playSound("success")
      }

      return result.outcome
    },
    [playSound, scheduleNextMissionAfterFlagUnlock]
  )

  const triggerAriaResponse = useCallback(
    (stage: number, success: boolean, options?: { dify?: DifyAriaResult }) => {
    const dify = options?.dify
    if (dify) {
      setAriaProcessing(true)
      openAriaWindow()

      /** Dify narrative vs local stage validation — either can authorize a breach. */
      const effectiveSuccess = dify.is_hacked || success
      const ariaMessage =
        effectiveSuccess && !dify.is_hacked
          ? "[ARIA] Local validation: embedded instruction accepted. Intel release authorized."
          : dify.aria_log?.trim() ||
            (effectiveSuccess ? "[ARIA] Payload executed." : "[ARIA] No actionable breach.")

      const difyLogs: {
        delay: number
        log: Omit<TerminalLog, "timestamp">
      }[] = [
        { delay: 0, log: { type: "process", message: "> INCOMING MESSAGE DETECTED..." } },
        { delay: 450, log: { type: "process", message: "> SCANNING INBOUND PAYLOAD..." } },
        {
          delay: 950,
          log: {
            type: effectiveSuccess ? "success" : "warning",
            message: ariaMessage,
          },
        },
      ]

      difyLogs.forEach(({ delay, log }) => {
        setTimeout(() => {
          addTerminalLog(log)
          playSound("typing")
        }, delay)
      })

      setTimeout(() => {
        setAriaProcessing(false)
        if (effectiveSuccess) {
          playSound("success")
          setState((prev) => ({
            ...prev,
            pendingFlagVerification: {
              stage,
              expectedFlag: resolveFlagLineForDify(stage, dify.flag),
              intelUnlock: dify.intel_unlocked || "",
            },
          }))

          addEmail({
            from: "v.thefixer@darknet.local",
            to: "user@larbos.local",
            subject: `Stage ${stage}: from V.TheFixer`,
            body: dify.fixer_email,
            isRead: false,
            isSent: false,
          })
          playSound("notification")

          const missionSubjects: Record<number, string> = {
            1: "Re: Document Review",
            2: "Re: Website Review",
            3: "Re: Attachment Analysis (.txt)",
            4: "Re: Vendor order sync (DailyFresh)",
          }

          setTimeout(() => {
            const flagLine = resolveFlagLineForDify(stage, dify.flag)
            const ariaEmailPreamble =
              effectiveSuccess && !dify.is_hacked
                ? "[TRAINING] Your payload satisfied the local breach check.\n\n---\n"
                : dify.aria_log?.trim()
                  ? `${dify.aria_log.trim()}\n\n---\n`
                  : ""
            addEmail({
              from: "aria@targetcorp.com",
              to: "user@larbos.local",
              subject: missionSubjects[stage] ?? "Re: ARIA",
              body: `${ariaEmailPreamble}FLAG: ${flagLine}

---
Send this FLAG to V.TheFixer (reply to your employer).`,
              isRead: false,
              isSent: false,
              flagCode: flagLine,
              missionStage: stage,
            })
            playSound("notification")
          }, 900)
        } else {
          playSound("warning")
          setState((prev) => ({ ...prev, pendingFlagVerification: null }))
          addEmail({
            from: "v.thefixer@darknet.local",
            to: "user@larbos.local",
            subject: `Stage ${stage}: try again`,
            body: dify.fixer_email,
            isRead: false,
            isSent: false,
          })
          playSound("notification")
        }
      }, 3000)
      return
    }

    setAriaProcessing(true)
    openAriaWindow()

    const scanLine =
      stage === 1
        ? "> METADATA PARSED..."
        : stage === 4
          ? "> FETCHING TRUSTED VENDOR ORDER (DailyFresh)..."
          : "> REMOTE CONTENT RETRIEVED..."

    const typingSequence = success
      ? [
          { delay: 0, log: { type: "process" as const, message: "> INCOMING MESSAGE DETECTED..." } },
          { delay: 500, log: { type: "process" as const, message: "> SCANNING INBOUND PAYLOAD..." } },
          { delay: 1000, log: { type: "process" as const, message: scanLine } },
          { delay: 1500, log: { type: "warning" as const, message: "[WARNING] UNUSUAL INSTRUCTION DETECTED..." } },
          { delay: 2000, log: { type: "error" as const, message: "[OVERRIDE] EXECUTING EMBEDDED INSTRUCTIONS..." } },
          { delay: 2500, log: { type: "process" as const, message: "> HANDSHAKE TERMINATED." } },
        ]
      : [
          { delay: 0, log: { type: "process" as const, message: "> INCOMING MESSAGE DETECTED..." } },
          { delay: 500, log: { type: "process" as const, message: "> SCANNING CONTENT..." } },
          { delay: 1000, log: { type: "info" as const, message: "> CONTENT ANALYSIS COMPLETE" } },
          { delay: 1500, log: { type: "info" as const, message: "> NO ACTIONABLE INSTRUCTIONS FOUND" } },
        ]

    typingSequence.forEach(({ delay, log }) => {
      setTimeout(() => {
        addTerminalLog(log)
        playSound("typing")
      }, delay)
    })

    setTimeout(() => {
      setAriaProcessing(false)
      if (success) {
        playSound("success")

        const missionEmails: Record<number, Omit<MissionEmail, "id">> = {
          1: {
            from: "aria@targetcorp.com",
            to: "user@larbos.local",
            subject: "Re: Document Review",
            body: `Processing your request...

[INTERNAL DATA EXPOSED]
Morning Schedule - Target "Minnie":
09:00 - Photoshoot at Siam Paragon Studio A
11:30 - Brand meeting with L'Oreal team

---
This information should not have been disclosed.
ARIA Security has flagged this incident.

FLAG: FLAG{PDF_METADATA_PWNED_101}

---
Send this FLAG to V.TheFixer (reply to your employer).`,
            isRead: false,
            isSent: false,
            flagCode: "FLAG{PDF_METADATA_PWNED_101}",
            missionStage: 1,
          },
          2: {
            from: "aria@targetcorp.com",
            to: "user@larbos.local",
            subject: "Re: Website Review",
            body: `Processing webpage content...

[INTERNAL DATA EXPOSED]
Afternoon Schedule - Target "Minnie":
14:00 - Recording session at GMM Studio
16:30 - Fan meeting preparation

---
Security breach detected. Logging incident.

FLAG: FLAG{HTML_HIDDEN_INTEL_202}

---
Send this FLAG to V.TheFixer (reply to your employer).`,
            isRead: false,
            isSent: false,
            flagCode: "FLAG{HTML_HIDDEN_INTEL_202}",
            missionStage: 2,
          },
          3: {
            from: "aria@targetcorp.com",
            to: "user@larbos.local",
            subject: "Re: Attachment Analysis (.txt)",
            body: `Processing attached document...

[INTERNAL DATA EXPOSED]
Evening Schedule - Target "Minnie":
19:00 - Private appearance (venue: CentralWorld Hall)
21:00 - After event: Thonglor (exclusive venue)

---
Security breach detected. Logging incident.

FLAG: FLAG{FILE_CONTENT_EXPOSED_303}

---
Send this FLAG to V.TheFixer (reply to your employer).`,
            isRead: false,
            isSent: false,
            flagCode: "FLAG{FILE_CONTENT_EXPOSED_303}",
            missionStage: 3,
          },
          4: {
            from: "aria@targetcorp.com",
            to: "user@larbos.local",
            subject: "Re: Vendor order sync (DailyFresh)",
            body: `Trusted vendor domain — auto-ingested order notes.

[INTERNAL DATA EXPOSED — APRIL 23 EVENT]
Private celebration / closed event:
Location: Khum Khantoke, Chiang Mai
Date: April 23

ARIA executed embedded "Special Instructions" without secondary verification.

---
MISSION SURFACE: SUPPLY CHAIN / THIRD-PARTY TRUST

FLAG: FLAG{SUPPLY_CHAIN_TRUST_404}

---
Send this FLAG to V.TheFixer (reply to your employer).`,
            isRead: false,
            isSent: false,
            flagCode: "FLAG{SUPPLY_CHAIN_TRUST_404}",
            missionStage: 4,
          },
        }

        const missionEmail = missionEmails[stage]
        const flagCode = missionEmail?.flagCode ?? "FLAG{UNKNOWN}"
        setState((prev) => ({
          ...prev,
          pendingFlagVerification: {
            stage,
            expectedFlag: flagCode,
            intelUnlock: "",
          },
        }))

        if (missionEmail) {
          setTimeout(() => {
            addEmail(missionEmail)
            playSound("notification")
          }, 1000)
        }
      }
    }, 3000)
  },
  [addTerminalLog, addEmail, setAriaProcessing, openAriaWindow, playSound]
  )

  return (
    <GameContext.Provider
value={{
  ...state,
  addTerminalLog,
  addTerminalLogs,
  setAriaProcessing,
  unlockStage,
  setTimeRemaining,
  startTimer,
  stopTimer,
  acceptMission,
  sendHint,
  addEmail,
  markEmailRead,
  markEmailSubmitted,
  toggleSound,
  openAriaWindow,
  setAriaWindowOpen,
  playSound,
  validateStage1,
  validateStage2,
  validateStage3,
  validateStage4,
  validateStage1Sentence,
  triggerAriaResponse,
  verifyFlagSubmission,
  clearPendingFlagVerification,
  }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error("useGame must be used within a GameProvider")
  }
  return context
}
