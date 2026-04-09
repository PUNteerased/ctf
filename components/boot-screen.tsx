"use client"

import Image from "next/image"

interface BootScreenProps {
  progress: number
}

export function BootScreen({ progress }: BootScreenProps) {
  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center gap-8">
      {/* Spinning Larb Logo as Loading Indicator */}
      <div className="relative flex items-center justify-center">
        <div className="w-28 h-28 rounded-full overflow-hidden shadow-2xl shadow-emerald-500/20 animate-spin" style={{ animationDuration: "2s" }}>
          <Image
            src="/larb.webp"
            alt="Loading..."
            width={112}
            height={112}
            className="object-cover w-full h-full"
            priority
          />
        </div>
        {/* Glow effect behind */}
        <div className="absolute inset-0 w-28 h-28 rounded-full bg-emerald-500/20 blur-xl -z-10" />
      </div>

      {/* LarbOS Title */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-zinc-100 tracking-wider">
          Larb<span className="text-emerald-400">OS</span>
        </h1>
        <p className="text-zinc-500 text-sm mt-1">v1.0.0 - Spicy Edition</p>
      </div>

      {/* Progress Bar */}
      <div className="w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* User Label */}
      <div className="flex flex-col items-center gap-3 mt-4">
        <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <svg className="w-7 h-7 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
        <span className="text-zinc-300 font-medium">User</span>
      </div>

      {/* Loading text */}
      <p className="text-zinc-500 text-sm">
        {progress < 30 && "Initializing system..."}
        {progress >= 30 && progress < 60 && "Loading modules..."}
        {progress >= 60 && progress < 90 && "Preparing desktop..."}
        {progress >= 90 && "Almost ready..."}
      </p>

      {/* Subtle scanline effect */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)"
      }} />
    </div>
  )
}
