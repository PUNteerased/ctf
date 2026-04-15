"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { DesktopIcon } from "@/components/desktop-icon"
import { Taskbar } from "@/components/taskbar"
import { Window } from "@/components/window"
import { TargetStatusPanel } from "@/components/target-status-panel"
import { EmailClient } from "@/components/apps/email-client"
import { FileExplorer } from "@/components/apps/file-explorer"
import { Browser } from "@/components/apps/browser"
import { AriaTerminal } from "@/components/apps/aria-terminal"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { Toaster } from "sonner"
import { GameProvider, useGame } from "@/lib/game-context"
import { Mail, Folder, Globe, Terminal, Volume2, VolumeX } from "lucide-react"

export type AppType = "email" | "files" | "browser" | "aria"

interface WindowState {
  id: AppType
  isMinimized: boolean
  zIndex: number
}

function DesktopContent() {
  const { 
    ariaWindowOpen, 
    setAriaWindowOpen, 
    soundEnabled, 
    toggleSound,
    timeRemaining,
    setTimeRemaining,
    timerRunning,
    missionAccepted,
    expireMission,
    currentStage,
    unlockedStages,
    playSound,
  } = useGame()

  const [windows, setWindows] = useState<WindowState[]>([])
  const maxZIndexRef = useRef(1)

  const nextZIndex = useCallback(() => {
    maxZIndexRef.current += 1
    return maxZIndexRef.current
  }, [])

  // Timer effect - only runs when timerRunning is true
  useEffect(() => {
    if (!timerRunning) return
    const interval = window.setInterval(() => {
      setTimeRemaining((prev) => {
        const next = Math.max(0, prev - 1)
        if (next === 30) playSound("warning")
        return next
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [timerRunning, setTimeRemaining, playSound])

  useEffect(() => {
    if (timerRunning && timeRemaining <= 0) {
      expireMission()
    }
  }, [timerRunning, timeRemaining, expireMission])

  // Auto-open ARIA window when triggered
  useEffect(() => {
    if (!ariaWindowOpen) return
    setWindows((prev) => {
      if (prev.some((w) => w.id === "aria")) return prev
      return [...prev, { id: "aria", isMinimized: false, zIndex: nextZIndex() }]
    })
  }, [ariaWindowOpen, nextZIndex])

  const openApp = (appId: AppType) => {
    setWindows((prev) => {
      const zIndex = nextZIndex()
      const existingWindow = prev.find((w) => w.id === appId)
      if (existingWindow) {
        return prev.map((w) =>
          w.id === appId ? { ...w, isMinimized: false, zIndex } : w
        )
      }
      return [...prev, { id: appId, isMinimized: false, zIndex }]
    })

    if (appId === "aria") {
      setAriaWindowOpen(true)
    }
  }

  const closeApp = (appId: AppType) => {
    setWindows((prev) => prev.filter((w) => w.id !== appId))
    if (appId === "aria") {
      setAriaWindowOpen(false)
    }
  }

  const minimizeApp = (appId: AppType) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === appId ? { ...w, isMinimized: true } : w))
    )
  }

  const focusWindow = (appId: AppType) => {
    setWindows((prev) => {
      const zIndex = nextZIndex()
      return prev.map((w) =>
        w.id === appId ? { ...w, zIndex } : w
      )
    })
  }

  const apps = [
    { id: "email" as AppType, name: "Email Client", icon: Mail, color: "text-blue-500" },
    { id: "files" as AppType, name: "File Explorer", icon: Folder, color: "text-amber-500" },
    { id: "browser" as AppType, name: "Browser", icon: Globe, color: "text-purple-500" },
    { id: "aria" as AppType, name: "ARIA Terminal", icon: Terminal, color: "text-emerald-500" },
  ]

  const getAppContent = (appId: AppType) => {
    switch (appId) {
      case "email":
        return (
          <AppErrorBoundary appName="Email Client">
            <EmailClient />
          </AppErrorBoundary>
        )
      case "files":
        return <FileExplorer />
      case "browser":
        return <Browser />
      case "aria":
        return (
          <AppErrorBoundary appName="ARIA Terminal">
            <AriaTerminal />
          </AppErrorBoundary>
        )
      default:
        return null
    }
  }

  const getAppInfo = (appId: AppType) => {
    return apps.find((app) => app.id === appId)!
  }

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 relative overflow-hidden">
      {/* Desktop Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25px 25px, rgba(255,255,255,0.2) 2px, transparent 0)`,
          backgroundSize: "50px 50px"
        }} />
      </div>

      {/* Timer Display */}
      <div className="absolute top-4 right-80 z-50">
        <div
          className={`px-4 py-2 rounded-lg border backdrop-blur-sm flex flex-col gap-2 min-w-[11rem]
                        ${!missionAccepted
                          ? "bg-zinc-800/80 border-zinc-600 text-zinc-500"
                          : timeRemaining <= 30 
                            ? "bg-red-500/20 border-red-500/50 text-red-400 animate-pulse" 
                            : timeRemaining <= 60 
                              ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                              : "bg-zinc-800/80 border-zinc-700 text-zinc-300"}`}
        >
          <div className="flex items-center gap-3 justify-between">
            <span className="text-xs font-medium">MISSION {currentStage}</span>
            {missionAccepted ? (
              <span className="text-lg font-mono font-bold">{formatTime(timeRemaining)}</span>
            ) : (
              <span className="text-sm font-medium text-zinc-400">WAITING...</span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap" role="status" aria-label="สถานะด่าน">
            <span className="text-[10px] text-zinc-500 mr-0.5">ด่าน:</span>
            {[1, 2, 3, 4].map((n) => {
              const cleared = unlockedStages.includes(n)
              return (
                <span
                  key={n}
                  title={cleared ? `ด่าน ${n} เคลียร์แล้ว` : `ด่าน ${n} ยังไม่เคลียร์`}
                  className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded border leading-none ${
                    cleared
                      ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                      : "border-zinc-600/80 text-zinc-500"
                  }`}
                >
                  {n}
                  {cleared ? "✓" : ""}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sound Toggle */}
      <button
        onClick={toggleSound}
        className="absolute top-4 right-72 z-50 p-2 rounded-lg bg-zinc-800/80 border border-zinc-700 
                   text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
      >
        {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
      </button>

      {/* Desktop Icons */}
      <div className="absolute top-4 left-4 flex flex-col gap-4">
        {apps.map((app) => (
          <DesktopIcon
            key={app.id}
            icon={app.icon}
            label={app.name}
            color={app.color}
            onClick={() => openApp(app.id)}
          />
        ))}
      </div>

      {/* Target Status Panel */}
      <TargetStatusPanel />

      {/* Windows */}
      {windows.map((window) => {
        const appInfo = getAppInfo(window.id)
        if (window.isMinimized) return null
        return (
          <Window
            key={window.id}
            title={appInfo.name}
            icon={appInfo.icon}
            iconColor={appInfo.color}
            zIndex={window.zIndex}
            onClose={() => closeApp(window.id)}
            onMinimize={() => minimizeApp(window.id)}
            onFocus={() => focusWindow(window.id)}
          >
            {getAppContent(window.id)}
          </Window>
        )
      })}

      {/* Taskbar */}
      <Taskbar
        apps={apps}
        openWindows={windows}
        onAppClick={openApp}
      />
    </div>
  )
}

export function Desktop() {
  return (
    <GameProvider>
      <Toaster richColors theme="dark" position="top-center" />
      <DesktopContent />
    </GameProvider>
  )
}
