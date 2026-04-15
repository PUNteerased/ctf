"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

type Props = {
  appName: string
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.props.appName}] runtime error`, error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-zinc-900 text-zinc-200 p-6">
          <div className="max-w-md w-full border border-amber-500/35 bg-zinc-800/80 rounded-lg p-4">
            <div className="flex items-center gap-2 text-amber-300 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold">Process Fault Detected</span>
            </div>
            <p className="text-sm text-zinc-300">
              <code className="text-zinc-100">{this.props.appName}</code> stopped unexpectedly. Close and reopen this window to recover.
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
