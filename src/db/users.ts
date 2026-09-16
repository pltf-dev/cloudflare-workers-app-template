import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { users } from "./schema";

export type User = typeof users.$inferSelect;

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function getUserById(db: Db, id: number): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function createUser(db: Db, input: { email: string; name?: string | null }): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({ email: input.email, name: input.name ?? null, createdAt: new Date() })
    .returning();
  return row;
}
