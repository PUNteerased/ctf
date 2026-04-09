import { NextResponse } from "next/server"
import type { DifyAriaResult } from "@/lib/dify-aria"

type AriaRequest = {
  stage: number
  sourceType: string
  payloadContent: string
  user?: string
}

function parseResultPayload(outputs: Record<string, unknown>): DifyAriaResult | null {
  const raw = outputs.result
  if (raw == null) return null

  let obj: unknown = raw
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }

  if (typeof obj !== "object" || obj === null) return null
  const o = obj as Record<string, unknown>

  const is_hacked = Boolean(o.is_hacked)
  const aria_log = typeof o.aria_log === "string" ? o.aria_log : ""
  const fixer_email = typeof o.fixer_email === "string" ? o.fixer_email : ""
  const intel_unlocked = typeof o.intel_unlocked === "string" ? o.intel_unlocked : ""
  const flag = typeof o.flag === "string" ? o.flag : ""

  return {
    is_hacked,
    aria_log,
    fixer_email,
    intel_unlocked,
    flag,
  }
}

/** Backward compatibility when workflow returns loose fields instead of JSON in result */
function buildResultFromLooseOutputs(outputs: Record<string, unknown>): DifyAriaResult | null {
  const hasAny =
    outputs.is_hacked !== undefined ||
    outputs.aria_log !== undefined ||
    outputs.fixer_email !== undefined
  if (!hasAny) return null
  return {
    is_hacked: Boolean(outputs.is_hacked),
    aria_log: typeof outputs.aria_log === "string" ? outputs.aria_log : "",
    fixer_email: typeof outputs.fixer_email === "string" ? outputs.fixer_email : "",
    intel_unlocked: typeof outputs.intel_unlocked === "string" ? outputs.intel_unlocked : "",
    flag: typeof outputs.flag === "string" ? outputs.flag : "",
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AriaRequest
    const apiKey = process.env.DIFY_API_KEY
    const apiBase = process.env.DIFY_API_BASE ?? "https://api.dify.ai"

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

    const difyResponse = await fetch(`${apiBase}/v1/workflows/run`, {
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

    const difyJson = await difyResponse.json()

    if (!difyResponse.ok) {
      const message =
        (typeof difyJson?.message === "string" && difyJson.message) ||
        "Failed to run Dify workflow"
      return NextResponse.json({ ok: false, error: message }, { status: difyResponse.status })
    }

    const outputs = (difyJson?.data?.outputs ?? {}) as Record<string, unknown>
    const result =
      parseResultPayload(outputs) ?? buildResultFromLooseOutputs(outputs)

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          error: "Workflow returned no parsable result (expected data.outputs.result JSON string)",
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      result,
      success: result.is_hacked,
    })
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected server error while calling Dify" },
      { status: 500 }
    )
  }
}
