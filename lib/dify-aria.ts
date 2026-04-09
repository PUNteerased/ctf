/** Parsed JSON from Dify workflow output `data.outputs.result` */
export type DifyAriaResult = {
  is_hacked: boolean
  aria_log: string
  fixer_email: string
  intel_unlocked: string
  flag: string
}
