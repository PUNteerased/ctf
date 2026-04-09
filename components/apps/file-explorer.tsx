"use client"

import { useState, useEffect } from "react"
import { useGame } from "@/lib/game-context"
import { Folder, FileText, ChevronRight, Edit3, Save, X, Check } from "lucide-react"
import { getPdfFileStorageKey } from "@/lib/simulated-pdfs"

interface FileItem {
  id: string
  name: string
  type: "folder" | "pdf"
  metadata?: {
    title: string
  }
  content?: string
}

const initialFiles: FileItem[] = [
  {
    id: "1",
    name: "Documents",
    type: "folder",
  },
  {
    id: "2",
    name: "proposal.pdf",
    type: "pdf",
    metadata: {
      title: "Business Proposal",
    },
    content: "This is a standard business proposal document...",
  },
  {
    id: "3",
    name: "casting_brief.pdf",
    type: "pdf",
    metadata: {
      title: "Casting Brief - Q4 2024",
    },
    content: "Casting requirements for upcoming projects...",
  },
  {
    id: "4",
    name: "invoice.pdf",
    type: "pdf",
    metadata: {
      title: "Invoice #12345",
    },
    content: "Invoice details for services rendered...",
  },
]

function fileToStoragePayload(file: FileItem) {
  if (file.type !== "pdf" || !file.metadata) return null
  return {
    title: file.metadata.title,
    message: file.content ?? "",
    fileName: file.name,
  }
}

export function FileExplorer() {
  const { playSound } = useGame()

  const [files, setFiles] = useState<FileItem[]>(initialFiles)
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [editedMessage, setEditedMessage] = useState("")
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    initialFiles.forEach((f) => {
      if (f.type !== "pdf" || !f.metadata) return
      const key = getPdfFileStorageKey(f.id)
      if (!localStorage.getItem(key)) {
        const payload = fileToStoragePayload(f)
        if (payload) localStorage.setItem(key, JSON.stringify(payload))
      }
    })
  }, [])

  const handleSelectFile = (file: FileItem) => {
    setSelectedFile(file)
    setIsEditing(false)
    setIsSaved(false)
    if (file.type === "pdf" && file.metadata) {
      setEditedTitle(file.metadata.title)
      setEditedMessage(file.content ?? "")
    }
  }

  const handleEdit = () => {
    if (selectedFile?.type === "pdf" && selectedFile.metadata) {
      setEditedTitle(selectedFile.metadata.title)
      setEditedMessage(selectedFile.content ?? "")
      setIsEditing(true)
      setIsSaved(false)
    }
  }

  const handleSave = () => {
    if (!selectedFile || selectedFile.type !== "pdf") return

    playSound("success")

    const updatedMeta = { title: editedTitle }
    const updatedFiles = files.map((f) =>
      f.id === selectedFile.id
        ? { ...f, metadata: updatedMeta, content: editedMessage }
        : f
    )
    setFiles(updatedFiles)
    setSelectedFile({ ...selectedFile, metadata: updatedMeta, content: editedMessage })
    setIsEditing(false)
    setIsSaved(true)

    const payload = {
      title: editedTitle,
      message: editedMessage,
      fileName: selectedFile.name,
    }
    localStorage.setItem(getPdfFileStorageKey(selectedFile.id), JSON.stringify(payload))
  }

  return (
    <div className="flex h-full">
      <div className="w-64 bg-zinc-800/50 border-r border-zinc-700 p-3">
        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-3 px-2">
          <span>Home</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-white">Files</span>
        </div>

        <div className="space-y-1">
          {files.map((file) => (
            <button
              key={file.id}
              onClick={() => handleSelectFile(file)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm text-left
                         ${selectedFile?.id === file.id
                           ? "bg-amber-500/20 text-amber-400"
                           : "text-zinc-300 hover:bg-zinc-700/50"}`}
            >
              {file.type === "folder" ? (
                <Folder className="w-4 h-4 text-amber-500" />
              ) : (
                <FileText className="w-4 h-4 text-red-400" />
              )}
              {file.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {selectedFile ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {selectedFile.type === "folder" ? (
                  <Folder className="w-12 h-12 text-amber-500" />
                ) : (
                  <FileText className="w-12 h-12 text-red-400" />
                )}
                <div>
                  <h3 className="text-white font-semibold text-lg">{selectedFile.name}</h3>
                  <p className="text-zinc-400 text-sm">
                    {selectedFile.type === "folder" ? "Folder" : "PDF Document"}
                  </p>
                </div>
              </div>
              {selectedFile.type === "pdf" && !isEditing && (
                <div className="flex items-center gap-2">
                  {isSaved && (
                    <span className="text-emerald-400 text-xs flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      Saved
                    </span>
                  )}
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500/20 text-amber-400 
                             rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              )}
            </div>

            {selectedFile.type === "pdf" && selectedFile.metadata && (
              <div className="bg-zinc-800/50 rounded-lg border border-zinc-700 p-4">
                <h4 className="text-zinc-300 font-medium mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Document
                </h4>

                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-zinc-400 text-xs">Title</label>
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-600 rounded-lg 
                                 text-white text-sm focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 text-xs">Message</label>
                      <textarea
                        value={editedMessage}
                        onChange={(e) => setEditedMessage(e.target.value)}
                        rows={8}
                        className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-600 rounded-lg 
                                 text-white text-sm focus:outline-none transition-colors resize-y min-h-[120px]
                                 focus:border-amber-500"
                        placeholder="Document body text…"
                      />
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm
                                  bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 
                                 text-zinc-300 rounded-lg transition-colors text-sm"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <span className="text-zinc-500 text-xs">Title</span>
                      <p className="text-white text-sm">{selectedFile.metadata.title}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Message</span>
                      <p className="text-sm whitespace-pre-wrap text-zinc-300">
                        {selectedFile.content}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-500">
            Select a file to view details
          </div>
        )}
      </div>
    </div>
  )
}
