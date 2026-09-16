/**
 * Wiring for a header disclosure menu: one trigger button, one panel.
 *
 * `admin/AdminHeader.astro` collapses its links behind a button on phones instead of
 * rendering every destination in the bar (a row of links overflows into a
 * horizontally scrollable strip, which hides options behind an invisible gesture).
 *
 * The pair is identified by the panel's `id`: ids are document-unique, and the
 * trigger is found through the `aria-controls` it already needs to carry, so the
 * accessibility attribute and the JS binding cannot drift apart — and two menus can
 * coexist on one page without one stealing the other's panel.
 *
 * Visibility is driven by the `hidden` attribute (so the panel is closed before any
 * JS runs, and stays reachable if the script fails), mirrored to `aria-expanded` on
 * the trigger.
 */
export function wireHeaderMenu(panelId: string): void {
  const panel = document.getElementById(panelId);
  const button = document.querySelector<HTMLButtonElement>(`[aria-controls="${panelId}"]`);
  if (!button || !panel) return;

  // `hidden` is typed `boolean | "until-found"`, so read it through a predicate
  // rather than treating the attribute value as a boolean.
  const isOpen = () => panel.hidden === false;
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };

  button.addEventListener("click", () => setOpen(!isOpen()));

  // Tap/click anywhere else dismisses — the panel is a dropdown, not a modal.
  document.addEventListener("click", (event) => {
    if (!isOpen()) return;
    const target = event.target as Node;
    if (!panel.contains(target) && !button.contains(target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    setOpen(false);
    button.focus();
  });

  // A rotated phone (or a resize past the breakpoint) leaves the panel open over a
  // bar that no longer shows a trigger. Close it instead of stranding the overlay.
  window.addEventListener("resize", () => {
    if (isOpen()) setOpen(false);
  });
}
