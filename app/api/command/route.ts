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
  const round = form.get("round") === "2" ? 2 : 1;
  const upgraded = form.get("upgraded") === "true";
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
            actorId: { type: "string", enum: ["slime-01", "slime-02"] },
            action: { type: "string", enum: upgraded ? ["GET", "CHOP", "COOK", "SERVE", "PREPARE"] : ["GET", "CHOP", "COOK", "SERVE"] },
            targetId: { type: "string", enum: ["mushroom-box", "cutting-board", "pot", "customer"] },
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
            { text: `한국어 음성 명령을 JSON으로 바꿔라. 말랑=slime-01, 빨강=slime-02. GET→mushroom-box, CHOP→cutting-board, COOK→pot, SERVE→customer, PREPARE→mushroom-box. 현재 라운드 ${round}. 허용 후보만 사용하라.` },
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
    const checked = validateEnvelope(JSON.parse(text || ""), round, upgraded);
    if ("reason" in checked) {
      return Response.json({ reason: checked.reason }, { status: 422 });
    }
    return Response.json(checked.value);
  } catch {
    return Response.json({ reason: "Gemini가 유효한 JSON을 반환하지 않았습니다." }, { status: 502 });
  }
}
