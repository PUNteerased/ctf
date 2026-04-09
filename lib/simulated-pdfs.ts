/** PDF files available in the simulated File Explorer / Email attachment picker */
export const SIMULATED_PDF_FILES = [
  { id: "2", name: "proposal.pdf" },
  { id: "3", name: "casting_brief.pdf" },
  { id: "4", name: "invoice.pdf" },
] as const

export function getPdfFileStorageKey(fileId: string) {
  return `larbos_pdf_file_${fileId}`
}
