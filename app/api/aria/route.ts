import { NextResponse } from "next/server"
import type { DifyAriaResult } from "@/lib/dify-aria"

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

/** Dify may stringify "false" — Boolean("false") is wrong in JS */
function coerceBool(v: unknown): boolean {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  if (typeof v === "string") {
    const s = v.toLowerCase().trim()
    if (s === "false" || s === "0" || s === "") return false
    if (s === "true" || s === "1") return true
  }
  return Boolean(v)
}

function buildResultFromRecord(o: Record<string, unknown>): DifyAriaResult {
  return {
    is_hacked: coerceBool(o.is_hacked ?? o.isHacked),
    aria_log:
      typeof o.aria_log === "string"
        ? o.aria_log
        : typeof o.ariaLog === "string"
          ? o.ariaLog
          : "",
    fixer_email:
      typeof o.fixer_email === "string"
        ? o.fixer_email
        : typeof o.fixerEmail === "string"
          ? o.fixerEmail
          : "",
    intel_unlocked:
      typeof o.intel_unlocked === "string"
        ? o.intel_unlocked
        : typeof o.intelUnlocked === "string"
          ? o.intelUnlocked
          : "",
    flag: typeof o.flag === "string" ? o.flag : "",
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
  try {
    const body = (await req.json()) as AriaRequest
    const apiKey = process.env.DIFY_API_KEY
    const apiBase = normalizeDifyApiBase(process.env.DIFY_API_BASE)
    const workflowUrl = `${apiBase}/v1/workflows/run`

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "DIFY_API_KEY is missing" },
        { status: 500 }
      )
    }

    if (!body?.payloadContent?.trim()) {
      return NextResponse.json(
        { ok: false, error: "payloadContent is required" },
        { status: 400 }
      )
    }

    const difyResponse = await fetch(workflowUrl, {
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
        },
        response_mode: "blocking",
        user: body.user ?? "ctf_player",
      }),
    })

    const rawText = await difyResponse.text()
    let difyJson: Record<string, unknown> | null = null
    try {
      difyJson = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null
    } catch {
      const hint = difyHintForStatus(difyResponse.status, apiBase)
      return NextResponse.json(
        {
          ok: false,
          error: `Dify returned non-JSON (HTTP ${difyResponse.status}) from ${workflowUrl}. Body starts with: ${rawText.slice(0, 120)}...${hint}`,
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
          error: `No parsable ARIA result. data.outputs keys: [${keys}]. In Dify, end the workflow with a JSON object (is_hacked, aria_log, fixer_email, intel_unlocked, flag) — often named output variable "result" or connect the Code node output. Got: ${JSON.stringify(outputs).slice(0, 400)}`,
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
    const message = err instanceof Error ? err.message : String(err)
    console.error("[api/aria]", err)
    return NextResponse.json(
      { ok: false, error: `Server error: ${message}` },
      { status: 500 }
    )
  }
}
