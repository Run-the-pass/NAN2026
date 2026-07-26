import { desc, sql } from "drizzle-orm";
import { parseSession } from "../../../game/session.js";
import { getDb } from "../../../db";
import { playtestSessions } from "../../../db/schema";

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  const detail =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";
  const combined = `${message}\n${detail}`;
  if (
    combined.includes("no such table") ||
    combined.includes("playtest_sessions")
  ) {
    return "playtest_sessions 테이블이 없습니다. `npm run db:generate`로 마이그레이션을 만든 뒤 배포하면 플랫폼이 실제 D1에 적용합니다.";
  }
  return message;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const parsed = parseSession(payload);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: 400 });
  }
  try {
    const db = getDb();
    const [session] = await db
      .insert(playtestSessions)
      .values(parsed.value)
      .returning();
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

// 목표치 튜닝용 집계와 최근 세션을 함께 반환한다.
export async function GET() {
  try {
    const db = getDb();
    const [summary] = await db
      .select({
        total: sql<number>`count(*)`,
        wins: sql<number>`sum(case when ${playtestSessions.result} = 'won' then 1 else 0 end)`,
        avgBooks: sql<number | null>`avg(${playtestSessions.booksSubmitted})`,
        avgElapsedMs: sql<number | null>`avg(${playtestSessions.elapsedMs})`,
        avgConfidence: sql<number | null>`avg(${playtestSessions.avgConfidence})`,
      })
      .from(playtestSessions);
    const recent = await db
      .select()
      .from(playtestSessions)
      .orderBy(desc(playtestSessions.createdAt), desc(playtestSessions.id))
      .limit(20);
    return Response.json({ summary, recent });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
