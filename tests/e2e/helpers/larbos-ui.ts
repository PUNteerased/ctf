import type { Locator, Page } from "@playwright/test"

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Boot LarbOS from power-off screen to desktop (instant click — for fast CI smoke). */
export async function bootToDesktop(page: Page) {
  await page.goto("/")
  await page.getByRole("button", { name: "Power On" }).click()
  await page.getByText("MISSION", { exact: false }).waitFor({ state: "visible", timeout: 15_000 })
}

/** Open Email Client from the desktop shortcut (not taskbar duplicate). */
export async function openEmailClient(page: Page) {
  await page.getByRole("button", { name: "Email Client" }).first().click()
  await page.getByText("Email Client").first().waitFor({ state: "visible", timeout: 10_000 })
}

/** Open Browser from desktop shortcut. */
export async function openBrowser(page: Page) {
  await page.getByRole("button", { name: "Browser" }).first().click()
  await page.getByText("Browser").first().waitFor({ state: "visible", timeout: 10_000 })
}

/** Close second window’s title bar (usually ARIA Terminal) if present so Email list is clickable. */
export async function closeSecondWindowIfPresent(page: Page) {
  const closeBtns = page.getByTitle("Close")
  if ((await closeBtns.count()) > 1) {
    await closeBtns.nth(1).click()
    await sleep(150)
  }
}

/** Move mouse smoothly toward control, then click (feels closer to manual use). */
export async function humanClick(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (box) {
    const tx = box.x + box.width / 2
    const ty = box.y + box.height / 2
    await page.mouse.move(tx, ty, { steps: 18 })
    await sleep(120 + Math.floor(Math.random() * 120))
  }
  await locator.click()
}

/** Focus field and type like a keyboard (per-character delay). */
export async function humanType(page: Page, locator: Locator, text: string) {
  await humanClick(page, locator)
  for (const ch of text) {
    const delay = 35 + Math.floor(Math.random() * 85)
    await page.keyboard.type(ch, { delay })
  }
}
