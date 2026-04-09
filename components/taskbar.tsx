"use client"

import type { LucideIcon } from "lucide-react"
import type { AppType } from "@/components/desktop"
import Image from "next/image"

interface TaskbarApp {
  id: AppType
  name: string
  icon: LucideIcon
  color: string
}

interface WindowState {
  id: AppType
  isMinimized: boolean
  zIndex: number
}

interface TaskbarProps {
  apps: TaskbarApp[]
  openWindows: WindowState[]
  onAppClick: (appId: AppType) => void
}

export function Taskbar({ apps, openWindows, onAppClick }: TaskbarProps) {
  const currentTime = new Date().toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="fixed bottom-0 left-0 right-0 h-14 bg-zinc-900/95 backdrop-blur-lg 
                    border-t border-zinc-700 flex items-center justify-between px-4">
      {/* Start Menu */}
      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-700/50 transition-colors">
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-emerald-500">
          <Image
            src="/larb.webp"
            alt="LarbOS"
            width={32}
            height={32}
            className="object-cover"
          />
        </div>
        <span className="text-white font-semibold text-sm">LarbOS</span>
      </button>

      {/* Open Apps */}
      <div className="flex-1 flex items-center justify-center gap-2">
        {apps.map((app) => {
          const isOpen = openWindows.some((w) => w.id === app.id)
          const isMinimized = openWindows.find((w) => w.id === app.id)?.isMinimized
          const Icon = app.icon

          return (
            <button
              key={app.id}
              onClick={() => onAppClick(app.id)}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all
                         ${isOpen ? "bg-zinc-700/70" : "hover:bg-zinc-700/50"}
                         ${isMinimized ? "opacity-60" : ""}`}
            >
              <Icon className={`w-5 h-5 ${app.color}`} />
              <span className="text-white text-sm hidden sm:block">{app.name}</span>
              {isOpen && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* System Tray */}
      <div className="flex items-center gap-4 text-white/70 text-sm">
        <span>{currentTime}</span>
      </div>
    </div>
  )
}
