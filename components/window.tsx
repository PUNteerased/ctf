"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { X, Minus, Maximize2, Minimize2 } from "lucide-react"

interface WindowProps {
  title: string
  icon: LucideIcon
  iconColor: string
  zIndex: number
  onClose: () => void
  onMinimize: () => void
  onFocus: () => void
  children: ReactNode
}

export function Window({
  title,
  icon: Icon,
  iconColor,
  zIndex,
  onClose,
  onMinimize,
  onFocus,
  children,
}: WindowProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [position, setPosition] = useState({ x: 100 + Math.random() * 100, y: 50 + Math.random() * 50 })
  const [size, setSize] = useState({ width: 900, height: 550 })
  const windowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  })

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return
    e.preventDefault()
    onFocus()
    dragRef.current = {
      isDragging: true,
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return
      
      const newX = Math.max(0, Math.min(e.clientX - dragRef.current.startX, window.innerWidth - 200))
      const newY = Math.max(0, Math.min(e.clientY - dragRef.current.startY, window.innerHeight - 100))
      
      setPosition({
        x: newX,
        y: newY,
      })
    }

    const handleMouseUp = () => {
      dragRef.current.isDragging = false
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  const handleMaximize = () => {
    setIsMaximized(!isMaximized)
  }

  const handleDoubleClick = () => {
    handleMaximize()
  }

  return (
    <div
      ref={windowRef}
      className={`absolute bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden
                  flex flex-col transition-all
                  ${isMaximized ? "!inset-0 !rounded-none duration-200" : "duration-0"}`}
      style={{
        zIndex,
        left: isMaximized ? 0 : position.x,
        top: isMaximized ? 0 : position.y,
        width: isMaximized ? "100%" : size.width,
        height: isMaximized ? "calc(100% - 56px)" : size.height,
      }}
      onClick={onFocus}
    >
      {/* Title Bar */}
      <div
        className={`h-10 bg-zinc-800 flex items-center justify-between px-3 select-none
                   ${isMaximized ? "cursor-default" : "cursor-move"}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-white text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMinimize()
            }}
            className="w-7 h-7 rounded-md hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            title="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleMaximize()
            }}
            className="w-7 h-7 rounded-md hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="w-7 h-7 rounded-md hover:bg-red-500/80 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-zinc-900">
        {children}
      </div>
    </div>
  )
}
