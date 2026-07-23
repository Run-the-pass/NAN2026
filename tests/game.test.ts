import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/command/route.js";
import {
  command,
  executeEnvelope,
  initialState,
  startRoundTwo,
  validateEnvelope,
} from "../game/core.js";

test("같은 seed와 명령은 사고부터 2라운드 판매까지 같은 결과를 만든다", () => {
  const play = () => {
    let state = initialState(7);
    const get = command("slime-01", "GET");
    state = executeEnvelope(state, get);
    assert.equal(state.mushroom, "stock");
    assert.match(state.lastEvent, /배고픈/);
    state = executeEnvelope(state, get);
    state = executeEnvelope(state, command("slime-01", "CHOP"));
    state = executeEnvelope(state, command("slime-01", "COOK"));
    state = executeEnvelope(state, command("slime-02", "SERVE"));
    assert.equal(state.phase, "upgrade");
    state = startRoundTwo(state);
    state = executeEnvelope(state, command("slime-01", "PREPARE"));
    assert.equal(state.mushroom, "chopped");
    state = executeEnvelope(state, command("slime-01", "COOK"));
    state = executeEnvelope(state, command("slime-02", "SERVE"));
    return state;
  };
  assert.deepEqual(play(), play());
  assert.equal(play().score, 200);
  assert.equal(play().phase, "finished");
});

test("허용 목록 밖 명령과 강화 전 PREPARE를 거부한다", () => {
  assert.equal(
    validateEnvelope(
      {
        ...command("slime-01", "GET"),
        commands: [{ ...command("slime-01", "GET").commands[0], actorId: "ghost" }],
      },
      1,
      false,
    ).ok,
    false,
  );
  assert.equal(validateEnvelope(command("slime-01", "PREPARE"), 1, false).ok, false);
});

test("Content-Type 없는 명령 요청은 400 JSON을 반환한다", async () => {
  const response = await POST(
    new Request("http://localhost/api/command", { method: "POST", body: "audio" }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    reason: "multipart/form-data 요청이 필요합니다.",
  });
});
