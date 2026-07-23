import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/command/route.js";
import {
  chooseUpgrade,
  command,
  endRound,
  executeEnvelope,
  initialState,
  tick,
  validateEnvelope,
  type ActorId,
  type GameState,
} from "../game/core.js";

function untilIdle(state: GameState, actorId: ActorId) {
  let next = state;
  for (let count = 0; count < 300; count += 1) {
    const actor = next.actors[actorId];
    if (!actor.current && actor.queue.length === 0) return next;
    next = tick(next, 100);
  }
  throw new Error(`${actorId} 작업이 끝나지 않았습니다.`);
}

function successfulRoundOne() {
  let state = { ...initialState(7), hungry: false };
  state = executeEnvelope(state, command("slime-01", "GET"));
  state = executeEnvelope(state, command("slime-01", "CHOP"));
  state = executeEnvelope(state, command("slime-01", "COOK"));
  state = untilIdle(state, "slime-01");
  state = executeEnvelope(state, command("slime-02", "SERVE"));
  state = untilIdle(state, "slime-02");
  return endRound(state);
}

test("초기 주문 1건 뒤 플레이 중 정확히 10초마다 주문이 추가된다", () => {
  let state = initialState();
  assert.equal(state.ordersPending, 1);
  state = tick(state, 9_999);
  assert.equal(state.ordersPending, 1);
  state = tick(state, 1);
  assert.equal(state.ordersPending, 2);
  assert.equal(state.nextOrderInMs, 10_000);
  state = tick(state, 20_000);
  assert.equal(state.ordersPending, 4);
});

test("이동은 속도에 따라 부분 진행되고 작업 완료 전 상태는 바뀌지 않는다", () => {
  let state = { ...initialState(), hungry: false };
  state = executeEnvelope(state, command("slime-01", "GET"));
  state = tick(state, 500);
  const slime = state.actors["slime-01"];
  assert.equal(slime.status, "MOVING");
  assert.ok(slime.x > 360 && slime.x < 480);
  assert.ok(slime.y > 380 && slime.y < 520);
  assert.equal(state.mushroom, "stock");
  state = tick(state, 1_100);
  assert.equal(state.actors["slime-01"].status, "WORKING");
  assert.equal(state.mushroom, "stock");
  state = untilIdle(state, "slime-01");
  assert.equal(state.mushroom, "held");
});

test("슬라임별 작업은 FIFO로 실행되고 큐가 끝나면 IDLE이다", () => {
  let state = { ...initialState(), hungry: false };
  state = executeEnvelope(state, {
    status: "OK",
    confidence: 1,
    reason: null,
    commands: [
      command("slime-01", "CHOP").commands[0],
      { ...command("slime-01", "GET").commands[0], sequence: 0 },
    ],
  });
  state = untilIdle(state, "slime-01");
  assert.equal(state.mushroom, "chopped");
  assert.equal(state.actors["slime-01"].status, "IDLE");
  assert.equal(state.actors["slime-01"].current, null);
  assert.deepEqual(state.actors["slime-01"].queue, []);
});

test("PREPARE는 잠금 중 거부되고 해금 선택 후 GET과 CHOP으로 분해된다", () => {
  assert.equal(validateEnvelope(command("slime-01", "PREPARE"), 1, false).ok, false);
  let state = chooseUpgrade(successfulRoundOne(), "prepare");
  const checked = validateEnvelope(command("slime-01", "PREPARE"), 2, true);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  state = executeEnvelope(state, checked.value);
  assert.deepEqual(
    state.actors["slime-01"].queue.map(({ action }) => action),
    ["GET", "CHOP"],
  );
  state = untilIdle(state, "slime-01");
  assert.equal(state.mushroom, "chopped");
});

test("세 선택지는 지정된 속도 또는 PREPARE 해금 효과만 적용한다", () => {
  const choice = successfulRoundOne();
  const mallang = chooseUpgrade(choice, "mallang-mastery");
  assert.equal(mallang.actors["slime-01"].moveSpeed, 162);
  assert.equal(mallang.actors["slime-01"].workSpeed, 1.35);
  assert.equal(mallang.actors["slime-02"].moveSpeed, 120);
  assert.equal(mallang.upgraded, false);

  const prepare = chooseUpgrade(choice, "prepare");
  assert.equal(prepare.upgraded, true);
  assert.equal(prepare.actors["slime-01"].moveSpeed, 120);

  const team = chooseUpgrade(choice, "team-boost");
  assert.equal(team.actors["slime-01"].moveSpeed, 138);
  assert.equal(team.actors["slime-02"].workSpeed, 1.15);
  assert.equal(team.upgraded, false);
  assert.equal(
    executeEnvelope(team, command("slime-01", "GET")).actors["slime-01"].queue[0].action,
    "GET",
  );
});

test("판매 후 재료는 stock으로 돌아오고 75초 종료 판정은 라운드를 따른다", () => {
  const choice = successfulRoundOne();
  assert.equal(choice.phase, "choice");
  assert.equal(choice.mushroom, "stock");
  assert.equal(choice.roundSales, 1);
  const roundTwo = chooseUpgrade(choice, "prepare");
  assert.equal(tick(roundTwo, 75_000).phase, "finished");
});

test("같은 seed, 명령과 tick은 같은 결과를 만든다", () => {
  const play = () => {
    let state = initialState(91);
    state = executeEnvelope(state, command("slime-01", "GET"));
    state = untilIdle(state, "slime-01");
    state = executeEnvelope(state, command("slime-01", "GET"));
    state = executeEnvelope(state, command("slime-01", "CHOP"));
    state = executeEnvelope(state, command("slime-01", "COOK"));
    state = untilIdle(state, "slime-01");
    state = executeEnvelope(state, command("slime-02", "SERVE"));
    return untilIdle(state, "slime-02");
  };
  assert.deepEqual(play(), play());
});

test("허용 목록 밖 명령은 거부한다", () => {
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
