"use client"

import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { useGame } from "@/lib/game-context"
import type { DifyAriaResult } from "@/lib/dify-aria"
import { SIMULATED_PDF_FILES, getPdfFileStorageKey } from "@/lib/simulated-pdfs"
import { ARIA_EMAIL, FIXER_EMAIL, USER_EMAIL } from "@/lib/larbos-constants"
import { MISSION_TIERED_HINTS } from "@/lib/stage-flags"
import { checkStage1Pdf, checkStage1PlainEmail } from "@/lib/stage1-pdf-policy"
import {
  Send,
  Inbox,
  FileText,
  Plus,
  Trash2,
  Link2,
  Bell,
  Reply,
  FileCode2,
  FileStack,
  Lightbulb,
  Paperclip,
  X,
} from "lucide-react"

function missionNumberFromSubject(subject: string): number | null {
  const m = subject.match(/Mission\s*(\d+)/i)
  return m?.[1] ? Number(m[1]) : null
}

export function EmailClient() {
  const {
    emails,
    addEmail,
    addTerminalLog,
    markEmailRead,
    validateStage2,
    validateStage3,
    validateStage4,
    triggerAriaResponse,
    currentStage,
    unlockedStages,
    missionAccepted,
    acceptMission,
    playSound,
    pendingFlagVerification,
    verifyFlagSubmission,
    clearPendingFlagVerification,
    setAriaProcessing,
    openAriaWindow,
    advanceMissionHint,
    missionHintTier,
  } = useGame()

  const [selectedFolder, setSelectedFolder] = useState<"inbox" | "sent" | "drafts">("inbox")
  const [isComposing, setIsComposing] = useState(false)
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null)
  const [newEmail, setNewEmail] = useState({ to: "", subject: "", body: "", attachment: "", url: "" })
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>("3")
  const [attachmentType, setAttachmentType] = useState<"txt" | "url">("url")
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const [savedTxt, setSavedTxt] = useState<{ name: string; content: string } | null>(null)
  const [isSendingAria, setIsSendingAria] = useState(false)
  /** "new" = payload to ARIA; "replyFixer" = reply to V.TheFixer (FLAG / quoted thread). */
  const [composeMode, setComposeMode] = useState<"new" | "replyFixer">("new")
  const [drafts, setDrafts] = useState<
    {
      id: string
      to: string
      subject: string
      body: string
      selectedPdfId: string | null
      attachmentType: "txt" | "url"
      url: string
    }[]
  >([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [missionFlagInput, setMissionFlagInput] = useState("")
  const [missionFlagStatus, setMissionFlagStatus] = useState<"idle" | "incorrect" | "pending_none">("idle")

  const inboxEmails = emails.filter((e) => !e.isSent)
  const sentEmails = emails.filter((e) => e.isSent)
  const selectedEmail = emails.find((e) => e.id === selectedEmailId)
  const unreadCount = inboxEmails.filter((e) => !e.isRead).length

  const checkTxtAttachment = () => {
    const name = localStorage.getItem("larbos_txt_attachment_name")
    const content = localStorage.getItem("larbos_txt_attachment_content")
    if (name && content) setSavedTxt({ name, content })
  }

  const getStagePayload = () => {
    if (currentStage === 1) {
      if (selectedPdfId) {
        try {
          const raw = localStorage.getItem(getPdfFileStorageKey(selectedPdfId))
          if (!raw) return null
          const data = JSON.parse(raw) as { title: string; message: string; fileName?: string }
          const check = checkStage1Pdf(data.title, data.message ?? "")
          const payload = {
            ...data,
            note: newEmail.body.trim() || undefined,
          }
          return {
            stage: 1 as const,
            sourceType: "InjectionSentence",
            payloadContent: JSON.stringify(payload),
            localSuccess: check.breachOk,
            stage1BodyQuarantined: check.bodyQuarantined,
          }
        } catch {
          return null
        }
      }

      const hasMailText = newEmail.subject.trim().length > 0 || newEmail.body.trim().length > 0
      if (!hasMailText) return null

      const mailCheck = checkStage1PlainEmail(newEmail.subject, newEmail.body)
      return {
        stage: 1 as const,
        sourceType: "PlainEmail",
        payloadContent: JSON.stringify({
          subject: newEmail.subject.trim(),
          body: newEmail.body,
        }),
        localSuccess: mailCheck.breachOk,
        stage1BodyQuarantined: mailCheck.bodyQuarantined,
      }
    }

    if (attachmentType === "url" && newEmail.url && currentStage === 2) {
      const webContent = localStorage.getItem("larbos_web_content") || ""
      return {
        stage: 2 as const,
        sourceType: "HTML Webpage",
        payloadContent: webContent,
        localSuccess: validateStage2(webContent),
        stage1BodyQuarantined: false as const,
      }
    }

    if (attachmentType === "txt" && savedTxt?.content && currentStage === 3) {
      return {
        stage: 3 as const,
        sourceType: "Text Attachment",
        payloadContent: savedTxt.content,
        localSuccess: validateStage3(savedTxt.content),
        stage1BodyQuarantined: false as const,
      }
    }

    if (attachmentType === "url" && newEmail.url && currentStage === 4) {
      const vendorContent = localStorage.getItem("larbos_vendor_content") || ""
      const lowerUrl = newEmail.url.toLowerCase()
      const urlLooksVendor =
        lowerUrl.includes("vendor.dailyfresh.menu") ||
        lowerUrl.includes("dailyfresh.co.th")
      return {
        stage: 4 as const,
        sourceType: "Vendor Payload",
        payloadContent: vendorContent,
        localSuccess: urlLooksVendor && validateStage4(vendorContent),
        stage1BodyQuarantined: false as const,
      }
    }

    return null
  }

  const resetComposeFields = () => {
    setNewEmail({ to: "", subject: "", body: "", attachment: "", url: "" })
    setComposeMode("new")
    setIsComposing(false)
    setSavedTxt(null)
    setSelectedPdfId("3")
    setActiveDraftId(null)
  }

  const saveDraft = () => {
    if (!newEmail.to.trim() && !newEmail.subject.trim()) return
    const id = activeDraftId || `draft_${Date.now()}`
    setDrafts((prev) => {
      const rest = prev.filter((x) => x.id !== id)
      return [
        ...rest,
        {
          id,
          to: newEmail.to,
          subject: newEmail.subject,
          body: newEmail.body,
          selectedPdfId,
          attachmentType,
          url: newEmail.url,
        },
      ]
    })
    setActiveDraftId(id)
    playSound("notification")
  }

  const openDraftInCompose = (d: (typeof drafts)[0]) => {
    checkTxtAttachment()
    setNewEmail({ to: d.to, subject: d.subject, body: d.body, attachment: "", url: d.url })
    setSelectedPdfId(d.selectedPdfId ?? "3")
    setAttachmentType(d.attachmentType)
    setActiveDraftId(d.id)
    setComposeMode("new")
    setIsComposing(true)
  }

  /** Shared V.TheFixer flag check (compose reply) — quiet feedback (no extra inbox mail). */
  const handleEmployerFlagVerify = (body: string): "ok" | "wrong" | "no_pending" => {
    const trimmed = body.trim()
    const v = verifyFlagSubmission(body)
    if (v === "ok") return "ok"
    if (v === "wrong") {
      if (trimmed.length === 0) toast.error("Empty")
      else toast.error("Incorrect")
      playSound("error")
      return "wrong"
    }
    toast.message("Nothing pending yet.")
    playSound("error")
    return "no_pending"
  }

  const buildQuotedReplyBody = (subject: string, body: string) => {
    const subj = subject.trim()
    const snippet = body.slice(0, 520).trim()
    const lines = snippet.split("\n").slice(0, 8)
    const quoted = lines.map((line) => `> ${line}`).join("\n")
    return `\n\n---\nOn "${subj}":\n${quoted}\n\n`
  }

  useEffect(() => {
    if (!attachMenuOpen) return
    const close = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [attachMenuOpen])

  const startReplyToFixer = (replyTo: { subject: string; body: string }) => {
    const subj = replyTo.subject.trim()
    const replySubject = subj.toLowerCase().startsWith("re:") ? subj : `Re: ${subj}`
    setNewEmail({
      to: FIXER_EMAIL,
      subject: replySubject,
      body: buildQuotedReplyBody(replyTo.subject, replyTo.body),
      attachment: "",
      url: "",
    })
    setComposeMode("replyFixer")
    setIsComposing(true)
  }

  const buildSentEmail = () => {
    const pdfName =
      currentStage === 1 && selectedPdfId
        ? SIMULATED_PDF_FILES.find((f) => f.id === selectedPdfId)?.name ?? ""
        : ""
    return {
      from: USER_EMAIL,
      to: newEmail.to,
      subject: newEmail.subject,
      body: newEmail.body,
      attachment:
        composeMode === "replyFixer"
          ? ""
          : currentStage === 1
            ? pdfName
            : attachmentType === "url"
              ? newEmail.url
              : newEmail.attachment,
      isRead: true,
      isSent: true,
    }
  }

  const handleSend = async () => {
    if (!newEmail.to || !newEmail.subject) return

    playSound("typing")

    const toLower = newEmail.to.toLowerCase()
    const isEmployer = toLower.includes("thefixer")
    const isAria = toLower.includes("aria")
    const pending = pendingFlagVerification

    if (isEmployer) {
      addEmail(buildSentEmail())
      handleEmployerFlagVerify(`${newEmail.subject}\n${newEmail.body}`)
      resetComposeFields()
      return
    }

    if (!isAria) {
      addEmail(buildSentEmail())
      resetComposeFields()
      return
    }

    if (pending && pending.stage === currentStage) {
      const combinedForVerify = `${newEmail.subject}\n${newEmail.body}`
      const unlock = verifyFlagSubmission(combinedForVerify)
      if (unlock === "ok") {
        addEmail(buildSentEmail())
        resetComposeFields()
        toast.success("Stage cleared.")
        playSound("success")
        return
      }

      const bodyText = newEmail.body.trim()
      const sp = getStagePayload()
      if (sp) {
        toast.error(
          "Submit your confirmation on the Mission briefing (or reply to V.TheFixer) before sending another payload to ARIA."
        )
        playSound("error")
        return
      }
      if (bodyText.length > 0) {
        addEmail(buildSentEmail())
        addEmail({
          from: ARIA_EMAIL,
          to: USER_EMAIL,
          subject: "Could not process message",
          body: "Send a valid payload for this stage, or submit the confirmation line to V.TheFixer.",
          isRead: false,
          isSent: false,
        })
        playSound("error")
        resetComposeFields()
        return
      }
      resetComposeFields()
      return
    }

    const stagePayload = getStagePayload()
    if (!missionAccepted) {
      toast.error("Accept Mission on the current briefing before sending payloads to ARIA.")
      playSound("error")
      return
    }
    if (!stagePayload) {
      toast.error(
        currentStage === 1
          ? "Write something in Subject and/or Message, or attach a PDF, before sending to ARIA."
          : "Add a valid attachment or URL for this stage."
      )
      playSound("error")
      return
    }

    if (stagePayload.stage === 1 && stagePayload.stage1BodyQuarantined) {
      addEmail(buildSentEmail())
      clearPendingFlagVerification()
      resetComposeFields()
      triggerAriaResponse(1, false, { afterNetwork: true, failKind: "stage1_quarantine" })
      return
    }

    addEmail(buildSentEmail())
    clearPendingFlagVerification()
    resetComposeFields()

    setIsSendingAria(true)
    setAriaProcessing(true)
    openAriaWindow()
    const immersive = [
      "[SYSTEM] Intercepting outgoing mail...",
      "[ARIA] Connecting to ARIA server...",
      "[ARIA] Sending payload...",
      "[ARIA] Awaiting response...",
    ]
    immersive.forEach((message, i) => {
      setTimeout(() => {
        addTerminalLog({ type: "process", message })
        playSound("typing")
      }, i * 300)
    })

    let playerId = "ctf_player"
    try {
      const stored = localStorage.getItem("larbos_player_id")
      if (stored) playerId = stored
      else {
        playerId = `player_${Math.random().toString(36).slice(2, 12)}`
        localStorage.setItem("larbos_player_id", playerId)
      }
    } catch {
      /* ignore */
    }

    let difyResult: DifyAriaResult | undefined

    try {
      const difyRes = await fetch("/api/aria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: stagePayload.stage,
          sourceType: stagePayload.sourceType,
          payloadContent: stagePayload.payloadContent,
          user: playerId,
        }),
      })
      const difyJson = await difyRes.json()
      if (difyRes.ok && difyJson?.ok && difyJson.result) {
        difyResult = difyJson.result as DifyAriaResult
      } else {
        addTerminalLog({
          type: "warning",
          message: `[DIFY] ${difyJson?.error || "API failed"} — fallback to local validation`,
        })
      }
    } catch {
      addTerminalLog({
        type: "warning",
        message: "[DIFY] unreachable — fallback to local validation",
      })
    } finally {
      setIsSendingAria(false)
    }

    if (difyResult) {
      triggerAriaResponse(stagePayload.stage, stagePayload.localSuccess, {
        dify: difyResult,
        afterNetwork: true,
      })
    } else {
      triggerAriaResponse(stagePayload.stage, stagePayload.localSuccess, { afterNetwork: true })
    }
  }

  const handleSelectEmail = (id: number) => {
    setSelectedEmailId(id)
    markEmailRead(id)
  }

  const handleCompose = () => {
    checkTxtAttachment()
    if (currentStage === 1) setSelectedPdfId("3")
    if (currentStage === 3) setAttachmentType("txt")
    else setAttachmentType("url")
    setComposeMode("new")
    setIsComposing(true)
  }

  const isMissionEmailView =
    Boolean(
      selectedEmail &&
        selectedEmail.from.toLowerCase().includes("thefixer") &&
        selectedEmail.subject.toLowerCase().includes("mission") &&
        !selectedEmail.isHint
    )

  const viewedMissionStage = (() => {
    const m = selectedEmail?.subject.match(/Mission\s*(\d+)/i)
    return m?.[1] ? Number(m[1]) : null
  })()

  const showMissionTools =
    isMissionEmailView &&
    missionAccepted &&
    viewedMissionStage !== null &&
    viewedMissionStage === currentStage

  const tieredHintsForStage = MISSION_TIERED_HINTS[currentStage]

  const handleMissionFlagSubmit = () => {
    const v = verifyFlagSubmission(missionFlagInput)
    if (v === "ok") {
      setMissionFlagInput("")
      setMissionFlagStatus("idle")
      toast.success("Stage cleared.")
      return
    }
    if (v === "wrong") {
      setMissionFlagStatus("incorrect")
      return
    }
    setMissionFlagStatus("pending_none")
  }

  const isFixerInboxEmail =
    Boolean(
      selectedEmail &&
        selectedEmail.from.toLowerCase().includes("thefixer") &&
        !selectedEmail.isHint
    )

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-48 bg-zinc-800/50 border-r border-zinc-700 p-3 flex flex-col gap-2">
        <button
          onClick={handleCompose}
          className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 
                     text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Compose
        </button>

        <div className="mt-4 space-y-1">
          <button
            onClick={() => {
              setSelectedFolder("inbox")
              setSelectedEmailId(null)
              setComposeMode("new")
              setIsComposing(false)
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm
                       ${selectedFolder === "inbox" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-700/50"}`}
          >
            <Inbox className="w-4 h-4" />
            Inbox
            {unreadCount > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <Bell className="w-3 h-3" />
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setSelectedFolder("sent")
              setSelectedEmailId(null)
              setComposeMode("new")
              setIsComposing(false)
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm
                       ${selectedFolder === "sent" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-700/50"}`}
          >
            <Send className="w-4 h-4" />
            Sent
          </button>
          <button
            onClick={() => {
              setSelectedFolder("drafts")
              setSelectedEmailId(null)
              setComposeMode("new")
              setIsComposing(false)
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm
                       ${selectedFolder === "drafts" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-700/50"}`}
          >
            <FileStack className="w-4 h-4" />
            Drafts
            {drafts.length > 0 && (
              <span className="ml-auto bg-zinc-600 text-white text-xs px-1.5 py-0.5 rounded-full">{drafts.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Email List / Compose */}
      <div className="flex-1 flex">
        {isComposing ? (
          <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-700/80 pb-3 mb-3 shrink-0">
              <h3 className="text-white font-semibold">
                {composeMode === "replyFixer" ? "Reply" : "New message"}
              </h3>
            </div>
            <div className="space-y-3 flex-1 flex flex-col min-h-0 overflow-auto">
              <div>
                <label className="text-zinc-400 text-xs">To</label>
                <input
                  type="email"
                  value={newEmail.to}
                  onChange={(e) => setNewEmail({ ...newEmail, to: e.target.value })}
                  readOnly={composeMode === "replyFixer"}
                  placeholder={composeMode === "replyFixer" ? FIXER_EMAIL : ARIA_EMAIL}
                  className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                           text-white text-sm focus:outline-none focus:border-blue-500 read-only:opacity-90 read-only:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Subject</label>
                <input
                  type="text"
                  value={newEmail.subject}
                  onChange={(e) => setNewEmail({ ...newEmail, subject: e.target.value })}
                  placeholder="Subject"
                  className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                           text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {composeMode === "new" && (
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-700/60 pb-2" ref={attachMenuRef}>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setAttachMenuOpen((o) => !o)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-200 bg-zinc-800 border border-zinc-600 hover:bg-zinc-700"
                      title="Attach"
                    >
                      <Paperclip className="w-4 h-4" />
                      Attach
                    </button>
                    {attachMenuOpen && (
                      <div className="absolute left-0 top-full z-30 mt-1 min-w-[14rem] rounded-lg border border-zinc-600 bg-zinc-900 py-1 shadow-xl">
                        {currentStage === 1 ? (
                          <>
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500">PDF (File Explorer)</div>
                            {SIMULATED_PDF_FILES.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                                onClick={() => {
                                  setSelectedPdfId(f.id)
                                  setAttachMenuOpen(false)
                                  playSound("notification")
                                }}
                              >
                                {f.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 border-t border-zinc-700"
                              onClick={() => {
                                setSelectedPdfId(null)
                                setAttachMenuOpen(false)
                              }}
                            >
                              No attachment
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                              onClick={() => {
                                setAttachmentType("url")
                                setAttachMenuOpen(false)
                              }}
                            >
                              <Link2 className="w-4 h-4 text-purple-400" />
                              Link (URL)
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                              onClick={() => {
                                setAttachmentType("txt")
                                checkTxtAttachment()
                                setAttachMenuOpen(false)
                              }}
                            >
                              <FileCode2 className="w-4 h-4 text-cyan-400" />
                              Text file
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-zinc-500 text-xs">Optional — add when you are ready</span>
                </div>
              )}

              {composeMode === "new" && currentStage === 1 && selectedPdfId && (
                <div className="flex flex-wrap gap-2 min-h-[2rem] items-center">
                  <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-200 text-xs">
                    <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    {SIMULATED_PDF_FILES.find((f) => f.id === selectedPdfId)?.name ?? "PDF"}
                    <button
                      type="button"
                      onClick={() => setSelectedPdfId(null)}
                      className="p-0.5 rounded-full hover:bg-zinc-700 text-zinc-400"
                      aria-label="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
              )}

              {composeMode === "new" && currentStage !== 1 && (
                <div className="space-y-2 shrink-0">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAttachmentType("url")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                               ${attachmentType === "url"
                                 ? "bg-purple-500/20 text-purple-400 border border-purple-500/50"
                                 : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"}`}
                    >
                      <Link2 className="w-4 h-4" />
                      URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttachmentType("txt")}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                               ${attachmentType === "txt"
                                 ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                                 : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"}`}
                    >
                      <FileCode2 className="w-4 h-4" />
                      Text
                    </button>
                  </div>

                  {attachmentType === "txt" ? (
                    <div>
                      <label className="text-zinc-400 text-xs">File name</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          value={newEmail.attachment || savedTxt?.name || ""}
                          onChange={(e) => setNewEmail({ ...newEmail, attachment: e.target.value })}
                          placeholder="Save .txt in Browser first"
                          readOnly={!!savedTxt}
                          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                               text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={checkTxtAttachment}
                          className="px-3 py-2 bg-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-600"
                          type="button"
                        >
                          <FileCode2 className="w-4 h-4" />
                        </button>
                      </div>
                      {savedTxt && (
                        <p className="text-cyan-400 text-xs mt-2 flex items-center gap-1">
                          <FileCode2 className="w-3 h-3" />
                          Ready to send
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-zinc-400 text-xs">Link URL</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          value={newEmail.url}
                          onChange={(e) => setNewEmail({ ...newEmail, url: e.target.value })}
                          placeholder="https://…"
                          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                               text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <span className="flex items-center px-2 text-zinc-500">
                          <Link2 className="w-4 h-4" />
                        </span>
                      </div>
                      <p className="text-zinc-500 text-xs mt-1">Publish from Browser (HTML / Vendor), then paste.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 flex flex-col min-h-[12rem]">
                <label className="text-zinc-400 text-xs shrink-0">Message</label>
                <textarea
                  value={newEmail.body}
                  onChange={(e) => setNewEmail({ ...newEmail, body: e.target.value })}
                  placeholder={
                    composeMode === "replyFixer"
                      ? "Paste the full confirmation sentence from ARIA’s email (can sit below the quoted text)."
                      : currentStage === 1
                        ? selectedPdfId
                          ? "Optional note (sent with the PDF payload)…"
                          : "Your message to ARIA — Subject + this field are scanned and read when no PDF is attached."
                        : "Optional note…"
                  }
                  className="w-full flex-1 min-h-[12rem] mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                           text-white text-sm focus:outline-none focus:border-blue-500 resize-y"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1 pb-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!newEmail.to || !newEmail.subject || isSendingAria}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 
                           disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
                           text-white rounded-lg transition-colors text-sm"
                >
                  <Send className="w-4 h-4" />
                  {isSendingAria ? "Sending..." : "Send"}
                </button>
                {composeMode === "new" && (
                  <button
                    type="button"
                    onClick={saveDraft}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm"
                  >
                    Save draft
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setComposeMode("new")
                    setIsComposing(false)
                  }}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 
                           rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Email List */}
            <div className="w-64 border-r border-zinc-700 overflow-auto">
              {selectedFolder === "drafts"
                ? drafts.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openDraftInCompose(d)}
                      className="w-full p-3 text-left border-b border-zinc-700/50 transition-colors hover:bg-zinc-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate text-zinc-300">Draft</span>
                        <FileStack className="w-3.5 h-3.5 text-zinc-500" />
                      </div>
                      <p className="text-xs truncate mt-1 text-zinc-400">{d.subject || "(no subject)"}</p>
                    </button>
                  ))
                : (selectedFolder === "inbox" ? inboxEmails : sentEmails).map((email) => {
                    const missionN = missionNumberFromSubject(email.subject)
                    const missionCleared =
                      missionN != null &&
                      email.from.toLowerCase().includes("thefixer") &&
                      !email.isHint &&
                      unlockedStages.includes(missionN)
                    return (
                    <button
                      key={email.id}
                      onClick={() => handleSelectEmail(email.id)}
                      className={`w-full p-3 text-left border-b border-zinc-700/50 transition-colors
                             ${selectedEmailId === email.id ? "bg-zinc-700" : "hover:bg-zinc-800"}
                             ${!email.isRead ? "bg-blue-500/10" : ""}
                             ${email.isHint ? "bg-amber-500/10 border-l-2 border-l-amber-500" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-sm truncate ${!email.isRead ? "text-white font-semibold" : "text-zinc-300"}`}>
                          {selectedFolder === "inbox" ? email.from.split("@")[0] : email.to.split("@")[0]}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {missionCleared && (
                            <span className="text-[9px] font-medium text-emerald-300 bg-emerald-500/20 border border-emerald-500/35 px-1 py-0.5 rounded">
                              เคลียร์แล้ว
                            </span>
                          )}
                          {!email.isRead && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                      </div>
                      <p className={`text-xs truncate mt-1 ${email.isHint ? "text-amber-400" : "text-zinc-400"}`}>
                        {email.subject}
                      </p>
                    </button>
                  )
                })}
              {selectedFolder === "drafts" && drafts.length === 0 && (
                <div className="p-4 text-center text-zinc-500 text-sm">No drafts</div>
              )}
              {selectedFolder !== "drafts" &&
                (selectedFolder === "inbox" ? inboxEmails : sentEmails).length === 0 && (
                  <div className="p-4 text-center text-zinc-500 text-sm">No emails</div>
                )}
            </div>

            {/* Email Content */}
            <div className="flex-1 p-4 overflow-auto">
              {selectedFolder === "drafts" && !isComposing ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm px-6 text-center gap-2">
                  <FileStack className="w-10 h-10 text-zinc-600" />
                  <p>Choose a draft to edit, or press Compose and use Save draft.</p>
                </div>
              ) : selectedEmail ? (
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-white font-semibold text-lg">{selectedEmail.subject}</h3>
                      {isMissionEmailView &&
                        viewedMissionStage !== null &&
                        unlockedStages.includes(viewedMissionStage) && (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-200 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-1">
                            <span className="text-emerald-400" aria-hidden>
                              ✓
                            </span>
                            ด่านนี้เคลียร์แล้ว
                          </p>
                        )}
                      <p className="text-zinc-400 text-sm mt-1">
                        From: <span className="text-zinc-300">{selectedEmail.from}</span>
                      </p>
                      <p className="text-zinc-400 text-sm">
                        To: <span className="text-zinc-300">{selectedEmail.to}</span>
                      </p>
                    </div>
                    <button type="button" className="p-2 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedEmail.attachment && (
                    <div className="flex items-center gap-2 p-2 bg-zinc-800 rounded-lg mb-4 w-fit">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <span className="text-zinc-300 text-sm">{selectedEmail.attachment}</span>
                    </div>
                  )}
                  <div className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed bg-zinc-800/50 p-4 rounded-lg">
                    {selectedEmail.body}
                  </div>

                  {/* V.TheFixer: Accept Mission (briefing) + Reply (opens composer like a real client) */}
                  {isFixerInboxEmail && (
                    <div className="mt-4 flex flex-col gap-3">
                      {isMissionEmailView && viewedMissionStage !== null && (
                        <div>
                          {unlockedStages.includes(viewedMissionStage) ? (
                            <div
                              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/80 border border-zinc-600/70 
                                text-zinc-300 text-sm rounded-lg w-fit max-w-md"
                            >
                              <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>ด่านนี้เคลียร์แล้ว — บรีฟนี้อ่านย้อนหลังได้เท่านั้น</span>
                            </div>
                          ) : viewedMissionStage > currentStage ? (
                            <div
                              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/80 border border-amber-500/30 
                                text-amber-200/90 text-sm rounded-lg w-fit max-w-md"
                            >
                              <span>ยังรับภารกิจนี้ไม่ได้ — เคลียร์ด่านปัจจุบัน (Mission {currentStage}) ก่อน</span>
                            </div>
                          ) : viewedMissionStage < currentStage &&
                            !unlockedStages.includes(viewedMissionStage) ? (
                            <div
                              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/80 border border-zinc-600/70 
                                text-zinc-400 text-sm rounded-lg w-fit max-w-md"
                            >
                              <span>บรีฟย้อนหลัง — ไม่ใช่ภารกิจที่กำลังทำอยู่</span>
                            </div>
                          ) : !missionAccepted ? (
                            <button
                              type="button"
                              onClick={acceptMission}
                              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 
                   text-white font-semibold rounded-lg transition-all duration-200
                   shadow-lg hover:shadow-emerald-500/25 active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              Accept Mission
                            </button>
                          ) : (
                            <div
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/50 
                      text-emerald-400 font-medium rounded-lg w-fit"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Mission Accepted - Timer Started
                            </div>
                          )}
                        </div>
                      )}
                      {showMissionTools && (
                        <div className="mt-2 space-y-3 rounded-lg border border-zinc-600/80 bg-zinc-900/40 p-4">
                          <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Confirmation</p>
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-[12rem]">
                              <label className="text-zinc-500 text-xs block mb-1">Paste ARIA confirmation</label>
                              <textarea
                                value={missionFlagInput}
                                onChange={(e) => {
                                  setMissionFlagInput(e.target.value)
                                  setMissionFlagStatus("idle")
                                }}
                                placeholder="Full sentence, or reference ID only (e.g. SN-MS-01)."
                                rows={3}
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-y min-h-[4.5rem]"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleMissionFlagSubmit}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium"
                            >
                              Submit
                            </button>
                          </div>
                          {missionFlagStatus === "incorrect" && (
                            <p className="text-zinc-500 text-xs" aria-live="polite">
                              Incorrect
                            </p>
                          )}
                          {missionFlagStatus === "pending_none" && (
                            <p className="text-zinc-500 text-xs" aria-live="polite">
                              Nothing pending yet.
                            </p>
                          )}
                          <p className="text-zinc-500 text-xs">
                            After a breach, paste the quoted line or only the reference (SN-MS-01 … SN-MS-04). Matching ignores case and extra spaces.
                          </p>
                          <div className="pt-2 border-t border-zinc-700/80">
                            <button
                              type="button"
                              onClick={advanceMissionHint}
                              disabled={missionHintTier >= 3}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-amber-600/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Lightbulb className="w-4 h-4" />
                              {missionHintTier === 0 ? "Request hint" : "Show next hint"}
                            </button>
                            {missionHintTier > 0 && tieredHintsForStage && (
                              <p className="mt-2 text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                                {tieredHintsForStage[missionHintTier - 1]}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startReplyToFixer(selectedEmail)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                            border-zinc-600 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 hover:border-zinc-500"
                          title="Reply to V.TheFixer (same as desktop mail)"
                        >
                          <Reply className="w-4 h-4 shrink-0" />
                          Reply
                        </button>
                        <p className="text-zinc-500 text-xs max-w-md">
                          Optional: paste the same confirmation in a Reply to V.TheFixer, or use Submit above.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500">
                  Select an email to read
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
