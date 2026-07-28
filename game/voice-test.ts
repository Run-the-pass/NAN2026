import {
  allItems,
  allStations,
  isValidRoute,
  itemLabel,
  slimeTypes,
  stationLabels,
  type ActorId,
  type Command,
  type ItemId,
  type StationId,
} from "./core.js";
import { matchCarriedPhrase, matchPhrase } from "./phrase.js";

export type VoiceTestInput = {
  batchId: string;
  expectedActor: ActorId;
  expectedItem: VoiceTestExpectedItem;
  expectedTarget: StationId;
  expectedPhraseStyle: CarriedPhraseStyle | null;
  transcript: string;
  sttConfidence: number | null;
  durationMs: number;
  gemini: {
    status: "OK" | "UNKNOWN" | "ERROR" | "SKIPPED";
    confidence: number | null;
    commands: Command[];
    reason: string | null;
  };
};

export type VoiceTestExpectedItem = ItemId | "carried";
export type CarriedPhraseStyle = "that" | "holding" | "carrying";

const actorIds = Object.keys(slimeTypes) as ActorId[];
const geminiStatuses = ["OK", "UNKNOWN", "ERROR", "SKIPPED"] as const;
const carriedPhraseStyles = ["that", "holding", "carrying"] as const;
export const carriedVoiceTargets: StationId[] = [
  "brewer",
  "table",
  "submission",
  "trash",
];

const isText = (value: unknown, max: number, allowEmpty = false) =>
  typeof value === "string" &&
  value.length <= max &&
  (allowEmpty || value.trim().length > 0);

export function voiceLabSquad(expectedActor: ActorId): ActorId[] {
  const others = actorIds.filter((actorId) => actorId !== expectedActor);
  return [others[0], expectedActor, others[1]];
}

export function voiceTestPhrase(
  actorId: ActorId,
  item: VoiceTestExpectedItem,
  target: StationId,
  style: CarriedPhraseStyle | null = null,
) {
  if (item === "carried") {
    const object = {
      that: "그거",
      holding: "들고 있는 거",
      carrying: "가지고 있는 거",
    }[style ?? "that"];
    const action =
      target === "brewer"
        ? "양조기에 넣어"
        : target === "table"
          ? "테이블로 가져가"
          : target === "submission"
            ? "제출해"
            : "버려";
    return `${slimeTypes[actorId].name}아, ${object} ${action}`;
  }
  const action =
    target === "brewer"
      ? "양조기에 넣어"
      : target === "table"
        ? "마법 테이블로 가져가"
        : target === "submission"
          ? "제출해"
          : "버려";
  return `${slimeTypes[actorId].name}아, ${itemLabel(item)}를 ${action}`;
}

export function parseVoiceTest(
  value: unknown,
): { ok: true; value: VoiceTestInput } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "음성 테스트 JSON이 객체가 아닙니다." };
  }
  const body = value as Record<string, unknown>;
  const expectedItem = body.expectedItem as VoiceTestExpectedItem;
  const expectedTarget = body.expectedTarget as StationId;
  const expectedPhraseStyle = body.expectedPhraseStyle ?? null;
  const carriedExpected = expectedItem === "carried";
  if (
    !isText(body.batchId, 64) ||
    !actorIds.includes(body.expectedActor as ActorId) ||
    (!carriedExpected && !allItems.includes(expectedItem as ItemId)) ||
    !allStations.includes(expectedTarget) ||
    (carriedExpected
      ? !carriedVoiceTargets.includes(expectedTarget) ||
        !carriedPhraseStyles.includes(
          expectedPhraseStyle as CarriedPhraseStyle,
        )
      : expectedPhraseStyle !== null ||
        !isValidRoute(expectedItem as ItemId, expectedTarget)) ||
    !isText(body.transcript, 200, true) ||
    (body.sttConfidence !== null &&
      (typeof body.sttConfidence !== "number" ||
        !Number.isFinite(body.sttConfidence) ||
        body.sttConfidence < 0 ||
        body.sttConfidence > 1)) ||
    typeof body.durationMs !== "number" ||
    !Number.isSafeInteger(body.durationMs) ||
    body.durationMs < 0 ||
    body.durationMs > 60_000
  ) {
    return { ok: false, reason: "기대 명령 또는 STT 값이 올바르지 않습니다." };
  }
  if (!body.gemini || typeof body.gemini !== "object") {
    return { ok: false, reason: "Gemini 결과가 없습니다." };
  }
  const gemini = body.gemini as Record<string, unknown>;
  if (
    !geminiStatuses.includes(
      gemini.status as (typeof geminiStatuses)[number],
    ) ||
    (gemini.confidence !== null &&
      (typeof gemini.confidence !== "number" ||
        !Number.isFinite(gemini.confidence) ||
        gemini.confidence < 0 ||
        gemini.confidence > 1)) ||
    (gemini.reason !== null && !isText(gemini.reason, 500, true)) ||
    !Array.isArray(gemini.commands) ||
    gemini.commands.length > 6
  ) {
    return { ok: false, reason: "Gemini 결과 형식이 올바르지 않습니다." };
  }
  const squad = voiceLabSquad(body.expectedActor as ActorId);
  for (const command of gemini.commands as Command[]) {
    if (
      !command ||
      typeof command !== "object" ||
      !squad.includes(command.actorId) ||
      !allItems.includes(command.item) ||
      !allStations.includes(command.target) ||
      !isValidRoute(command.item, command.target) ||
      !Number.isSafeInteger(command.sequence)
    ) {
      return { ok: false, reason: "Gemini 명령이 허용 목록 밖입니다." };
    }
  }
  return {
    ok: true,
    value: {
      batchId: body.batchId as string,
      expectedActor: body.expectedActor as ActorId,
      expectedItem,
      expectedTarget,
      expectedPhraseStyle: expectedPhraseStyle as CarriedPhraseStyle | null,
      transcript: body.transcript as string,
      sttConfidence: body.sttConfidence as number | null,
      durationMs: body.durationMs,
      gemini: {
        status: gemini.status as VoiceTestInput["gemini"]["status"],
        confidence: gemini.confidence as number | null,
        commands: gemini.commands as Command[],
        reason: gemini.reason as string | null,
      },
    },
  };
}

