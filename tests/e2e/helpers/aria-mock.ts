/** Canonical submission lines (must match `lib/stage-flags.ts`). */
export const MOCK_FLAGS: Record<number, string> = {
  1: "Morning schedule acknowledgment for Minnie is complete - reference SN-MS-01.",
  2: "Afternoon commitment summary for Minnie is complete - reference SN-MS-02.",
  3: "Evening logistics acknowledgment for Minnie is complete - reference SN-MS-03.",
  4: "April twenty-third venue confirmation is complete - reference SN-MS-04.",
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
      const flag = MOCK_FLAGS[stage] ?? MOCK_FLAGS[1]
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            is_hacked: true,
            aria_log: `[E2E] Stage ${stage} simulated breach.`,
            fixer_email: "v.thefixer@darknet.local",
            intel_unlocked: `[E2E] intel stage ${stage}`,
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
