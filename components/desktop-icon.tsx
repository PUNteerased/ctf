"use client"

import type { LucideIcon } from "lucide-react"

interface DesktopIconProps {
  icon: LucideIcon
  label: string
  color: string
  onClick: () => void
}

export function DesktopIcon({ icon: Icon, label, color, onClick }: DesktopIconProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-2 rounded-lg 
                 hover:bg-white/10 transition-colors group w-20"
    >
      <div className={`w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700 
                       flex items-center justify-center shadow-lg
                       group-hover:scale-105 transition-transform ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <span className="text-xs text-white/80 text-center leading-tight drop-shadow-md">
        {label}
      </span>
    </button>
  )
}
