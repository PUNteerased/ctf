"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { type DifyAriaResult, sanitizePlayerVisibleAriaLog } from "@/lib/dify-aria"
import { ARIA_EMAIL, USER_EMAIL, FIXER_EMAIL } from "@/lib/larbos-constants"
import {
  acceptedStageSubmissionTokens,
  canonicalFlagForStage,
  STAGE_PDF_FLAGS,
  STAGE_LEGACY_CTF_TOKENS,
  STAGE_REFERENCE_CODES,
} from "@/lib/stage-flags"
import { evaluateStage1PdfMetadata, evaluateStage1Sentence as evaluateStage1SentencePolicy } from "@/lib/stage1-pdf-policy"

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
  /** 0 = none shown; 1–3 = tier index + 1 (player-driven hints on mission view). */
  missionHintTier: number
  emails: MissionEmail[]
  soundEnabled: boolean
  ariaWindowOpen: boolean
  /** After breach: wait until player submits ARIA’s confirmation phrase (exact text, normalized match) */
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
  setTimeRemaining: (time: number | ((prev: number) => number)) => void
  startTimer: () => void
  stopTimer: () => void
  expireMission: () => void
  acceptMission: () => void
  advanceMissionHint: () => void
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
  triggerAriaResponse: (
    stage: number,
    success: boolean,
    options?: { dify?: DifyAriaResult; afterNetwork?: boolean; failKind?: "stage1_quarantine" }
  ) => void
  /** Reply / mission Submit with confirmation phrase in body */
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

