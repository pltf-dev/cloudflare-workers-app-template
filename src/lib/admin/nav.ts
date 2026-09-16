export type NavKey = "items" | "account";

export interface NavItem { key: NavKey; label: string; href: string }
export interface NavSection { id: "manage" | "settings"; label: string; items: NavItem[] }

// Canonical admin destinations, grouped and in display order, so section
// membership and order are one fact. The first section is what the desktop bar
// renders inline; every section renders inside the header's menu panel.
const NAV: NavSection[] = [
  { id: "manage", label: "Manage", items: [{ key: "items", label: "Items", href: "/admin/items" }] },
  { id: "settings", label: "Settings", items: [{ key: "account", label: "Account", href: "/admin/account" }] },
];

export function adminNavSections(): NavSection[] {
  return NAV;
}

export function adminNav(): NavItem[] {
  return NAV.flatMap((section) => section.items);
}
