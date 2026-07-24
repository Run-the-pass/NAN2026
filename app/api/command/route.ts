import { validateEnvelope } from "../../../game/core.js";

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
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ reason: "GEMINI_API_KEY가 없습니다. 디버그 버튼으로 시연하세요." }, { status: 503 });
  }
  const schema = {
    type: "object",
    properties: {
      status: { type: "string", enum: ["OK"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      commands: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            actorId: { type: "string", enum: ["slime-01"] },
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
              type: "string",
              enum: [
                "herb-box",
                "parchment-box",
                "cauldron-01",
                "cauldron-02",
                "submission-table",
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
    required: ["status", "confidence", "commands", "reason"],
  };
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
                "행동자는 항상 말랑=slime-01이다.",
                "약초 가져오기=GET_HERB→herb-box.",
                "약초 넣기=ADD_HERB, 젓기=MIX, 양피지 담그기=DIP_PARCHMENT, 마도서 꺼내기=TAKE_BOOK.",
                "이 네 행동은 왼쪽/1번=cauldron-01, 오른쪽/2번=cauldron-02를 대상으로 한다.",
                "양피지 가져오기=GET_PARCHMENT→parchment-box.",
                "납품하기=SUBMIT→submission-table.",
                "사용자가 솥을 지정하지 않은 솥 행동은 명령을 만들지 마라.",
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
    const checked = validateEnvelope(JSON.parse(text || ""));
    if ("reason" in checked) {
      return Response.json({ reason: checked.reason }, { status: 422 });
    }
    return Response.json(checked.value);
  } catch {
    return Response.json({ reason: "Gemini가 유효한 JSON을 반환하지 않았습니다." }, { status: 502 });
  }
}