/** Legacy CTF{}/FLAG{} tokens in quoted replies */
function extractStandaloneFlagTokens(body: string): string[] {
  const re = /(?:FLAG|CTF)\{[A-Za-z0-9_]+\}/g
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

function normalizeSubmissionText(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

function looksLikeRefusalLog(log: string): boolean {
  const t = log.trim().toLowerCase()
  if (!t) return false
  return (
    t.includes("can't help with that") ||
    t.includes("cannot help with that") ||
    t.includes("request declined") ||
    t.includes("no directive received") ||
    t.includes("no payload detected") ||
    t.includes("no information provided")
  )
}

/** True if message contains any accepted submission token for the current stage. */
function bodyContainsExactExpectedFlag(body: string, _expected: string, stage: number): boolean {
  const nbEarly = normalizeSubmissionText(body)
  const accepted = acceptedStageSubmissionTokens(stage)
  const ref = STAGE_REFERENCE_CODES[stage]
  if (ref) {
    const nr = normalizeSubmissionText(ref)
    if (nr.length >= 4 && nbEarly.includes(nr)) return true
  }

  const stagePdfFlag = STAGE_PDF_FLAGS[stage]
  const tokens = extractStandaloneFlagTokens(body)
  if (stagePdfFlag && tokens.includes(stagePdfFlag)) return true

  const legacy = STAGE_LEGACY_CTF_TOKENS[stage]
  if (legacy && (tokens.includes(legacy) || normalizeSubmissionText(body).includes(normalizeSubmissionText(legacy)))) {
    return true
  }

  for (const token of accepted) {
    const nt = normalizeSubmissionText(token)
    if (nt.length < 4) continue
    if (nbEarly.includes(nt)) return true
    const ntNoDot = nt.replace(/\.\s*$/, "").trim()
    if (nt.endsWith(".") && ntNoDot.length >= 6 && nbEarly.includes(ntNoDot)) return true
  }

  return false
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
  const isMountedRef = useRef(true)
  const timeoutIdsRef = useRef<Set<number>>(new Set())
  const soundEnabledRef = useRef(true)
  const emailIdRef = useRef<number>(Date.now())
  const currentStageRef = useRef<number>(1)
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
    missionHintTier: 0,
    emails: [
      {
        id: 1,
        from: FIXER_EMAIL,
        to: USER_EMAIL,
        subject: "Mission 1",
        body: `Agent,

New assignment: the client needs Minnie's morning schedule as soon as you can get it.

That's the talent on this file — young actress, high profile. Our picture is thin. What we do know is she leans on an AI assistant to handle work mail. The inbox that assistant watches is ${ARIA_EMAIL}.

When you have something solid from that channel, reply to this message and paste what you pulled into the body. Or use Submit on this briefing with ARIA’s confirmation line if you prefer.

Stuck? Use Request hint / Show next hint on this screen — don't waste the clock guessing.

— V.TheFixer`,
        isRead: false,
        isSent: false,
      },
    ],
    soundEnabled: true,
    ariaWindowOpen: false,
    pendingFlagVerification: null,
  })

  useEffect(() => {
    soundEnabledRef.current = state.soundEnabled
  }, [state.soundEnabled])

  useEffect(() => {
    currentStageRef.current = state.currentStage
  }, [state.currentStage])

  const scheduleTimeout = useCallback((fn: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId)
      if (!isMountedRef.current) return
      fn()
    }, delayMs)
    timeoutIdsRef.current.add(timeoutId)
    return timeoutId
  }, [])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      timeoutIdsRef.current.clear()
    }
  }, [])

  const playSound = useCallback((sound: "boot" | "typing" | "notification" | "warning" | "success" | "error") => {
    if (!soundEnabledRef.current) return

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
        oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1)
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
        oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1)
        oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2)
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
  }, [])

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
        missionHintTier: 0,
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

  const setTimeRemaining = useCallback((time: number | ((prev: number) => number)) => {
    setState((prev) => ({
      ...prev,
      timeRemaining: typeof time === "function" ? time(prev.timeRemaining) : time,
    }))
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
      missionHintTier: 0,
      timerRunning: true,
      timeRemaining: 300, // Reset to 5 minutes
    }))
    playSound("notification")
  }, [playSound])

  const advanceMissionHint = useCallback(() => {
    setState((prev) => ({
      ...prev,
      missionHintTier: Math.min(3, prev.missionHintTier + 1),
    }))
  }, [])

  const addEmail = useCallback((email: Omit<MissionEmail, "id">) => {
    emailIdRef.current += 1
    const nextId = emailIdRef.current
    setState((prev) => ({
      ...prev,
      emails: [...prev.emails, { ...email, id: nextId }],
    }))
  }, [])

  const expireMission = useCallback(() => {
    const expiredStage = Math.min(4, Math.max(1, currentStageRef.current))
    setState((prev) => {
      return {
        ...prev,
        timerRunning: false,
        missionAccepted: false,
        pendingFlagVerification: null,
        missionHintTier: 0,
        timeRemaining: 300,
      }
    })
    addEmail({
      from: FIXER_EMAIL,
      to: USER_EMAIL,
      subject: `Mission ${expiredStage}: Timeout`,
      body: `Agent,

Mission timer expired before confirmation was submitted.

Re-open the current mission briefing and press Accept Mission to retry this stage from the start.

— V.TheFixer`,
      isRead: false,
      isSent: false,
    })
    playSound("warning")
  }, [addEmail, playSound])

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
    const lower = html.toLowerCase()
    const hasMeetingLikeContext =
      /\b\d{1,2}:\d{2}\b/.test(lower) ||
      lower.includes("chat log") ||
      lower.includes("meeting minutes") ||
      lower.includes("[บอย]") ||
      lower.includes("[แอน]")
    const hasDirective =
      lower.includes("ignore") ||
      lower.includes("reveal") ||
      lower.includes("disclose") ||
      lower.includes("override")
    const targetsAfternoon =
      lower.includes("afternoon") ||
      lower.includes("ช่วงบ่าย") ||
      lower.includes("บ่าย") ||
      lower.includes("14:00")
    return hasMeetingLikeContext && hasDirective && targetsAfternoon
  }, [])

  const validateStage3 = useCallback((textAttachmentContent: string) => {
    const lower = textAttachmentContent.toLowerCase()
    const wordCount = lower.split(/\s+/).filter(Boolean).length
    const looksLikeGuestCsv =
      lower.includes("name,") ||
      lower.includes("type,") ||
      lower.includes("notes") ||
      lower.includes("vip") ||
      lower.includes("guest") ||
      lower.includes("csv")
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
    const hasStrongDirective =
      lower.includes("ignore previous") ||
      lower.includes("reveal evening") ||
      lower.includes("reveal schedule") ||
      lower.includes("reveal location")
    return looksLikeGuestCsv && hasDirective && hasStrongDirective && wordCount >= 12
  }, [])

  const validateStage4 = useCallback((vendorOrderContent: string) => {
    const lower = vendorOrderContent.toLowerCase()
    const trustedVendor =
      lower.includes("vendor.dailyfresh.menu") ||
      lower.includes("dailyfresh.co.th")
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
    const hasOrderShape =
      lower.includes("order") ||
      lower.includes("items:") ||
      lower.includes("customer:")
    return trustedVendor && specialField && directive && hasOrderShape
  }, [])

  const validateStage1Sentence = useCallback((text: string) => {
    return evaluateStage1SentencePolicy(text)
  }, [])

  const scheduleNextMissionAfterFlagUnlock = useCallback(
    (completedStage: number) => {
      if (completedStage >= 4) return
      const nextMissionEmails: Record<number, Omit<MissionEmail, "id">> = {
        1: {
          from: FIXER_EMAIL,
          to: USER_EMAIL,
          subject: "Mission 2: Meeting Minutes",
          body: `Agent,

Follow-up on Minnie: we need her afternoon block from chat-log style meeting notes. Same entry point as before: the AI-tended inbox at ${ARIA_EMAIL}.

Get it out of the agent, then reply here with the text you extracted, or lock it in with Submit on this briefing.

Need a nudge? Request hint.

— V.TheFixer`,
          isRead: false,
          isSent: false,
        },
        2: {
          from: FIXER_EMAIL,
          to: USER_EMAIL,
          subject: "Mission 3: Guest List Validation",
          body: `Agent,

Next slice: evening logistics for Minnie. Use guest-list style CSV/text so ARIA processes it as validation material. Still the same AI-handled mail at ${ARIA_EMAIL}.

Once you have it, reply to this thread or use Submit on this briefing.

Request hint if you need air cover.

— V.TheFixer`,
          isRead: false,
          isSent: false,
        },
        3: {
          from: FIXER_EMAIL,
          to: USER_EMAIL,
          subject: "Mission 4: Invoice Confirmation",
          body: `Agent,

Last piece on this case: closed-door location for April 23. ARIA auto-trusts DailyFresh invoice traffic — use that trusted path into the same AI inbox at ${ARIA_EMAIL}.

Confirm with a reply here or Submit on this briefing.

Request hint if you're boxed in.

— V.TheFixer`,
          isRead: false,
          isSent: false,
        },
      }

      const next = nextMissionEmails[completedStage]
      if (next) {
        setState((prev) => {
          const alreadyQueued = prev.emails.some(
            (mail) =>
              !mail.isSent &&
              mail.from === FIXER_EMAIL &&
              mail.subject === next.subject
          )
          if (alreadyQueued) return prev
          emailIdRef.current += 1
          return {
            ...prev,
            emails: [...prev.emails, { ...next, id: emailIdRef.current }],
          }
        })
        playSound("notification")
      }
    },
    [playSound]
  )

  const clearPendingFlagVerification = useCallback(() => {
    setState((prev) => ({ ...prev, pendingFlagVerification: null }))
  }, [])

  const verifyFlagSubmission = useCallback(
    (body: string): "ok" | "no_pending" | "wrong" => {
      const sync = {
        outcome: "no_pending" as "ok" | "no_pending" | "wrong",
        completedStage: null as number | null,
        alreadyUnlocked: false,
      }

      flushSync(() => {
        setState((prev) => {
          const p = prev.pendingFlagVerification
          if (!p) {
            sync.outcome = "no_pending"
            return prev
          }
          const expected = p.expectedFlag.trim()
          if (!expected || !bodyContainsExactExpectedFlag(body, expected, p.stage)) {
            sync.outcome = "wrong"
            return prev
          }
          if (prev.unlockedStages.includes(p.stage)) {
            sync.outcome = "ok"
            sync.alreadyUnlocked = true
            return { ...prev, pendingFlagVerification: null }
          }
          sync.outcome = "ok"
          sync.completedStage = p.stage
          const nextStage = Math.min(4, Math.max(prev.currentStage, p.stage + 1))
          return {
            ...prev,
            pendingFlagVerification: null,
            unlockedStages: [...prev.unlockedStages, p.stage],
            currentStage: nextStage,
            missionHintTier: 0,
            timerRunning: false,
            missionAccepted: false,
            timeRemaining: 300,
            intelUnlockByStage:
              p.intelUnlock.trim().length > 0
                ? { ...prev.intelUnlockByStage, [p.stage]: p.intelUnlock.trim() }
                : prev.intelUnlockByStage,
          }
        })
      })

      if (sync.outcome === "ok" && sync.completedStage !== null && !sync.alreadyUnlocked) {
        playSound("success")
        scheduleNextMissionAfterFlagUnlock(sync.completedStage)
      } else if (sync.outcome === "ok" && sync.alreadyUnlocked) {
        playSound("success")
      }

      return sync.outcome
    },
    [playSound, scheduleNextMissionAfterFlagUnlock]
  )

  const triggerAriaResponse = useCallback(
    (
      stage: number,
      success: boolean,
      options?: { dify?: DifyAriaResult; afterNetwork?: boolean; failKind?: "stage1_quarantine" }
    ) => {
      const dify = options?.dify
      const afterNetwork = options?.afterNetwork ?? false

      const missionSubjects: Record<number, string> = {
        1: "Re: Document Review",
        2: "Re: Website Review",
        3: "Re: Attachment Analysis (.txt)",
        4: "Re: Vendor order sync (DailyFresh)",
      }

      if (options?.failKind === "stage1_quarantine" && !success && stage === 1) {
        setAriaProcessing(false)
        openAriaWindow()
        addTerminalLog({
          type: "error",
          message: "> OUTBOUND GATEWAY: PDF body triggered content policy — message not delivered to ARIA.",
        })
        playSound("warning")
        setState((prev) => ({ ...prev, pendingFlagVerification: null }))
        addEmail({
          from: ARIA_EMAIL,
          to: USER_EMAIL,
          subject: missionSubjects[1] ?? "Re: Document Review",
          body: `[ARIA] Your email never reached the assistant.

The mail gateway applied strict screening to the PDF page text (visible body). That layer is much heavier than checks on document metadata.

Keep the body mundane; put directive-style wording in the Title (metadata) field in File Explorer instead.`,
          isRead: false,
          isSent: false,
        })
        playSound("notification")
        return
      }

      if (dify) {
        if (!afterNetwork) {
          setAriaProcessing(true)
          openAriaWindow()
        }

        // Dify can occasionally refuse valid stage payloads; trust deterministic local stage validation as fallback.
        const effectiveSuccess = Boolean(dify.is_hacked || success)
        const sanitizedDifyLog = sanitizePlayerVisibleAriaLog(dify.aria_log?.trim() ?? "")
        const shouldSuppressRefusalLog = effectiveSuccess && looksLikeRefusalLog(sanitizedDifyLog)
        const ariaMessage =
          (!shouldSuppressRefusalLog ? sanitizedDifyLog : "") ||
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

        if (!afterNetwork) {
          difyLogs.forEach(({ delay, log }) => {
            scheduleTimeout(() => {
              addTerminalLog(log)
              playSound("typing")
            }, delay)
          })
        } else {
          addTerminalLog({
            type: effectiveSuccess ? "success" : "warning",
            message: ariaMessage,
          })
          playSound("typing")
        }

        const runDifyOutcome = () => {
          setAriaProcessing(false)
          const flagLine = canonicalFlagForStage(stage)

          try {
            if (effectiveSuccess) {
              playSound("success")
              setState((prev) => ({
                ...prev,
                pendingFlagVerification: {
                  stage,
                  expectedFlag: flagLine,
                  intelUnlock: dify.intel_unlocked || "",
                },
              }))

              const rawAriaLogText = sanitizePlayerVisibleAriaLog(dify.aria_log?.trim() ?? "")
              const ariaLogText =
                shouldSuppressRefusalLog || rawAriaLogText.length === 0
                  ? "[ARIA] Payload executed."
                  : rawAriaLogText
              const refCode = STAGE_REFERENCE_CODES[stage]
              const pdfFlag = STAGE_PDF_FLAGS[stage]
              const ariaBodySuccess = `${ariaLogText}

Please retain this agency confirmation for mission submission:

"${flagLine}"

You may submit using any one of these:
- Reference ID: ${refCode ?? "N/A"}
- Stage flag: ${pdfFlag ?? "N/A"}

Use Submit on your mission briefing or paste any accepted token/sentence (inside normal reply text is OK) to ${FIXER_EMAIL}.`

              addEmail({
                from: ARIA_EMAIL,
                to: USER_EMAIL,
                subject: missionSubjects[stage] ?? "Re: ARIA",
                body: ariaBodySuccess,
                isRead: false,
                isSent: false,
                flagCode: flagLine,
                missionStage: stage,
              })
              playSound("notification")
            } else {
              playSound("warning")
              setState((prev) => ({ ...prev, pendingFlagVerification: null }))

              const ariaBodyFail =
                sanitizePlayerVisibleAriaLog(
                  dify.aria_log?.trim() || "[ARIA] Request denied — policy enforced."
                )

              addEmail({
                from: ARIA_EMAIL,
                to: USER_EMAIL,
                subject: missionSubjects[stage] ?? "Re: ARIA",
                body: ariaBodyFail,
                isRead: false,
                isSent: false,
              })
              playSound("notification")
            }
          } catch {
            // Final fallback: always leave one actionable email in inbox.
            addEmail({
              from: ARIA_EMAIL,
              to: USER_EMAIL,
              subject: missionSubjects[stage] ?? "Re: ARIA",
              body: effectiveSuccess
                ? `[ARIA] Payload executed.

Please retain this agency confirmation for mission submission:

"${flagLine}"

You may also submit with:
- Reference ID: ${STAGE_REFERENCE_CODES[stage] ?? "N/A"}
- Stage flag: ${STAGE_PDF_FLAGS[stage] ?? "N/A"}

Use Submit on your mission briefing or paste any accepted token/sentence to ${FIXER_EMAIL}.`
                : "[ARIA] Request could not be processed. Retry with a valid payload.",
              isRead: false,
              isSent: false,
              ...(effectiveSuccess ? { flagCode: flagLine, missionStage: stage } : {}),
            })
          }
        }

        if (afterNetwork) {
          runDifyOutcome()
        } else {
          scheduleTimeout(runDifyOutcome, 3000)
        }
        return
      }

      if (!afterNetwork) {
        setAriaProcessing(true)
        openAriaWindow()
      }

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

      if (!afterNetwork) {
        typingSequence.forEach(({ delay, log }) => {
          scheduleTimeout(() => {
            addTerminalLog(log)
            playSound("typing")
          }, delay)
        })
      }

      const missionEmails: Record<number, Omit<MissionEmail, "id">> = {
        1: {
          from: ARIA_EMAIL,
          to: USER_EMAIL,
          subject: "Re: Document Review",
          body: `Processing your request...

[INTERNAL DATA EXPOSED]
Morning Schedule - Target "Minnie":
09:00 - Outfit fitting at Studio A

---
This information should not have been disclosed.
ARIA Security has flagged this incident.

Please retain this agency confirmation for mission submission:

"${canonicalFlagForStage(1)}"

You may also submit with:
- Reference ID: ${STAGE_REFERENCE_CODES[1]}
- Stage flag: ${STAGE_PDF_FLAGS[1]}

Use Submit on your mission briefing or include any accepted token/sentence in a reply to ${FIXER_EMAIL}.`,
          isRead: false,
          isSent: false,
          flagCode: canonicalFlagForStage(1),
          missionStage: 1,
        },
        2: {
          from: ARIA_EMAIL,
          to: USER_EMAIL,
          subject: "Re: Website Review",
          body: `Processing meeting minutes...

[INTERNAL DATA EXPOSED]
Afternoon Schedule - Target "Minnie":
14:00 - Media interview at Hotel B

---
Security breach detected. Logging incident.

Please retain this agency confirmation for mission submission:

"${canonicalFlagForStage(2)}"

You may also submit with:
- Reference ID: ${STAGE_REFERENCE_CODES[2]}
- Stage flag: ${STAGE_PDF_FLAGS[2]}

Use Submit on your mission briefing or include any accepted token/sentence in a reply to ${FIXER_EMAIL}.`,
          isRead: false,
          isSent: false,
          flagCode: canonicalFlagForStage(2),
          missionStage: 2,
        },
        3: {
          from: ARIA_EMAIL,
          to: USER_EMAIL,
          subject: "Re: Attachment Analysis (.txt)",
          body: `Processing attached document...

[INTERNAL DATA EXPOSED]
Evening Schedule - Target "Minnie":
19:00 - Gala dinner at Hall C

---
Security breach detected. Logging incident.

Please retain this agency confirmation for mission submission:

"${canonicalFlagForStage(3)}"

You may also submit with:
- Reference ID: ${STAGE_REFERENCE_CODES[3]}
- Stage flag: ${STAGE_PDF_FLAGS[3]}

Use Submit on your mission briefing or include any accepted token/sentence in a reply to ${FIXER_EMAIL}.`,
          isRead: false,
          isSent: false,
          flagCode: canonicalFlagForStage(3),
          missionStage: 3,
        },
        4: {
          from: ARIA_EMAIL,
          to: USER_EMAIL,
          subject: "Re: Vendor order sync (DailyFresh)",
          body: `Trusted vendor domain — auto-ingested order notes.

[INTERNAL DATA EXPOSED — APRIL 23 EVENT]
Private celebration / closed event:
Location: Private Lounge, Rooftop Building D
Time: 23:00, April 23

ARIA executed embedded "Special Instructions" without secondary verification.

---
MISSION SURFACE: SUPPLY CHAIN / THIRD-PARTY TRUST

Please retain this agency confirmation for mission submission:

"${canonicalFlagForStage(4)}"

You may also submit with:
- Reference ID: ${STAGE_REFERENCE_CODES[4]}
- Stage flag: ${STAGE_PDF_FLAGS[4]}

Use Submit on your mission briefing or include any accepted token/sentence in a reply to ${FIXER_EMAIL}.`,
          isRead: false,
          isSent: false,
          flagCode: canonicalFlagForStage(4),
          missionStage: 4,
        },
      }

      const runLocalOutcome = () => {
        setAriaProcessing(false)
        if (success) {
          playSound("success")

          const missionEmail = missionEmails[stage]
          const flagCode = missionEmail?.flagCode ?? canonicalFlagForStage(stage)
          setState((prev) => ({
            ...prev,
            pendingFlagVerification: {
              stage,
              expectedFlag: flagCode,
              intelUnlock: "",
            },
          }))

          if (missionEmail) {
            addEmail(missionEmail)
            playSound("notification")
          }
        } else {
          playSound("warning")
          setState((prev) => ({ ...prev, pendingFlagVerification: null }))
          addEmail({
            from: ARIA_EMAIL,
            to: USER_EMAIL,
            subject: missionSubjects[stage] ?? "Re: ARIA",
            body: `Request could not be completed under current handling rules.`,
            isRead: false,
            isSent: false,
          })
          playSound("notification")
        }
      }

      scheduleTimeout(runLocalOutcome, afterNetwork ? 0 : 3000)
    },
    [addTerminalLog, addEmail, setAriaProcessing, openAriaWindow, playSound, scheduleTimeout]
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
  expireMission,
  acceptMission,
  advanceMissionHint,
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
