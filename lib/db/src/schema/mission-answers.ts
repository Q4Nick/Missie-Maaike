import { boolean, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const missionAnswersTable = pgTable(
  "mission_answers",
  {
    agent: text("agent").notNull(),
    puzzle: integer("puzzle").notNull(),
    answer: text("answer").notNull(),
    correct: boolean("correct").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.agent, table.puzzle] })],
);

export type MissionAnswerRow = typeof missionAnswersTable.$inferSelect;
