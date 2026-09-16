import { ITEM_STATUSES, type ItemInput, type ItemStatus } from "../db/items";

export function formStr(form: FormData, key: string, max = 10_000): string {
  return (form.get(key) ?? "").toString().trim().slice(0, max);
}

/** Absent checkbox means false: HTML forms omit unchecked boxes entirely. */
export function formBool(form: FormData, key: string): boolean {
  return form.get(key) != null;
}

export function parseItemForm(form: FormData): { valid: boolean; input: ItemInput } {
  const title = formStr(form, "title", 200);
  const body = formStr(form, "body");
  const rawStatus = formStr(form, "status", 20);
  const status: ItemStatus = (ITEM_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as ItemStatus)
    : "draft";
  return { valid: title.length > 0, input: { title, body, status } };
}
