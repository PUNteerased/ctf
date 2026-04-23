import type { Locator, Page } from "@playwright/test"

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Boot LarbOS from power-off screen to desktop (instant click — for fast CI smoke). */
export async function bootToDesktop(page: Page) {
  await page.goto("/")
  const skipTutorial = page.getByRole("button", { name: "Skip tutorial" })
  if (await skipTutorial.isVisible().catch(() => false)) {
    await skipTutorial.click()
  }
  await page.getByRole("button", { name: "Power On" }).click()
  await page.getByText("MISSION", { exact: false }).waitFor({ state: "visible", timeout: 15_000 })
}

/** Open Email Client from the desktop shortcut (not taskbar duplicate). */
export async function openEmailClient(page: Page) {
  await page.getByRole("button", { name: "Email Client" }).first().click()
  await page.getByText("Email Client").first().waitFor({ state: "visible", timeout: 10_000 })
}

/** Open Document app from desktop shortcut. */
export async function openBrowser(page: Page) {
  await page.getByRole("button", { name: "Document" }).first().click()
  await page.getByText("Document").first().waitFor({ state: "visible", timeout: 10_000 })
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

/**
 * Open the ARIA inbox row whose accessible name includes `subjectPattern` and read the
 * confirmation from the message body. Prefers the quoted sentence under "Please retain…";
 * falls back to SN-MS-0x if present. Uses the last matching row (newest) when the list has duplicates.
 */
export async function extractAriaConfirmationToken(page: Page, subjectPattern: RegExp): Promise<string> {
  await closeSecondWindowIfPresent(page)
  const row = page.getByRole("button", { name: subjectPattern }).last()
  await row.click()
  const bodyEl = page.locator("div.text-zinc-300.text-sm.whitespace-pre-wrap").first()
  await bodyEl.waitFor({ state: "visible", timeout: 10_000 })
  const text = await bodyEl.innerText()
  const afterRetain =
    /Please retain this agency confirmation for mission submission:\s*\r?\n\r?\n"([^"]+)"/.exec(text) ??
    /Please retain this agency confirmation for mission submission:\s*\n\s*"([^"]+)"/.exec(text)
  if (afterRetain?.[1]?.trim()) return afterRetain[1].trim()
  const ref = text.match(/\bSN-MS-0[1-3]\b/)
  if (ref) return ref[0]
  throw new Error(
    `Could not extract ARIA confirmation token. Subject: ${subjectPattern}. Body preview:\n${text.slice(0, 500)}`
  )
}
