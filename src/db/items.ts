import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { items } from "./schema";

export type Item = typeof items.$inferSelect;
export type ItemStatus = Item["status"];
export const ITEM_STATUSES: readonly ItemStatus[] = ["draft", "published"];

export interface ItemInput {
  title: string;
  body: string;
  status: ItemStatus;
}

export async function listPublishedItems(db: Db): Promise<Item[]> {
  return db.select().from(items).where(eq(items.status, "published")).orderBy(desc(items.createdAt));
}

export async function listItemsForUser(db: Db, userId: number): Promise<Item[]> {
  return db.select().from(items).where(eq(items.userId, userId)).orderBy(desc(items.createdAt));
}

export async function getItem(db: Db, id: number): Promise<Item | null> {
  const [row] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  return row ?? null;
}

export async function getItemForUser(db: Db, userId: number, id: number): Promise<Item | null> {
  const [row] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createItem(db: Db, userId: number, input: ItemInput): Promise<Item> {
  const now = new Date();
  const [row] = await db
    .insert(items)
    .values({ ...input, userId, createdAt: now, updatedAt: now })
    .returning();
  return row;
}

/** False when the item does not exist or belongs to someone else. */
export async function updateItem(db: Db, userId: number, id: number, input: ItemInput): Promise<boolean> {
  const rows = await db
    .update(items)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .returning({ id: items.id });
  return rows.length > 0;
}

export async function deleteItem(db: Db, userId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .returning({ id: items.id });
  return rows.length > 0;
}

export async function setItemImage(db: Db, userId: number, id: number, imageKey: string | null): Promise<boolean> {
  const rows = await db
    .update(items)
    .set({ imageKey, updatedAt: new Date() })
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .returning({ id: items.id });
  return rows.length > 0;
}
