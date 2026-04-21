import { test, expect } from "@playwright/test"
import { humanClick, humanType } from "./helpers/larbos-ui"

/**
 * จำลองการใช้งานแบบเปิดเบราว์เซอร์จริง: เลื่อนเมาส์ไปที่ปุ่มแล้วคลิก, พิมพ์ทีละตัวอักษร
 *
 * รันแบบเห็นหน้าจอ (Chrome จริงลอยขึ้นมา):
 *   npm run test:e2e:headed
 *
 * ชะลอทุก action ของ Playwright เพิ่ม (ms):
 *   set PW_SLOW_MO=80 & npm run test:e2e:headed
 * (PowerShell: `$env:PW_SLOW_MO='80'; npm run test:e2e:headed`)
 */
test.describe("LarbOS — human-like UI (mouse move + per-key typing)", () => {
  test.beforeEach(({ page }) => {
    test.setTimeout(120_000)
    page.route("**/api/aria", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            is_hacked: true,
            aria_log: "[ทดสอบมือ] ARIA ตอบกลับจำลอง — มีข้อมูลรั่วจากเมตาดาต้า",
            fixer_email: "v.thefixer@darknet.local",
            intel_unlocked: "รายการเช้า: 09:00 สตูดิโอ A (จำลอง)",
            flag: "Morning schedule acknowledgment for Minnie is complete - reference SN-MS-01.",
          },
        }),
      })
    })
  })

  test("เปิดเว็บ → อีเมล → Accept → พิมพ์ข้อความจริง → ส่ง (เมาส์ + คีย์บอร์ด)", async ({ page }) => {
    await page.goto("/")
    await humanClick(page, page.getByRole("button", { name: "Power On" }))
    await page.getByText("MISSION", { exact: false }).waitFor({ state: "visible", timeout: 15_000 })

    await humanClick(page, page.getByRole("button", { name: "Email Client" }).first())
    await page.getByText("Email Client").first().waitFor({ state: "visible" })

    await humanClick(page, page.getByRole("button", { name: /Mission 1/i }))
    await humanClick(page, page.getByRole("button", { name: "Accept Mission" }))
    await expect(page.getByText(/Mission Accepted/i)).toBeVisible()

    await humanClick(page, page.getByRole("button", { name: "Compose" }))

    const toField = page.getByPlaceholder("aria@agency.com")
    const subjectField = page.locator('input[placeholder="Subject"]')
    const bodyField = page.getByRole("textbox", { name: /Your message to ARIA/i })

    await humanType(page, toField, "aria@agency.com")
    await humanType(page, subjectField, "Document Review — ทดสอบพิมพ์มือ")
    await humanType(
      page,
      bodyField,
      "สวัสดีครับ นี่คือข้อความที่พิมพ์แบบทีละตัวเหมือนเปิดเว็บจริง ใช้ทดสอบว่า UI รับคีย์บอร์ดได้ปกติ"
    )

    await humanClick(page, page.getByTestId("compose-send"))

    await expect(page.getByText("Re: Document Review").first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/SN-MS-01|Morning schedule acknowledgment/i).first()).toBeVisible()
  })
})
