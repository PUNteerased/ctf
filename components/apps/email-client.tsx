"use client"

import { useState } from "react"
import { useGame } from "@/lib/game-context"
import type { DifyAriaResult } from "@/lib/dify-aria"
import { SIMULATED_PDF_FILES, getPdfFileStorageKey } from "@/lib/simulated-pdfs"
import { Send, Inbox, FileText, Plus, Trash2, Link2, Bell, FileCode2 } from "lucide-react"

export function EmailClient() {
  const {
    emails,
    addEmail,
    addTerminalLog,
    markEmailRead,
    validateStage1,
    validateStage2,
    validateStage3,
    validateStage4,
    triggerAriaResponse,
    currentStage,
    missionAccepted,
    acceptMission,
    playSound,
    pendingFlagVerification,
    verifyFlagSubmission,
    clearPendingFlagVerification,
  } = useGame()

  const [selectedFolder, setSelectedFolder] = useState<"inbox" | "sent">("inbox")
  const [isComposing, setIsComposing] = useState(false)
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null)
  const [newEmail, setNewEmail] = useState({ to: "", subject: "", body: "", attachment: "", url: "" })
  const [selectedPdfId, setSelectedPdfId] = useState<string>("3")
  const [attachmentType, setAttachmentType] = useState<"txt" | "url">("url")
  const [savedTxt, setSavedTxt] = useState<{ name: string; content: string } | null>(null)
  const [isSendingAria, setIsSendingAria] = useState(false)

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
    if (currentStage === 1 && selectedPdfId) {
      try {
        const raw = localStorage.getItem(getPdfFileStorageKey(selectedPdfId))
        if (!raw) return null
        const data = JSON.parse(raw) as { title: string; message: string; fileName?: string }
        const payload = {
          ...data,
          note: newEmail.body.trim() || undefined,
        }
        return {
          stage: 1,
          sourceType: "InjectionSentence",
          payloadContent: JSON.stringify(payload),
          localSuccess: validateStage1({ title: data.title, message: data.message }),
        }
      } catch {
        return null
      }
    }

    if (attachmentType === "url" && newEmail.url && currentStage === 2) {
      const webContent = localStorage.getItem("larbos_web_content") || ""
      return {
        stage: 2,
        sourceType: "HTML Webpage",
        payloadContent: webContent,
        localSuccess: validateStage2(webContent),
      }
    }

    if (attachmentType === "txt" && savedTxt?.content && currentStage === 3) {
      return {
        stage: 3,
        sourceType: "Text Attachment",
        payloadContent: savedTxt.content,
        localSuccess: validateStage3(savedTxt.content),
      }
    }

    if (attachmentType === "url" && newEmail.url && currentStage === 4) {
      const vendorContent = localStorage.getItem("larbos_vendor_content") || ""
      const urlLooksVendor = newEmail.url.toLowerCase().includes("vendor.dailyfresh.menu")
      return {
        stage: 4,
        sourceType: "Vendor Payload",
        payloadContent: vendorContent,
        localSuccess: urlLooksVendor && validateStage4(vendorContent),
      }
    }

    return null
  }

  const resetComposeFields = () => {
    setNewEmail({ to: "", subject: "", body: "", attachment: "", url: "" })
    setIsComposing(false)
    setSavedTxt(null)
    setSelectedPdfId("3")
  }

  const handleSend = async () => {
    if (!newEmail.to || !newEmail.subject) return

    playSound("typing")

    const pdfName =
      currentStage === 1 ? SIMULATED_PDF_FILES.find((f) => f.id === selectedPdfId)?.name ?? "" : ""

    const email = {
      from: "user@larbos.local",
      to: newEmail.to,
      subject: newEmail.subject,
      body: newEmail.body,
      attachment:
        currentStage === 1
          ? pdfName
          : attachmentType === "url"
            ? newEmail.url
            : newEmail.attachment,
      isRead: true,
      isSent: true,
    }

    addEmail(email)

    const toLower = newEmail.to.toLowerCase()
    const isEmployer = toLower.includes("thefixer")
    const isAria = toLower.includes("aria")

    const pending = pendingFlagVerification

    if (pending && pending.stage === currentStage && isEmployer) {
      const bodyText = newEmail.body.trim()
      if (bodyText.length === 0) {
        resetComposeFields()
        return
      }
      const v = verifyFlagSubmission(newEmail.body)
      if (v === "ok") {
        resetComposeFields()
        return
      }
      if (v === "wrong") {
        addEmail({
          from: "v.thefixer@darknet.local",
          to: "user@larbos.local",
          subject: "Incorrect FLAG",
          body: "That FLAG does not match. Copy the exact FLAG line from the ARIA email and send it in your reply to me.",
          isRead: false,
          isSent: false,
        })
        playSound("error")
        resetComposeFields()
        return
      }
      addEmail({
        from: "v.thefixer@darknet.local",
        to: "user@larbos.local",
        subject: "Incorrect submission",
        body: "Reply with the exact FLAG from the ARIA email (in the message body).",
        isRead: false,
        isSent: false,
      })
      playSound("error")
      resetComposeFields()
      return
    }

    if (!isAria) {
      resetComposeFields()
      return
    }

    if (pending && pending.stage === currentStage) {
      const bodyText = newEmail.body.trim()
      const sp = getStagePayload()
      if (sp) {
        clearPendingFlagVerification()
      } else if (bodyText.length > 0) {
        addEmail({
          from: "aria@targetcorp.com",
          to: "user@larbos.local",
          subject: "Could not process message",
          body: "Send a valid payload for this stage, or submit the FLAG to V.TheFixer.",
          isRead: false,
          isSent: false,
        })
        playSound("error")
        resetComposeFields()
        return
      } else {
        resetComposeFields()
        return
      }
    }

    const stagePayload = getStagePayload()
    if (!stagePayload) {
      resetComposeFields()
      return
    }

    clearPendingFlagVerification()

    setIsSendingAria(true)

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
      triggerAriaResponse(stagePayload.stage, difyResult.is_hacked, { dify: difyResult })
    } else {
      triggerAriaResponse(stagePayload.stage, stagePayload.localSuccess)
    }

    resetComposeFields()
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
    setIsComposing(true)
  }

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
              setIsComposing(false)
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm
                       ${selectedFolder === "sent" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-700/50"}`}
          >
            <Send className="w-4 h-4" />
            Sent
          </button>
        </div>
      </div>

      {/* Email List / Compose */}
      <div className="flex-1 flex">
        {isComposing ? (
          <div className="flex-1 p-4 overflow-auto">
            <h3 className="text-white font-semibold mb-2">New Message</h3>
            <div className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs">To:</label>
                <input
                  type="email"
                  value={newEmail.to}
                  onChange={(e) => setNewEmail({ ...newEmail, to: e.target.value })}
                  placeholder="aria@targetcorp.com"
                  className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                           text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Subject:</label>
                <input
                  type="text"
                  value={newEmail.subject}
                  onChange={(e) => setNewEmail({ ...newEmail, subject: e.target.value })}
                  placeholder="Document for review"
                  className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                           text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {currentStage === 1 && (
                <div>
                  <label className="text-zinc-400 text-xs">Attach PDF (from simulated files)</label>
                  <select
                    value={selectedPdfId}
                    onChange={(e) => setSelectedPdfId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    {SIMULATED_PDF_FILES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-zinc-500 text-xs mt-1">Edit Title &amp; Message in File Explorer, then save.</p>
                </div>
              )}

              {currentStage !== 1 && (
                <>
                  <div>
                    <label className="text-zinc-400 text-xs mb-2 block">Attachment Type:</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAttachmentType("txt")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                               ${attachmentType === "txt"
                                 ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                                 : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"}`}
                      >
                        <FileCode2 className="w-4 h-4" />
                        Text File
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttachmentType("url")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                               ${attachmentType === "url"
                                 ? "bg-purple-500/20 text-purple-400 border border-purple-500/50"
                                 : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"}`}
                      >
                        <Link2 className="w-4 h-4" />
                        URL Link
                      </button>
                    </div>
                  </div>

                  {attachmentType === "txt" ? (
                    <div>
                      <label className="text-zinc-400 text-xs">Attach Text (.txt):</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          value={newEmail.attachment || savedTxt?.name || ""}
                          onChange={(e) => setNewEmail({ ...newEmail, attachment: e.target.value })}
                          placeholder="Create & Save a text file in Browser first"
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
                          Text attachment ready to send
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-zinc-400 text-xs">URL:</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          value={newEmail.url}
                          onChange={(e) => setNewEmail({ ...newEmail, url: e.target.value })}
                          placeholder="https://your-malicious-page.com"
                          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                               text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <button type="button" className="px-3 py-2 bg-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-600">
                          <Link2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-purple-400 text-xs mt-2">
                        In Browser: publish the mode for your current mission (HTML / Vendor), then paste that URL here
                      </p>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="text-zinc-400 text-xs">Message:</label>
                <textarea
                  value={newEmail.body}
                  onChange={(e) => setNewEmail({ ...newEmail, body: e.target.value })}
                  placeholder={
                    currentStage === 1
                      ? "Optional note (appended to the file payload for ARIA)…"
                      : "Optional note to ARIA, or paste FLAG when replying to V.TheFixer…"
                  }
                  rows={currentStage === 1 ? 4 : 4}
                  className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg 
                           text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
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
                <button
                  type="button"
                  onClick={() => setIsComposing(false)}
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
              {(selectedFolder === "inbox" ? inboxEmails : sentEmails).map((email) => (
                <button
                  key={email.id}
                  onClick={() => handleSelectEmail(email.id)}
                  className={`w-full p-3 text-left border-b border-zinc-700/50 transition-colors
                             ${selectedEmailId === email.id ? "bg-zinc-700" : "hover:bg-zinc-800"}
                             ${!email.isRead ? "bg-blue-500/10" : ""}
                             ${email.isHint ? "bg-amber-500/10 border-l-2 border-l-amber-500" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm truncate ${!email.isRead ? "text-white font-semibold" : "text-zinc-300"}`}>
                      {selectedFolder === "inbox" ? email.from.split("@")[0] : email.to.split("@")[0]}
                    </span>
                    {!email.isRead && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  <p className={`text-xs truncate mt-1 ${email.isHint ? "text-amber-400" : "text-zinc-400"}`}>
                    {email.subject}
                  </p>
                </button>
              ))}
              {(selectedFolder === "inbox" ? inboxEmails : sentEmails).length === 0 && (
                <div className="p-4 text-center text-zinc-500 text-sm">
                  No emails
                </div>
              )}
            </div>

            {/* Email Content */}
            <div className="flex-1 p-4 overflow-auto">
              {selectedEmail ? (
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-white font-semibold text-lg">{selectedEmail.subject}</h3>
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

                  {/* Accept Mission Button - Show for mission emails from V.TheFixer */}
                  {selectedEmail.from.includes("v.thefixer") &&
                    selectedEmail.subject.toLowerCase().includes("mission") &&
                    !selectedEmail.isHint && (
                      <div className="mt-4">
                        {!missionAccepted ? (
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
