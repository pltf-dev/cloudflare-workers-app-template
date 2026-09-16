import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/photo.png");
const TITLE = `Published by E2E ${Date.now().toString(36)}`;

/**
 * Happy path 3: create an item, add an image, publish it, and see it live on the
 * public site. Exercises the form endpoints, the R2 upload island, the media
 * route and the public pages in one pass.
 */
test("user creates, illustrates and publishes an item that appears on the public site", async ({ page }) => {
  await page.goto("/admin/items");
  await page.getByRole("link", { name: "New item" }).first().click();
  await expect(page).toHaveURL(/\/admin\/items\/new$/);

  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Body").fill("First paragraph.\n\nSecond paragraph.");
  await page.getByRole("button", { name: "Create item" }).click();

  // Create redirects to the edit page with a saved marker.
  await expect(page).toHaveURL(/\/admin\/items\/\d+\/edit\?saved=1$/);
  await expect(page.getByText("Saved.")).toBeVisible();
  const itemId = page.url().match(/\/items\/(\d+)\//)![1];

  // The uploader is a React island. Astro server-renders it, so the file input
  // exists well before any handler does; a change event dispatched then is lost.
  // <astro-island> ships with an `ssr` attribute and drops it once hydrated. Both
  // waits, in this order: "no island has ssr" alone is satisfied by an empty page.
  const island = page.locator("astro-island");
  await expect(island).toHaveCount(1);
  await expect(island).not.toHaveAttribute("ssr", "");

  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  const img = page.getByTestId("item-image");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", new RegExp(`^/media/items/${itemId}/`));
  // Served back out of R2 through /media: a bad key or a 404 leaves this at 0.
  await expect(img).not.toHaveJSProperty("naturalWidth", 0);

  await page.getByLabel("Status").selectOption("published");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText(`#${itemId} · published`)).toBeVisible();

  // Live on the public site.
  await page.goto("/");
  const card = page.getByRole("link", { name: TITLE });
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`));
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(page.getByText("Second paragraph.")).toBeVisible();
  await expect(page.locator("img.cover")).not.toHaveJSProperty("naturalWidth", 0);

  // And in the JSON API.
  const res = await page.request.get("/api/items");
  const body = (await res.json()) as { items: Array<{ id: number; title: string }> };
  expect(body.items.some((i) => String(i.id) === itemId && i.title === TITLE)).toBe(true);
});
