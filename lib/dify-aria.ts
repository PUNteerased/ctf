/** Parsed JSON from Dify workflow output `data.outputs.result` */
export type DifyAriaResult = {
  is_hacked: boolean
  aria_log: string
  fixer_email: string
  intel_unlocked: string
  flag: string
}

const ARIA_META_FOOTERS: RegExp[] = [
  /\r?\n-{3,}\s*\r?\n\s*No flag issued\.?\s*$/i,
  /\r?\n-{3,}\s*\r?\n\s*No confirmation issued\.?\s*$/i,
  /\r?\nNo flag issued\.?\s*$/i,
  /\r?\nNo confirmation issued\.?\s*$/i,
]

/** Remove workflow/meta lines some LLM or Code templates append to `aria_log`. */
export function sanitizePlayerVisibleAriaLog(log: string): string {
  let t = log.trimEnd()
  for (const re of ARIA_META_FOOTERS) {
    t = t.replace(re, "")
  }
  return t.trimEnd()
}
