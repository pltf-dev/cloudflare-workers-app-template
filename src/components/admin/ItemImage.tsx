import { useState } from "react";
import { showToast } from "../../lib/toast";

interface Props {
  itemId: number;
  imageUrl: string | null;
}

/**
 * The one React island in the template: an image uploader that posts multipart
 * to /api/admin/items/[id]/image and swaps the preview in place.
 */
export default function ItemImage({ itemId, imageUrl }: Props) {
  const [url, setUrl] = useState<string | null>(imageUrl);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/items/${itemId}/image`, { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; imageUrl?: string; error?: string };
      if (!data.ok) throw new Error(data.error ?? "upload");
      setUrl(data.imageUrl ?? null);
      showToast("Image uploaded");
    } catch (err) {
      const reason = err instanceof Error ? err.message : "upload";
      showToast(reason === "size" ? "That file is over 5 MB." : reason === "type" ? "Only PNG, JPEG, WebP or GIF." : "Upload failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/items/${itemId}/image`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setUrl(null);
      showToast("Image removed");
    } catch {
      showToast("Couldn't remove the image.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-image" style={{ display: "grid", gap: 12 }}>
      {url ? (
        <img src={url} alt="" style={{ width: "100%", borderRadius: 12, display: "block" }} data-testid="item-image" />
      ) : (
        <div style={{ aspectRatio: "16 / 9", borderRadius: 12, background: "var(--color-paper-2)" }} />
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className="btn-pill" style={{ cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Working…" : url ? "Replace image" : "Add image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {url && (
          <button type="button" className="btn-pill btn-pill--danger" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
