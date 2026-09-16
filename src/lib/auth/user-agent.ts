/** Turn a raw User-Agent string into a short device label, e.g. "iPhone · Safari". */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const os = detectOs(ua);
  const browser = detectBrowser(ua);
  if (!os && !browser) return "Unknown device";
  if (os && browser) return `${os} · ${browser}`;
  return (os ?? browser) as string;
}

function detectOs(ua: string): string | null {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

function detectBrowser(ua: string): string | null {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/CriOS\//i.test(ua)) return "Chrome";
  if (/FxiOS\//i.test(ua)) return "Firefox";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return null;
}
