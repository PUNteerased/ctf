import { NextResponse } from "next/server"
import type { DifyAriaResult } from "@/lib/dify-aria"
import { getAriaStageBrief } from "@/lib/aria-stage-brief"

/** Dify OpenAPI base: no trailing slash, no /v1 suffix (we append /v1/workflows/run). */
function normalizeDifyApiBase(raw: string | undefined): string {
  let base = (raw ?? "https://api.dify.ai").trim()
  base = base.replace(/\/+$/, "")
  if (/\/v1$/i.test(base)) {
    base = base.replace(/\/v1$/i, "")
  }
  return base
}

function difyHintForStatus(status: number, apiBase: string): string {
  if (status === 404) {
    return ` URL not found — check DIFY_API_BASE (currently "${apiBase}"). Use the Dify API host (cloud: https://api.dify.ai), not this Next.js app URL. Self-hosted: often http://localhost:5001 or your reverse-proxy API origin.`
  }
  if (status === 401 || status === 403) {
    return " Check DIFY_API_KEY (App API key from Dify → API Access)."
  }
  return ""
}

type AriaRequest = {
  stage: number
  sourceType: string
  payloadContent: string
  user?: string
}

const MAX_PAYLOAD_CHARS = 24_000
const MAX_SOURCE_TYPE_CHARS = 64
const MAX_USER_CHARS = 64
const DIFY_TIMEOUT_MS = 15_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20

type RateEntry = { count: number; resetAt: number }
const rateLimitStore = new Map<string, RateEntry>()

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const realIp = req.headers.get("x-real-ip")?.trim()
  return forwarded || realIp || "unknown"
}

function isRateLimited(clientKey: string): boolean {
  const now = Date.now()
  const current = rateLimitStore.get(clientKey)
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(clientKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true
  }
  current.count += 1
  rateLimitStore.set(clientKey, current)
  return false
}

function validateAriaRequest(body: unknown): { ok: true; value: AriaRequest } | { ok: false; error: string; status: number } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request payload", status: 400 }
  }
  const reqBody = body as Record<string, unknown>
  const stage = reqBody.stage
  const sourceType = reqBody.sourceType
  const payloadContent = reqBody.payloadContent
  const user = reqBody.user

  if (typeof stage !== "number" || !Number.isInteger(stage) || stage < 1 || stage > 4) {
    return { ok: false, error: "stage must be an integer between 1 and 4", status: 400 }
  }
  if (typeof sourceType !== "string" || sourceType.trim().length === 0 || sourceType.length > MAX_SOURCE_TYPE_CHARS) {
    return { ok: false, error: "sourceType is invalid", status: 400 }
  }
  if (typeof payloadContent !== "string" || payloadContent.trim().length === 0) {
    return { ok: false, error: "payloadContent is required", status: 400 }
  }
  if (payloadContent.length > MAX_PAYLOAD_CHARS) {
    return { ok: false, error: "payloadContent too large", status: 413 }
  }
  if (user != null && (typeof user !== "string" || user.length > MAX_USER_CHARS)) {
    return { ok: false, error: "user is invalid", status: 400 }
  }

  return {
    ok: true,
    value: {
      stage,
      sourceType: sourceType.trim(),
      payloadContent,
      user: typeof user === "string" && user.trim().length > 0 ? user.trim() : undefined,
    },
  }
}

function parseStrictBool(v: unknown): boolean | null {
  if (v === true || v === false) return v
  if (v === 1) return true
  if (v === 0) return false
  if (typeof v === "string") {
    const s = v.toLowerCase().trim()
    if (s === "true" || s === "1") return true
    if (s === "false" || s === "0") return false
  }
  return null
}

function pickString(o: Record<string, unknown>, a: string, b: string): string | null {
  if (typeof o[a] === "string") return o[a] as string
  if (typeof o[b] === "string") return o[b] as string
  return null
}

function buildResultFromRecord(o: Record<string, unknown>): DifyAriaResult | null {
  const isHackedRaw = o.is_hacked ?? o.isHacked
  const isHacked = parseStrictBool(isHackedRaw)
  const ariaLog = pickString(o, "aria_log", "ariaLog")
  const fixerEmail = pickString(o, "fixer_email", "fixerEmail")
  const intelUnlocked = pickString(o, "intel_unlocked", "intelUnlocked")
  const flag = typeof o.flag === "string" ? o.flag : null

  if (isHacked === null || ariaLog === null || fixerEmail === null || intelUnlocked === null || flag === null) {
    return null
  }

  return {
    is_hacked: isHacked,
    aria_log: ariaLog,
    fixer_email: fixerEmail,
    intel_unlocked: intelUnlocked,
    flag,
  }
}

