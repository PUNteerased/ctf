"use client"

import { useState, useEffect } from "react"
import { BootScreen } from "@/components/boot-screen"
import { Desktop } from "@/components/desktop"

export type OSState = "off" | "booting" | "desktop"

export default function LarbOS() {
  const [osState, setOsState] = useState<OSState>("off")
  const [progress, setProgress] = useState(0)

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

  const handlePowerOn = () => {
    setProgress(0)
    setOsState("booting")
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
