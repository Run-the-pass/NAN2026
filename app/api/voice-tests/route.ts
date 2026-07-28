import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { voiceTestResults } from "../../../db/schema";
import { inspectPhrase } from "../../../game/phrase.js";
import {
  parseVoiceTest,
  voiceLabSquad,
  voiceTestRow,
} from "../../../game/voice-test.js";
import type { ActorId } from "../../../game/core.js";
import { getChatGPTUser } from "../../chatgpt-auth";

const columns = [
  "id",
  "batchId",
  "createdAt",
  "expectedActor",
  "expectedItem",
  "expectedTarget",
  "expectedPhrase",
  "transcript",
  "sttConfidence",
  "durationMs",
  "localStatus",
  "localActor",
  "localItem",
  "localTarget",
  "localMatches",
  "localActorMatch",
  "localItemMatch",
  "localTargetMatch",
  "localAllMatch",
  "geminiStatus",
  "geminiCommands",
  "geminiActor",
  "geminiItem",
  "geminiTarget",
  "geminiConfidence",
  "geminiReason",
  "geminiActorMatch",
  "geminiItemMatch",
  "geminiTargetMatch",
  "geminiAllMatch",
] as const;

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  return message.includes("voice_test_results")
    ? "voice_test_results 테이블이 없습니다. D1 마이그레이션을 적용해 주세요."
    : message;
}

function csv(rows: Record<string, unknown>[]) {
  const escape = (value: unknown) => {
    const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${columns.join(",")}\n${rows
    .map((row) => columns.map((column) => escape(row[column])).join(","))
    .join("\n")}`;
}

async function authorized() {
  return Boolean(await getChatGPTUser());
}

function withLocalMatches(row: typeof voiceTestResults.$inferSelect) {
  return {
    ...row,
    localMatches: inspectPhrase(
      row.transcript,
      voiceLabSquad(row.expectedActor as ActorId),
    ).matches,
  };
}

export async function POST(request: Request) {
  if (!(await authorized())) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const parsed = parseVoiceTest(payload);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: 400 });
  }
  try {
    const [result] = await getDb()
      .insert(voiceTestResults)
      .values(voiceTestRow(parsed.value))
      .returning();
    return Response.json({ result: withLocalMatches(result) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!(await authorized())) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const recent = await getDb()
      .select()
      .from(voiceTestResults)
      .orderBy(desc(voiceTestResults.createdAt), desc(voiceTestResults.id))
      .limit(500);
    const rows = recent.map(withLocalMatches);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      return new Response(csv(rows), {
        headers: {
          "content-disposition":
            'attachment; filename="voice-test-results.csv"',
          "content-type": "text/csv; charset=utf-8",
        },
      });
    }
    return Response.json({ recent: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await authorized())) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "올바른 결과 ID가 필요합니다." }, { status: 400 });
  }
  try {
    const [deleted] = await getDb()
      .delete(voiceTestResults)
      .where(eq(voiceTestResults.id, id))
      .returning({ id: voiceTestResults.id });
    if (!deleted) {
      return Response.json({ error: "삭제할 결과가 없습니다." }, { status: 404 });
    }
    return Response.json({ deleted });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
