import {
  allItems,
  allStations,
  slimeTypes,
  validateEnvelope,
  type ActorId,
} from "../../../game/core.js";
import { actorAliases } from "../../../game/phrase.js";

const allTypeIds = Object.keys(slimeTypes) as ActorId[];

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { reason: "multipart/form-data 요청이 필요합니다." },
      { status: 400 },
    );
  }
  // 실시간 STT가 문장을 준 경우에는 오디오 추론을 건너뛴다. 텍스트
  // 추론이 훨씬 빨라 게임 반응이 끊기지 않는다.
  const spoken = form.get("text");
  const transcriptIn =
    typeof spoken === "string" && spoken.trim()
      ? spoken.trim().slice(0, 200)
      : null;
  const audio = form.get("audio");
  if (
    !transcriptIn &&
    (!(audio instanceof File) ||
      !audio.type.startsWith("audio/") ||
      audio.size < 1 ||
      audio.size > 8_000_000)
  ) {
    return Response.json(
      { reason: "8MB 이하 오디오 파일 또는 text가 필요합니다." },
      { status: 400 },
    );
  }
  // 이번 판에 선택된 스쿼드. 프롬프트와 스키마를 그 이름들로 제한한다.
  const squadField = String(form.get("actors") ?? allTypeIds.join(","));
  const squad = squadField.split(",") as ActorId[];
  if (
    squad.length < 1 ||
    squad.length > 3 ||
    new Set(squad).size !== squad.length ||
    squad.some((typeId) => !allTypeIds.includes(typeId))
  ) {
    return Response.json({ reason: "actors 필드가 올바르지 않습니다." }, { status: 400 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ reason: "GEMINI_API_KEY가 없습니다. 디버그 버튼으로 시연하세요." }, { status: 503 });
  }
  const schema = {
    type: "object",
    properties: {
      status: { type: "string", enum: ["OK", "UNKNOWN"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      transcript: { type: ["string", "null"] },
      commands: {
        type: "array",
        minItems: 0,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            actorId: { type: "string", enum: squad },
            item: { type: "string", enum: allItems },
            target: { type: "string", enum: allStations },
            sequence: { type: "integer" },
          },
          required: ["actorId", "item", "target", "sequence"],
        },
      },
      reason: { type: ["string", "null"] },
    },
    required: ["status", "confidence", "commands", "reason", "transcript"],
  };
  const nameGuide = squad
    .map(
      (typeId) =>
        `${slimeTypes[typeId].name}(${actorAliases[typeId].join("/")})=${typeId}`,
    )
    .join(", ");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-3.6-flash"}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              text: [
                "한국어 음성 명령을 JSON 명령으로 바꿔라.",
                "들은 문장을 한국어 그대로 transcript에 넣어라.",
                "게임 명령으로 해석할 수 없으면 status를 UNKNOWN으로 하고 commands는 빈 배열, reason에 한국어 이유를 넣어라.",
                `공방의 슬라임과 actorId: ${nameGuide}.`,
                "이름이 조금 뭉개져 들려도 괄호 안 비슷한 발음과 가장 가까운 슬라임을 고른다.",
                "명령에 슬라임 이름이 없으면 첫 번째 슬라임을 대상으로 한다.",
                "명령 하나는 물품 하나를 목적지 하나로 보내는 것이다. 집기와 넣기를 따로 나누지 마라.",
                "물품 item: 붉은 약초=red-herb, 파란 약초=blue-herb, 붉은 물약=red-potion, 파란 물약=blue-potion, 붉은 스크롤=red-scroll, 파란 스크롤=blue-scroll.",
                "목적지 target: 양조기=brewer, 마법 테이블=table, 제출대=submission, 쓰레기통=trash.",
                "양조기와 테이블에는 약초만 보낼 수 있다. 양조기는 같은 색 물약을, 테이블은 같은 색 스크롤을 만든다.",
                "물약과 스크롤은 submission 또는 trash로만 보낼 수 있다.",
                "소환진은 목적지가 아니다. 허용 후보 외 이름과 물품을 만들지 마라.",
              ].join(" "),
            },
            transcriptIn
              ? { text: `플레이어가 말한 문장: ${transcriptIn}` }
              : {
                  inlineData: {
                    mimeType: (audio as File).type,
                    data: Buffer.from(
                      await (audio as File).arrayBuffer(),
                    ).toString("base64"),
                  },
                },
          ],
        }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
      }),
    },
  );
  if (!response.ok) {
    return Response.json({ reason: `Gemini 요청 실패 (${response.status})` }, { status: 502 });
  }
  const result = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  try {
    const parsed = JSON.parse(text || "") as {
      status?: string;
      reason?: string | null;
      transcript?: string | null;
    };
    // 표시용 문장은 길이만 제한하고 명령 해석에는 사용하지 않는다.
    const transcript =
      transcriptIn ??
      (typeof parsed.transcript === "string"
        ? parsed.transcript.slice(0, 200)
        : null);
    if (parsed.status === "UNKNOWN") {
      return Response.json(
        {
          reason:
            typeof parsed.reason === "string"
              ? parsed.reason
              : "게임 명령으로 해석하지 못했습니다.",
          transcript,
        },
        { status: 422 },
      );
    }
    const checked = validateEnvelope(parsed, squad);
    if ("reason" in checked) {
      return Response.json({ reason: checked.reason, transcript }, { status: 422 });
    }
    return Response.json({ ...checked.value, transcript });
  } catch {
    return Response.json({ reason: "Gemini가 유효한 JSON을 반환하지 않았습니다." }, { status: 502 });
  }
}
