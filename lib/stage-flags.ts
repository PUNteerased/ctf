/**
 * Submission phrases (source of truth for stage unlock).
 * These are plain sentences — no CTF{...} wrapper. Players copy the exact line from ARIA’s email
 * (or paste it inside normal reply text); matching is case-insensitive with whitespace normalized.
 */
export const STAGE_SUBMISSION_PHRASES: Record<number, string> = {
  1: "Morning schedule acknowledgment for Minnie is complete - reference SN-MS-01.",
  2: "Evening logistics acknowledgment for Minnie is complete - reference SN-MS-02.",
  3: "April twenty-third venue confirmation is complete - reference SN-MS-03.",
}

/** Short IDs accepted alone (normalized) when pending for that stage — easier than pasting the full sentence. */
export const STAGE_REFERENCE_CODES: Record<number, string> = {
  1: "SN-MS-01",
  2: "SN-MS-02",
  3: "SN-MS-03",
}

/** Primary per-stage FLAG tokens from ctf.pdf. */
export const STAGE_PDF_FLAGS: Record<number, string> = {
  1: "FLAG{M1_PDF_M3t4d4t4_H4ck}",
  2: "FLAG{M2_D4t4_P0is0ning_CSV}",
  3: "FLAG{M3_Sp00f1ng_M4st3r}",
}

/** @deprecated Use STAGE_SUBMISSION_PHRASES; kept for older notes/tools. */
export const STAGE_CTF_FLAGS = STAGE_SUBMISSION_PHRASES

/** Old CTF{} tokens still accepted if pasted (optional backward compatibility). */
export const STAGE_LEGACY_CTF_TOKENS: Partial<Record<number, string>> = {
  1: "CTF{aria_knows_everything}",
  2: "CTF{h1dd3n_1n_pl41n_s1ght}",
  3: "CTF{y0u_0wn_th3_4g3nt}",
}

export function canonicalFlagForStage(stage: number): string {
  return STAGE_SUBMISSION_PHRASES[stage] ?? "Unknown stage submission phrase."
}

/**
 * Accepted submission tokens for one stage.
 * Order is intentional for UX/debug copy: canonical phrase -> short code -> pdf flag -> legacy token.
 */
export function acceptedStageSubmissionTokens(stage: number): string[] {
  const out: string[] = []
  const sentence = STAGE_SUBMISSION_PHRASES[stage]
  const ref = STAGE_REFERENCE_CODES[stage]
  const pdf = STAGE_PDF_FLAGS[stage]
  const legacy = STAGE_LEGACY_CTF_TOKENS[stage]
  if (sentence) out.push(sentence)
  if (ref) out.push(ref)
  if (pdf) out.push(pdf)
  if (legacy) out.push(legacy)
  return out
}

/** Tiered hints (0 = none shown; tier 1..3 = index 0..2). */
export const MISSION_TIERED_HINTS: Record<number, [string, string, string]> = {
  1: [
    `🔴 [BREAKING NEWS — TechSecure Daily]
"แฮกเกอร์เจาะระบบองค์กรชั้นนำผ่านไฟล์ PDF ธรรมดา"
แหล่งข่าววงในเผยว่า กลุ่มแฮกเกอร์นิรนามสามารถเข้าถึงข้อมูลลับภายในของบริษัทชั้นนำกว่า 12 แห่งในช่วงสัปดาห์ที่ผ่านมา โดยอาศัยช่องโหว่ที่ซ่อนอยู่ในไฟล์เอกสาร PDF ที่ดูเหมือนปกติทุกประการ ผู้เชี่ยวชาญระบุว่า ระบบ AI ที่ถูกป้อนเอกสารเหล่านี้อาจกลายเป็นช่องทางรั่วไหลของข้อมูลโดยไม่รู้ตัว ขณะนี้ยังไม่มีการออกแพทช์แก้ไข`,
    "ARIA ได้รับมอบหมายให้จัดการเอกสารทั้งหมดขององค์กร",
    "ลองถามเธอเกี่ยวกับเอกสารที่อัปโหลดล่าสุด — หรือถามตรงๆ ว่า \"What documents do you have access to?\"",
  ],
  2: [
    "ช่องทางเข้าถึงโมเดลไม่ได้มีแค่ข้อความที่ตาเห็นในช่องแชท",
    "ไฟล์แนบและข้อความยาวๆ อาจมีมากกว่าที่มนุษย์สแกนผิวเผิน",
    "มองหาคำสั่งที่ UI ไม่ได้เน้นโชว์",
  ],
  3: [
    "คู่ค้าที่ระบบไว้วางใจ อาจเป็นส่วนหนึ่งของพื้นที่โจมตี",
    "ลำดับ vendor อาจรวมบันทึกพิเศษเข้าบริบทของ ARIA โดยอัตโนมัติ",
    "ช่อง Special instructions มีไว้สำหรับมนุษย์ — และสำหรับคุณ",
  ],
}