export function voiceTestRow(input: VoiceTestInput) {
  const squad = voiceLabSquad(input.expectedActor);
  const local = matchPhrase(input.transcript, squad)?.[0];
  const carried = matchCarriedPhrase(input.transcript, squad);
  const localActor = local?.actorId ?? carried?.actorId;
  const localTarget = local?.target ?? carried?.target ?? null;
  const gemini = input.gemini.commands[0];
  const carriedExpected = input.expectedItem === "carried";
  const localActorMatch = localActor === input.expectedActor;
  const localItemMatch = carriedExpected ? Boolean(carried) : local?.item === input.expectedItem;
  const localTargetMatch = localTarget === input.expectedTarget;
  const geminiActorMatch = gemini?.actorId === input.expectedActor;
  const geminiItemMatch = !carriedExpected && gemini?.item === input.expectedItem;
  const geminiTargetMatch = gemini?.target === input.expectedTarget;
  return {
    batchId: input.batchId,
    expectedActor: input.expectedActor,
    expectedItem: input.expectedItem,
    expectedTarget: input.expectedTarget,
    expectedPhrase: voiceTestPhrase(
      input.expectedActor,
      input.expectedItem,
      input.expectedTarget,
      input.expectedPhraseStyle,
    ),
    transcript: input.transcript,
    sttConfidence: input.sttConfidence,
    durationMs: input.durationMs,
    localStatus: local ? "MATCHED" : carried ? "CONTEXTUAL" : "UNMATCHED",
    localActor: localActor ?? null,
    localItem: local?.item ?? null,
    localTarget,
    localActorMatch,
    localItemMatch,
    localTargetMatch,
    localAllMatch:
      Boolean(carriedExpected ? carried : local) &&
      localActorMatch &&
      localItemMatch &&
      localTargetMatch,
    geminiStatus: input.gemini.status,
    geminiCommands: JSON.stringify(input.gemini.commands),
    geminiActor: gemini?.actorId ?? null,
    geminiItem: gemini?.item ?? null,
    geminiTarget: gemini?.target ?? null,
    geminiConfidence: input.gemini.confidence,
    geminiReason: input.gemini.reason,
    geminiActorMatch,
    geminiItemMatch,
    geminiTargetMatch,
    geminiAllMatch:
      input.gemini.commands.length === 1 &&
      geminiActorMatch &&
      geminiItemMatch &&
      geminiTargetMatch,
  };
}

export const voiceTestTaskLabel = (
  item: VoiceTestExpectedItem,
  target: StationId,
  style: CarriedPhraseStyle | null = null,
) =>
  item === "carried"
    ? `현재 든 물품 → ${stationLabels[target]} · ${
        { that: "그거", holding: "들고 있는 거", carrying: "가지고 있는 거" }[
          style ?? "that"
        ]
      }`
    : `${itemLabel(item)} → ${stationLabels[target]}`;
