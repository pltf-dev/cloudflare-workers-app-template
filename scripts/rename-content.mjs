// Pure text transform shared by the CLI (scripts/rename.mjs) and its test. Kept free
// of node:fs so it can run inside the workerd test pool.

export const PLACEHOLDERS = Object.freeze({
  name: "cf-app",
  display: "CF App",
  domain: "cf-app.example.com",
});

/** "my-cool-app" → "My Cool App" @param {string} slug */
export function titleCase(slug) {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * @param {{ name: string, domain?: string, display?: string }} options
 * @returns {{ name: string, domain: string, display: string }}
 */
export function normalizeOptions({ name, domain, display }) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`app name must be lowercase letters, digits and dashes, got "${name}"`);
  }
  return {
    name,
    domain: domain ?? `${name}.example.com`,
    display: display ?? titleCase(name),
  };
}

/**
 * Replace every placeholder in `text`. Domain first (it contains the name), then the
 * display name, then the bare name, so a longer match is never split by a shorter one.
 */
/**
 * @param {string} text
 * @param {{ name: string, domain?: string, display?: string }} options
 */
export function renameContent(text, options) {
  const { name, domain, display } = normalizeOptions(options);
  return text
    .split(PLACEHOLDERS.domain).join(domain)
    .split(PLACEHOLDERS.display).join(display)
    .split(PLACEHOLDERS.name).join(name);
}
