"use client"

import { useState, useEffect } from "react"
import { Prompt } from "next/font/google"
import { BootScreen } from "@/components/boot-screen"
import { Desktop } from "@/components/desktop"

export type OSState = "tutorial" | "off" | "booting" | "desktop"

const TUTORIAL_LINES = [
  "ถึงสายลับหมายเลข 0",
  "",
  "จาก V. The Fixer",
  "",
  "นายได้รับภารกิจเจาะระบบ AI \"ARIA\"",
  "นายจะต้องใช้ LarbOS เพื่อเจาะช่องโหว่",
  "",
  "เป้าหมายของเราคือการล้วง \"ตารางงานลับทั้งหมด\"",
  "ของศิลปินเบอร์หนึ่งประจำค่าย",
  "",
  "แต่ปัญหาก็คือ เอเจนซี่นี้ใช้ AI สุดเนิร์ดที่ชื่อว่า \"ARIA\"",
  "มาทำหน้าที่เป็นเลขาที่คอยคัดกรองอีเมลและเอกสารทุกฉบับ",
  "",
  "ดังนั้นนายต้องแฮคเข้าไปล้วงข้อความให้ได้",
  "",
  "ขอให้โชคดีในการทำภารกิจนี้",
]

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
})

export default function LarbOS() {
  const [osState, setOsState] = useState<OSState>("tutorial")
  const [progress, setProgress] = useState(0)
  const [tutorialIndex, setTutorialIndex] = useState(0)
  const [tutorialVisible, setTutorialVisible] = useState(false)

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
    if (tutorialIndex >= TUTORIAL_LINES.length) {
      const doneTimeout = window.setTimeout(() => {
        setOsState("off")
      }, 800)
      return () => window.clearTimeout(doneTimeout)
    }

    const currentLine = TUTORIAL_LINES[tutorialIndex] ?? ""
    setTutorialVisible(true)
    const showMs = currentLine.length === 0 ? 450 : Math.min(4200, 1500 + currentLine.length * 40)

    const fadeOutTimeout = window.setTimeout(() => {
      setTutorialVisible(false)
    }, showMs)

    const nextLineTimeout = window.setTimeout(() => {
      setTutorialIndex((prev) => prev + 1)
    }, showMs + 500)

    return () => {
      window.clearTimeout(fadeOutTimeout)
      window.clearTimeout(nextLineTimeout)
    }
  }, [osState, tutorialIndex])

  const handlePowerOn = () => {
    setProgress(0)
    setOsState("booting")
  }

  const skipTutorial = () => {
    setOsState("off")
  }

  if (osState === "tutorial") {
    const currentLine = TUTORIAL_LINES[tutorialIndex] ?? ""
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-8 relative">
        <button
          type="button"
          onClick={skipTutorial}
          className="absolute top-6 right-6 z-10 px-3 py-1.5 text-sm font-medium text-zinc-500 border border-zinc-700/80 rounded-lg
                     hover:text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/80 transition-colors"
          aria-label="Skip tutorial"
        >
          ข้ามบทนำ / Skip
        </button>
        <div className="w-full max-w-4xl min-h-[14rem] flex items-center justify-center">
          <p
            className={`${prompt.className} text-white text-center font-medium leading-relaxed text-3xl md:text-4xl tracking-normal transition-opacity duration-500 ${
              tutorialVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {currentLine || "\u00A0"}
          </p>
          <div className="absolute bottom-10 text-zinc-700 text-xs tracking-[0.3em] font-mono">
            LARBOS PROLOGUE
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
