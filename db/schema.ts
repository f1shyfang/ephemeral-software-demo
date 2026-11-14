import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const demoGenerations = sqliteTable(
  "demo_generations",
  {
    id: text("id").primaryKey(),
    visitor: text("visitor").notNull(),
    day: text("day").notNull(),
  },
  (table) => [
    index("demo_generations_day").on(table.day),
    index("demo_generations_visitor_day").on(table.visitor, table.day),
  ],
);
export const githubCache = sqliteTable("github_cache", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
