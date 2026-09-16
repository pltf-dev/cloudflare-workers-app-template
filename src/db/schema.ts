import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  lastSeen: integer("last_seen", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  userAgent: text("user_agent"),
  location: text("location"),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
]);

export const authCodes = sqliteTable("auth_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  // Magic-link credential. Deliberately a SECOND credential on the same row:
  // `used_at` retires the typed 6-digit code, `link_used_at` retires the link.
  // Keeping them separate means an email scanner that prefetches the link
  // cannot invalidate the code the user is about to type.
  linkTokenHash: text("link_token_hash"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  linkUsedAt: integer("link_used_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("auth_codes_email_created_idx").on(table.email, table.createdAt),
  // The token alone identifies the row, so no email needs to ride in the URL.
  uniqueIndex("auth_codes_link_token_idx").on(table.linkTokenHash),
]);
