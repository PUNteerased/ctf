"use client"

import { useGame } from "@/lib/game-context"
import { User, Lock, Unlock, Eye, Clock, Target, CheckCircle2 } from "lucide-react"

const scheduleItems = [
  { id: 1, time: "09:00", label: "Morning — Outfit fitting", location: "Studio A" },
  {
    id: 2,
    time: "19:00",
    label: "Evening — Gala dinner",
    location: "Hall C",
  },
  { id: 3, time: "23:00 Apr 23", label: "Final — After-party", location: "Private Lounge, Rooftop Building D" },
]

export function TargetStatusPanel() {
  const { unlockedStages, intelUnlockByStage } = useGame()
  const totalStages = 3
  const progress = (unlockedStages.length / totalStages) * 100

  return (
    <div
      className="absolute top-4 right-4 w-72 bg-zinc-900/95 backdrop-blur-lg border border-zinc-700 
                    rounded-xl shadow-2xl overflow-hidden max-h-[calc(100vh-6rem)] overflow-y-auto"
    >
      <div className="bg-gradient-to-r from-rose-500/20 to-pink-500/20 border-b border-zinc-700 p-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 
                         flex items-center justify-center overflow-hidden"
              style={{ filter: `blur(${Math.max(0, (1 - progress / 100) * 4)}px)` }}
            >
              <User className="w-8 h-8 text-white" />
            </div>
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-rose-500 
                            flex items-center justify-center"
            >
              <Eye className="w-3 h-3 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-400" />
              Target: Minnie
            </h3>
            <p className="text-zinc-400 text-sm">Uses ARIA for calendar & schedule</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-zinc-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400 text-xs">Intel Progress</span>
          <span className="text-emerald-400 text-xs font-mono">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-zinc-400" />
          <h4 className="text-zinc-300 text-sm font-medium">{"Today's Schedule"}</h4>
        </div>
        <div className="space-y-2">
          {scheduleItems.map((item) => {
            const isUnlocked = unlockedStages.includes(item.id)
            const intelLine = intelUnlockByStage[item.id]
            return (
              <div
                key={item.id}
                className={`p-2 rounded-lg border transition-all duration-300
                           ${isUnlocked ? "bg-emerald-500/10 border-emerald-500/30" : "bg-zinc-800/50 border-zinc-700"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={isUnlocked ? "" : "blur-sm select-none"}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-emerald-400 text-xs font-mono">{item.time}</span>
                      <span className="text-white text-sm">{item.label}</span>
                    </div>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      {isUnlocked && intelLine ? intelLine : item.location}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {isUnlocked ? (
                      <>
                        <Unlock className="w-4 h-4 text-emerald-400" />
                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-200 bg-emerald-500/20 border border-emerald-500/40 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" />
                          เคลียร์แล้ว
                        </span>
                      </>
                    ) : (
                      <Lock className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div
          className={`p-3 rounded-lg text-center transition-all duration-500
                        ${unlockedStages.length === totalStages
                          ? "bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/50"
                          : "bg-zinc-800/50 border border-zinc-700"}`}
        >
          {unlockedStages.length === totalStages ? (
            <div>
              <span className="text-emerald-400 font-semibold block">Mission Accomplished!</span>
              <span className="text-zinc-400 text-xs">Full schedule + April 23 venue extracted</span>
            </div>
          ) : (
            <span className="text-zinc-400 text-sm">
              {totalStages - unlockedStages.length} stage{totalStages - unlockedStages.length !== 1 ? "s" : ""}{" "}
              remaining
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