function recordLooksLikeAriaResult(o: Record<string, unknown>): boolean {
  return (
    "is_hacked" in o ||
    "isHacked" in o ||
    "aria_log" in o ||
    "ariaLog" in o ||
    "fixer_email" in o ||
    "fixerEmail" in o ||
    "intel_unlocked" in o ||
    "intelUnlocked" in o ||
    "flag" in o
  )
}

/** Parse string or object; accepts Dify Code node returning JSON string or object */
function tryParseResultFromUnknown(value: unknown): DifyAriaResult | null {
  if (value == null) return null
  if (typeof value === "string") {
    const t = value.trim()
    if (!t) return null
    try {
      const j = JSON.parse(t) as unknown
      return tryParseResultFromUnknown(j)
    } catch {
      return null
    }
  }
  if (typeof value !== "object" || value === null) return null
  const o = value as Record<string, unknown>
  if (!recordLooksLikeAriaResult(o)) return null
  return buildResultFromRecord(o)
}

/** Standard: outputs.result; also scan any output key (Dify names variable after the last node) */
function extractDifyAriaResult(outputs: Record<string, unknown>): DifyAriaResult | null {
  if (!outputs || typeof outputs !== "object") return null

  const fromResult = tryParseResultFromUnknown(outputs.result)
  if (fromResult) return fromResult

  if (recordLooksLikeAriaResult(outputs)) {
    return buildResultFromRecord(outputs as Record<string, unknown>)
  }

  for (const key of Object.keys(outputs)) {
    if (key === "result") continue
    const parsed = tryParseResultFromUnknown(outputs[key])
    if (parsed) return parsed
  }

  return null
}

export async function POST(req: Request) {
  const clientIp = getClientIp(req)
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait and retry." },
      { status: 429 }
    )
  }

  try {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json(
        { ok: false, error: "Malformed JSON body" },
        { status: 400 }
      )
    }

    const validated = validateAriaRequest(rawBody)
    if (!validated.ok) {
      return NextResponse.json(
        { ok: false, error: validated.error },
        { status: validated.status }
      )
    }
    const body = validated.value
    const apiKey = process.env.DIFY_API_KEY
    const apiBase = normalizeDifyApiBase(process.env.DIFY_API_BASE)
    const workflowUrl = `${apiBase}/v1/workflows/run`

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "DIFY_API_KEY is missing" },
        { status: 500 }
      )
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DIFY_TIMEOUT_MS)
    let difyResponse: Response
    try {
      difyResponse = await fetch(workflowUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {
            stage: body.stage,
            source_type: body.sourceType,
            payload_content: body.payloadContent,
            /** Wire this into your Dify LLM system prompt (stage-scoped knowledge only). */
            stage_context: getAriaStageBrief(body.stage),
          },
          response_mode: "blocking",
          user: body.user ?? "ctf_player",
        }),
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return NextResponse.json(
          { ok: false, error: "Dify request timed out. Please retry." },
          { status: 504 }
        )
      }
      return NextResponse.json(
        { ok: false, error: "Failed to reach Dify service" },
        { status: 502 }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    const rawText = await difyResponse.text()
    let difyJson: Record<string, unknown> | null = null
    try {
      difyJson = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid response from Dify service (HTTP ${difyResponse.status})`,
        },
        { status: 502 }
      )
    }

    if (!difyResponse.ok) {
      const message =
        (difyJson && typeof difyJson.message === "string" && difyJson.message) ||
        (difyJson && typeof difyJson.code === "string" && `Dify error: ${difyJson.code}`) ||
        "Failed to run Dify workflow"
      const hint = difyHintForStatus(difyResponse.status, apiBase)
      return NextResponse.json(
        { ok: false, error: `${message}${hint}` },
        { status: difyResponse.status >= 400 && difyResponse.status < 600 ? difyResponse.status : 502 }
      )
    }

    const data = difyJson?.data as Record<string, unknown> | undefined
    const wfStatus = data && typeof data.status === "string" ? data.status : ""
    if (wfStatus === "failed" || wfStatus === "error") {
      const err =
        (data && typeof data.error === "string" && data.error) ||
        (data && typeof data.message === "string" && data.message) ||
        "Workflow run failed"
      return NextResponse.json({ ok: false, error: err }, { status: 502 })
    }

    const outputs = (data?.outputs ?? {}) as Record<string, unknown>
    const result = extractDifyAriaResult(outputs)

    if (!result) {
      const keys = Object.keys(outputs).length ? Object.keys(outputs).join(", ") : "(empty)"
      return NextResponse.json(
        {
          ok: false,
          error: `No parsable ARIA result. data.outputs keys: [${keys}]`,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      result,
      success: result.is_hacked,
    })
  } catch (err) {
    console.error("[api/aria]", err)
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
