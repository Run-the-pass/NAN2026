// 플레이테스트 세션 요약의 신뢰 경계 검증.
// D1 접근과 분리해 렌더링·인프라 없이 테스트할 수 있게 한다.
export type PlaytestSession = {
  seed: number;
  result: "won" | "lost";
  booksSubmitted: number;
  goal: number;
  elapsedMs: number;
  voiceCommands: number;
  buttonCommands: number;
  voiceFailures: number;
  avgConfidence: number | null;
};

const ROUND_LIMIT_MS = 180_000;
const ROUND_GOAL = 8;

function isCount(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

export function parseSession(
  payload: unknown,
): { ok: true; value: PlaytestSession } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "세션 JSON이 객체가 아닙니다." };
  }
  const body = payload as Record<string, unknown>;
  if (body.result !== "won" && body.result !== "lost") {
    return { ok: false, reason: "result는 won 또는 lost여야 합니다." };
  }
  if (
    !isCount(body.seed) ||
    !isCount(body.booksSubmitted) ||
    !isCount(body.goal, 1) ||
    !isCount(body.elapsedMs) ||
    !isCount(body.voiceCommands) ||
    !isCount(body.buttonCommands) ||
    !isCount(body.voiceFailures)
  ) {
    return { ok: false, reason: "정수 지표 값이 올바르지 않습니다." };
  }
  if (body.booksSubmitted > body.goal) {
    return { ok: false, reason: "납품 수가 목표를 초과했습니다." };
  }
  if (body.goal !== ROUND_GOAL) {
    return { ok: false, reason: `목표는 ${ROUND_GOAL}권이어야 합니다.` };
  }
  if (body.elapsedMs > ROUND_LIMIT_MS) {
    return { ok: false, reason: "경과 시간이 라운드 제한을 넘었습니다." };
  }
  if (
    (body.result === "won" && body.booksSubmitted !== body.goal) ||
    (body.result === "lost" &&
      (body.booksSubmitted >= body.goal || body.elapsedMs !== ROUND_LIMIT_MS))
  ) {
    return { ok: false, reason: "승패와 납품 수·경과 시간이 일치하지 않습니다." };
  }
  let avgConfidence: number | null = null;
  if (body.avgConfidence !== null && body.avgConfidence !== undefined) {
    if (
      typeof body.avgConfidence !== "number" ||
      !Number.isFinite(body.avgConfidence) ||
      body.avgConfidence < 0 ||
      body.avgConfidence > 1
    ) {
      return { ok: false, reason: "avgConfidence는 0~1 또는 null입니다." };
    }
    avgConfidence = body.avgConfidence;
  }
  return {
    ok: true,
    value: {
      seed: body.seed,
      result: body.result,
      booksSubmitted: body.booksSubmitted,
      goal: body.goal,
      elapsedMs: body.elapsedMs,
      voiceCommands: body.voiceCommands,
      buttonCommands: body.buttonCommands,
      voiceFailures: body.voiceFailures,
      avgConfidence,
    },
  };
}
