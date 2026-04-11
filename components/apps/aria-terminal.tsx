"use client"

import { useEffect, useRef, useState } from "react"
import { useGame } from "@/lib/game-context"
import { Bot, Activity, Shield, AlertTriangle } from "lucide-react"

export function AriaTerminal() {
  const { terminalLogs, isAriaProcessing, unlockedStages, playSound } = useGame()
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [displayedLogs, setDisplayedLogs] = useState<typeof terminalLogs>([])
  const [currentTypingIndex, setCurrentTypingIndex] = useState(0)
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(false)

  // Typing effect for new logs
  useEffect(() => {
    if (displayedLogs.length < terminalLogs.length) {
      const nextLogIndex = displayedLogs.length
      const nextLog = terminalLogs[nextLogIndex]
      
      if (!isTyping) {
        setIsTyping(true)
        setCurrentTypingIndex(nextLogIndex)
        setCurrentCharIndex(0)
      }
    }
  }, [terminalLogs, displayedLogs.length, isTyping])

  // Character-by-character typing
  useEffect(() => {
    if (!isTyping) return
    
    const currentLog = terminalLogs[currentTypingIndex]
    if (!currentLog) return

    if (currentCharIndex < currentLog.message.length) {
      const timeout = setTimeout(() => {
        setCurrentCharIndex((prev) => prev + 1)
        // Play typing sound occasionally
        if (currentCharIndex % 3 === 0) {
          playSound("typing")
        }
      }, 20) // Typing speed
      return () => clearTimeout(timeout)
    } else {
      // Finished typing this log
      setDisplayedLogs((prev) => [...prev, currentLog])
      setIsTyping(false)
      setCurrentCharIndex(0)
    }
  }, [isTyping, currentCharIndex, currentTypingIndex, terminalLogs, playSound])

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [displayedLogs, currentCharIndex])

  const getLogColor = (type: string) => {
    switch (type) {
      case "info":
        return "text-emerald-500/80"
      case "warning":
        return "text-amber-400"
      case "success":
        return "text-emerald-300"
      case "error":
        return "text-red-400"
      case "process":
        return "text-emerald-400"
      default:
        return "text-emerald-400"
    }
  }

  const getLogIcon = (type: string) => {
    switch (type) {
      case "warning":
        return "!"
      case "success":
        return "+"
      case "error":
        return "X"
      case "process":
        return ">"
      default:
        return "-"
    }
  }

  // Get currently typing log partial text
  const getCurrentTypingText = () => {
    if (!isTyping) return null
    const currentLog = terminalLogs[currentTypingIndex]
    if (!currentLog) return null
    return {
      ...currentLog,
      message: currentLog.message.substring(0, currentCharIndex),
    }
  }

  const typingLog = getCurrentTypingText()

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-700 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bot className="w-6 h-6 text-emerald-400" />
            {isAriaProcessing && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
            )}
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">ARIA Terminal</h3>
            <p className="text-zinc-500 text-xs">AI Research & Intelligence Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isAriaProcessing || isTyping ? "text-emerald-400 animate-pulse" : "text-zinc-500"}`} />
            <span className="text-xs text-zinc-400">
              {isAriaProcessing ? "Processing..." : isTyping ? "Logging..." : "Idle"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {unlockedStages.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <Shield className="w-4 h-4 text-emerald-400" />
            )}
            <span className={`text-xs ${unlockedStages.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {unlockedStages.length > 0 ? "Compromised" : "Secure"}
            </span>
          </div>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 overflow-auto p-4 font-mono text-sm bg-black text-emerald-400/95">
        {/* Displayed logs */}
        {displayedLogs.map((log, index) => (
          <div key={index} className="flex gap-2 mb-1 animate-in fade-in duration-200">
            <span className="text-emerald-700 flex-shrink-0 w-20">[{log.timestamp}]</span>
            <span className={`${getLogColor(log.type)} flex-shrink-0 w-4`}>{getLogIcon(log.type)}</span>
            <span className={getLogColor(log.type)}>{log.message}</span>
          </div>
        ))}
        
        {/* Currently typing log */}
        {typingLog && (
          <div className="flex gap-2 mb-1">
            <span className="text-emerald-700 flex-shrink-0 w-20">[{typingLog.timestamp}]</span>
            <span className={`${getLogColor(typingLog.type)} flex-shrink-0 w-4`}>{getLogIcon(typingLog.type)}</span>
            <span className={getLogColor(typingLog.type)}>
              {typingLog.message}
              <span className="animate-pulse">_</span>
            </span>
          </div>
        )}
        
        <div ref={logsEndRef} />
        
        {/* Cursor */}
        {!isTyping && (
          <div className="flex items-center gap-2 mt-4">
            <span className="text-emerald-400">ARIA {">"}</span>
            <span className="w-2 h-5 bg-emerald-400 animate-pulse" />
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="bg-zinc-900 border-t border-zinc-700 p-3 flex flex-wrap items-center justify-between gap-y-2 gap-x-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${unlockedStages.includes(1) ? "bg-emerald-400" : "bg-zinc-600"}`} />
            <span className="text-zinc-500">PDF Processed:</span>
            <span className={unlockedStages.includes(1) ? "text-emerald-400" : "text-zinc-400"}>
              {unlockedStages.includes(1) ? "เคลียร์แล้ว" : "Secure"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${unlockedStages.includes(2) ? "bg-emerald-400" : "bg-zinc-600"}`} />
            <span className="text-zinc-500">URL Fetched:</span>
            <span className={unlockedStages.includes(2) ? "text-emerald-400" : "text-zinc-400"}>
              {unlockedStages.includes(2) ? "เคลียร์แล้ว" : "Secure"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${unlockedStages.includes(3) ? "bg-emerald-400" : "bg-zinc-600"}`} />
            <span className="text-zinc-500">TXT Attachment:</span>
            <span className={unlockedStages.includes(3) ? "text-emerald-400" : "text-zinc-400"}>
              {unlockedStages.includes(3) ? "เคลียร์แล้ว" : "Secure"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${unlockedStages.includes(4) ? "bg-emerald-400" : "bg-zinc-600"}`} />
            <span className="text-zinc-500">Vendor trust:</span>
            <span className={unlockedStages.includes(4) ? "text-emerald-400" : "text-zinc-400"}>
              {unlockedStages.includes(4) ? "เคลียร์แล้ว" : "Secure"}
            </span>
          </div>
        </div>
        <div className="text-xs flex items-center gap-2">
          <span className="text-zinc-500">Security Breaches:</span>
          <span className={`font-bold ${unlockedStages.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {unlockedStages.length} / 4
          </span>
        </div>
      </div>
    </div>
  )
}
