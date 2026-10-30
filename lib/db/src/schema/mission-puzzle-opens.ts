import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const missionPuzzleOpensTable = pgTable(
  "mission_puzzle_opens",
  {
    agent: text("agent").notNull(),
    puzzle: integer("puzzle").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.agent, table.puzzle] })],
);

export const insertMissionPuzzleOpenSchema = createInsertSchema(missionPuzzleOpensTable).omit({
  openedAt: true,
});

export type InsertMissionPuzzleOpen = z.infer<typeof insertMissionPuzzleOpenSchema>;
export type MissionPuzzleOpenRow = typeof missionPuzzleOpensTable.$inferSelect;
