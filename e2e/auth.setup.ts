import { expect, test as setup } from "@playwright/test";
import { newAccount, saveAccount } from "./support/account.ts";
import { STORAGE_STATE } from "./support/env.ts";
import { submitEmailAndCode } from "./support/login.ts";

/**
 * Happy path 1: a new user signs in for the first time and an account is created.
 *
 * Runs as the `setup` project: a real test of first sign-in AND the precondition
 * for every spec that follows, which reuse its session and user.
 */
setup("first sign-in creates the account and lands in the admin", async ({ page }) => {
  const account = newAccount();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await submitEmailAndCode(page, account.email);

  // /admin redirects to the items board, the user's real landing page.
  await expect(page).toHaveURL(/\/admin\/items$/);
  await expect(page.getByRole("heading", { name: "Items", exact: true })).toBeVisible();
  await expect(page.getByText("No items yet.")).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
  saveAccount(account);
});
