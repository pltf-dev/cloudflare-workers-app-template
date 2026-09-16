import { expect, test } from "@playwright/test";
import { loadAccount } from "./support/account.ts";
import { submitEmailAndCode } from "./support/login.ts";

// A returning user arrives with no cookies: the whole point of this spec is
// that the session is rebuilt from the emailed code alone.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Happy path 2: an existing user signs back in and is returned to where they
 * were going.
 */
test("returning user signs in with a code and lands where they were headed", async ({ page }) => {
  const account = loadAccount();

  await page.goto("/admin/account");
  // No session yet: the middleware bounces to /login and remembers the destination.
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Faccount$/);

  await submitEmailAndCode(page, account.email);

  await expect(page).toHaveURL(/\/admin\/account$/);
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  await expect(page.getByText(account.email)).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
});
