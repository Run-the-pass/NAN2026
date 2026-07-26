import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 3분 펀테스트 한 판의 요약 지표.
// 목표치(8권) 튜닝과 "음성 지휘가 재미있는가 / 실패가 내 실수로 느껴지는가"
// 가설 검증에 필요한 최소 데이터만 저장한다.
export const playtestSessions = sqliteTable("playtest_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seed: integer("seed").notNull(),
  result: text("result").notNull(), // "won" | "lost"
  booksSubmitted: integer("books_submitted").notNull(),
  goal: integer("goal").notNull(),
  elapsedMs: integer("elapsed_ms").notNull(), // 실제로 플레이한 시간
  voiceCommands: integer("voice_commands").notNull().default(0),
  buttonCommands: integer("button_commands").notNull().default(0),
  voiceFailures: integer("voice_failures").notNull().default(0),
  avgConfidence: real("avg_confidence"), // 음성 명령이 없으면 null
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type PlaytestSessionRow = typeof playtestSessions.$inferSelect;
export type PlaytestSessionInsert = typeof playtestSessions.$inferInsert;
