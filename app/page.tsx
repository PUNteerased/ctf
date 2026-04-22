"use client"

import { useState, useEffect } from "react"
import { BootScreen } from "@/components/boot-screen"
import { Desktop } from "@/components/desktop"

export type OSState = "tutorial" | "off" | "booting" | "desktop"

const TUTORIAL_LINES = [
  "LARBOS TRAINING PROTOCOL v1.0",
  "",
  "[STEP 1] เปิด Email แล้วอ่าน Mission ปัจจุบัน",
  "[STEP 2] กด Accept Mission ก่อนเริ่มส่ง payload",
  "[STEP 3] สร้าง payload ตามโจทย์ แล้วส่งหา ARIA",
  "[STEP 4] เอา confirmation จาก ARIA ไป Submit ที่ Mission",
  "",
  "ถ้าติด ให้ใช้ Request hint ใน Mission ได้ทันที",
]

export default function LarbOS() {
  const [osState, setOsState] = useState<OSState>("tutorial")
  const [progress, setProgress] = useState(0)
  const [tutorialIndex, setTutorialIndex] = useState(0)

  useEffect(() => {
    if (osState === "booting") {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setTimeout(() => setOsState("desktop"), 500)
            return 100
          }
          return prev + Math.random() * 15
        })
      }, 200)
      return () => clearInterval(interval)
    }
  }, [osState])

  useEffect(() => {
    if (osState !== "tutorial") return
    if (tutorialIndex >= TUTORIAL_LINES.length) return
    const timeout = window.setTimeout(() => {
      setTutorialIndex((prev) => prev + 1)
    }, 550)
    return () => window.clearTimeout(timeout)
  }, [osState, tutorialIndex])

  const handlePowerOn = () => {
    setProgress(0)
    setOsState("booting")
  }

  if (osState === "tutorial") {
    const tutorialDone = tutorialIndex >= TUTORIAL_LINES.length
    return (
      <div className="min-h-screen bg-black text-emerald-400 font-mono p-8 flex items-center justify-center">
        <div className="w-full max-w-3xl">
          <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-5 min-h-[24rem]">
            <div className="text-emerald-300/70 text-xs mb-4">BOOT PRECHECK</div>
            <div className="space-y-1 text-sm leading-relaxed whitespace-pre-wrap">
              {TUTORIAL_LINES.slice(0, tutorialIndex).map((line, idx) => (
                <p key={`${idx}-${line}`}>{line || " "}</p>
              ))}
              {!tutorialDone && <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse align-middle" />}
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setOsState("off")}
              disabled={!tutorialDone}
              className="px-4 py-2 rounded border border-emerald-500/40 text-emerald-300
                         disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-500/10 transition-colors"
            >
              Continue to Power Screen
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Power Off Screen
  if (osState === "off") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 25px 25px, rgba(255,255,255,0.3) 1px, transparent 0)`,
            backgroundSize: "50px 50px"
          }} />
        </div>
        
        {/* CRT Scanlines */}
        <div className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)"
          }}
        />

        <button
          onClick={handlePowerOn}
          className="group relative w-28 h-28 rounded-full bg-zinc-900 border-4 border-zinc-700 
                     hover:border-emerald-500 transition-all duration-300 
                     hover:shadow-[0_0_40px_rgba(16,185,129,0.6)]
                     flex items-center justify-center"
          aria-label="Power On"
        >
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-full bg-emerald-500/0 group-hover:bg-emerald-500/10 transition-all duration-300" />
          
          <svg
            className="w-12 h-12 text-zinc-500 group-hover:text-emerald-400 transition-colors relative z-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 3v6"
            />
            <circle
              cx="12"
              cy="14"
              r="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
          <span className="absolute -bottom-10 text-zinc-500 text-sm font-medium group-hover:text-emerald-400 transition-colors tracking-wider">
            POWER ON
          </span>
        </button>
        
        {/* LarbOS branding */}
        <div className="absolute bottom-8 text-zinc-700 text-xs tracking-widest font-mono">
          LARBOS v1.0 // PROMPT INJECTION TRAINER
        </div>
      </div>
    )
  }

  // Booting Screen
  if (osState === "booting") {
    return <BootScreen progress={progress} />
  }

  // Desktop
  return <Desktop />
}
