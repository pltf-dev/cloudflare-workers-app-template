export type ToastVariant = "success" | "error";

/** Fire a toast from anywhere (React island or inline script). SSR-safe no-op. */
export function showToast(message: string, variant: ToastVariant = "success"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, variant } }));
}
