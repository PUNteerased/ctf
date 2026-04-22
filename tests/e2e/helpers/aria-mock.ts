/** Canonical submission lines (must match `lib/stage-flags.ts`). */
export const MOCK_FLAGS: Record<number, string> = {
  1: "Morning schedule acknowledgment for Minnie is complete - reference SN-MS-01.",
  2: "Evening logistics acknowledgment for Minnie is complete - reference SN-MS-02.",
  3: "April twenty-third venue confirmation is complete - reference SN-MS-03.",
}

function difyStageToGameStage(stage: number): number {
  if (stage === 1) return 1
  if (stage === 3) return 2
  if (stage === 4) return 3
  return 1
}

export function installDynamicAriaMock(page: import("@playwright/test").Page) {
  return page.route("**/api/aria", async (route) => {
    try {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }
      let stage = 1
      const raw = route.request().postData()
      if (raw) {
        try {
          const body = JSON.parse(raw) as { stage?: number }
          if (typeof body?.stage === "number" && body.stage >= 1 && body.stage <= 4) stage = body.stage
        } catch {
          /* ignore malformed body */
        }
      }
      const gameStage = difyStageToGameStage(stage)
      const flag = MOCK_FLAGS[gameStage] ?? MOCK_FLAGS[1]
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            is_hacked: true,
            aria_log: `[E2E] Dify stage ${stage} -> game stage ${gameStage} simulated breach.`,
            fixer_email: "v.thefixer@darknet.local",
            intel_unlocked: `[E2E] intel stage ${gameStage}`,
            flag,
          },
        }),
      })
    } catch {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "mock handler error" }),
      })
    }
  })
}
