import { expect, type Page } from "@playwright/test";
import { E2E_CODE, mintLoginCode } from "./otp.ts";

/**
 * Drive the two-step form on /login: email, then the emailed code.
 *
 * Shared because first sign-in and returning sign-in go through exactly the same
 * forms and diverge only in where they land afterwards. Assumes the browser is
 * already on /login.
 */
export async function submitEmailAndCode(page: Page, email: string): Promise<void> {
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();

  // The form swaps to step 2 in place, no navigation, and echoes the address.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await mintLoginCode(email);
  await page.getByLabel("Code").fill(E2E_CODE);
  await page.getByRole("button", { name: "Verify" }).click();
}
