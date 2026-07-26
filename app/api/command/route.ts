import { slimeTypes, validateEnvelope } from "../../../game/core.js";

const allTypeIds = Object.keys(slimeTypes);

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
  const audio = form.get("audio");
  if (!(audio instanceof File) || !audio.type.startsWith("audio/") || audio.size < 1 || audio.size > 8_000_000) {
    return Response.json({ reason: "8MB 이하 오디오 파일이 필요합니다." }, { status: 400 });
  }
  // 이번 판에 선택된 스쿼드. 프롬프트와 스키마를 그 이름들로 제한한다.
  const squadField = String(form.get("actors") ?? allTypeIds.join(","));
  const squad = squadField.split(",");
  if (
    squad.length < 1 ||
    squad.length > 4 ||
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
            action: {
              type: "string",
              enum: [
                "GET_HERB",
                "ADD_HERB",
                "MIX",
                "GET_PARCHMENT",
                "DIP_PARCHMENT",
                "TAKE_BOOK",
                "SUBMIT",
              ],
            },
            targetId: {
              anyOf: [
                {
                  type: "string",
                  enum: [
                    "herb-box",
                    "parchment-box",
                    "cauldron-01",
                    "cauldron-02",
                    "submission-table",
                  ],
                },
                { type: "null" },
              ],
            },
            destinationId: { type: ["string", "null"] },
            sequence: { type: "integer" },
          },
          required: ["actorId", "action", "targetId", "destinationId", "sequence"],
        },
      },
      reason: { type: ["string", "null"] },
    },
    required: ["status", "confidence", "commands", "reason", "transcript"],
  };
  const nameGuide = squad
    .map((typeId) => `${slimeTypes[typeId as keyof typeof slimeTypes].name}=${typeId}`)
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
                "한국어 음성 명령을 실행 순서의 JSON 명령으로 바꿔라.",
                "들은 문장을 한국어 그대로 transcript에 넣어라.",
                "게임 명령으로 해석할 수 없으면 status를 UNKNOWN으로 하고 commands는 빈 배열, reason에 한국어 이유를 넣어라.",
                `공방의 슬라임과 actorId: ${nameGuide}.`,
                "명령에 슬라임 이름이 없으면 첫 번째 슬라임을 대상으로 한다.",
                "약초 가져오기=GET_HERB→herb-box.",
                "약초 넣기=ADD_HERB, 젓기=MIX, 양피지 담그기=DIP_PARCHMENT, 마도서 꺼내기=TAKE_BOOK.",
                "이 네 행동은 왼쪽/1번=cauldron-01, 오른쪽/2번=cauldron-02를 대상으로 한다.",
                "양피지 가져오기=GET_PARCHMENT→parchment-box.",
                "납품하기=SUBMIT→submission-table.",
                "사용자가 솥을 지정하지 않은 솥 행동은 targetId를 null로 두어라. 그러면 슬라임이 가까운 솥을 스스로 고른다.",
                "허용 후보 외 이름과 행동을 만들지 마라.",
              ].join(" "),
            },
            { inlineData: { mimeType: audio.type, data: Buffer.from(await audio.arrayBuffer()).toString("base64") } },
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
      typeof parsed.transcript === "string"
        ? parsed.transcript.slice(0, 200)
        : null;
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
    const checked = validateEnvelope(parsed);
    if ("reason" in checked) {
      return Response.json({ reason: checked.reason, transcript }, { status: 422 });
    }
    return Response.json({ ...checked.value, transcript });
  } catch {
    return Response.json({ reason: "Gemini가 유효한 JSON을 반환하지 않았습니다." }, { status: 502 });
  }
}
