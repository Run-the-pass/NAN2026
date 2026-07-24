import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { POST } from "../app/api/command/route.js";
import { simulate } from "../game/cli.js";
import {
  TILE_SIZE,
  WORKSHOP_ROWS,
  command,
  executeEnvelope,
  findPath,
  initialState,
  isWalkable,
  taskTiles,
  tick,
  validateEnvelope,
  type Action,
  type CauldronId,
  type GameState,
  type TargetId,
} from "../game/core.js";

function untilIdle(state: GameState) {
  let next = state;
  for (let count = 0; count < 1_000; count += 1) {
    const slime = next.actors["slime-01"];
    if (!slime.current && slime.queue.length === 0) return next;
    next = tick(next, 50);
  }
  throw new Error("말랑의 작업이 끝나지 않았습니다.");
}

function act(state: GameState, action: Action, targetId?: TargetId) {
  return untilIdle(executeEnvelope(state, command(action, targetId)));
}

function wait(state: GameState, durationMs: number) {
  let next = state;
  for (let elapsed = 0; elapsed < durationMs; elapsed += 50) {
    next = tick(next, Math.min(50, durationMs - elapsed));
  }
  return next;
}

function makeBook(state: GameState, pot: CauldronId) {
  let next = act(state, "GET_HERB");
  next = act(next, "ADD_HERB", pot);
  next = act(next, "MIX", pot);
  next = wait(next, 5_000);
  next = act(next, "GET_PARCHMENT");
  next = act(next, "DIP_PARCHMENT", pot);
  next = wait(next, 5_000);
  return act(next, "TAKE_BOOK", pot);
}

test("16×10 공방에서 BFS는 장애물을 통과하지 않는다", () => {
  assert.equal(WORKSHOP_ROWS.length, 10);
  assert.ok(WORKSHOP_ROWS.every((row) => row.length === 16));
  assert.equal(TILE_SIZE, 60);
  assert.equal(isWalkable({ col: 7, row: 4 }), false);
  const path = findPath(taskTiles["herb-box"], taskTiles["parchment-box"]);
  assert.ok(path?.every(isWalkable));
  assert.equal(findPath({ col: 0, row: 0 }, taskTiles["herb-box"]), null);
});

test("슬라임은 속도에 맞춰 이동하고 큐가 끝나면 IDLE이다", () => {
  let state = executeEnvelope(initialState(), {
    status: "OK",
    confidence: 1,
    reason: null,
    commands: [
      command("GET_HERB").commands[0],
      { ...command("GET_PARCHMENT").commands[0], sequence: 2 },
    ],
  });
  state = tick(state, 250);
  assert.equal(state.actors["slime-01"].status, "MOVING");
  assert.equal(state.actors["slime-01"].x, 510);
  assert.equal(state.actors["slime-01"].y, 480);
  state = untilIdle(state);
  assert.equal(state.actors["slime-01"].status, "IDLE");
  assert.equal(state.actors["slime-01"].current, null);
  assert.deepEqual(state.actors["slime-01"].queue, []);
  assert.equal(state.actors["slime-01"].carrying, "herb");
  assert.match(state.lastEvent, /이미 무언가/);
});

test("신뢰 경계는 한 슬라임과 허용된 action/target만 받는다", () => {
  assert.equal(validateEnvelope(command("GET_HERB")).ok, true);
  assert.equal(
    validateEnvelope({
      ...command("GET_HERB"),
      commands: [{ ...command("GET_HERB").commands[0], actorId: "ghost" }],
    }).ok,
    false,
  );
  assert.equal(
    validateEnvelope({
      ...command("GET_HERB"),
      commands: [
        { ...command("GET_HERB").commands[0], targetId: "cauldron-01" },
      ],
    }).ok,
    false,
  );
});

test("잘못된 작업 순서는 재료·솥·납품 상태를 바꾸지 않고 이유를 남긴다", () => {
  const before = initialState();
  const after = act(before, "MIX", "cauldron-01");
  assert.deepEqual(after.cauldrons, before.cauldrons);
  assert.equal(after.submitted, before.submitted);
  assert.equal(after.actors["slime-01"].carrying, null);
  assert.match(after.lastEvent, /약초가 든 솥/);
});

test("두 솥의 5초 타이머는 독립적으로 진행된다", () => {
  let state = initialState();
  state = {
    ...state,
    cauldrons: {
      "cauldron-01": { status: "MIXING", timerMs: 5_000 },
      "cauldron-02": { status: "INSCRIBING", timerMs: 3_000 },
    },
  };
  state = tick(state, 2_999);
  assert.equal(state.cauldrons["cauldron-01"].timerMs, 2_001);
  assert.equal(state.cauldrons["cauldron-02"].timerMs, 1);
  state = tick(state, 1);
  assert.equal(state.cauldrons["cauldron-01"].status, "MIXING");
  assert.equal(state.cauldrons["cauldron-02"].status, "BOOK_READY");
  state = tick(state, 2_000);
  assert.equal(state.cauldrons["cauldron-01"].status, "READY_FOR_PARCHMENT");
});

test("약초부터 마도서까지 순서대로 만들고 SUBMIT에서만 납품 수가 오른다", () => {
  let state = makeBook(initialState(), "cauldron-01");
  assert.equal(state.actors["slime-01"].carrying, "book");
  assert.equal(state.cauldrons["cauldron-01"].status, "EMPTY");
  assert.equal(state.submitted, 0);
  state = act(state, "SUBMIT");
  assert.equal(state.submitted, 1);
  assert.equal(state.actors["slime-01"].carrying, null);
});

test("8권째 납품은 즉시 성공하고 180초 무납품은 실패한다", () => {
  let state: GameState = {
    ...initialState(),
    submitted: 7,
    actors: {
      "slime-01": { ...initialState().actors["slime-01"], carrying: "book" as const },
    },
  };
  state = act(state, "SUBMIT");
  assert.equal(state.phase, "won");
  assert.equal(state.submitted, 8);
  assert.equal(tick(state, 999_999), state);

  const lost = tick(initialState(), 180_000);
  assert.equal(lost.phase, "lost");
  assert.equal(lost.timeLeft, 0);
});

test("같은 seed, 명령과 시간은 같은 결과를 만든다", () => {
  const play = () => act(makeBook(initialState(91), "cauldron-02"), "SUBMIT");
  assert.deepEqual(play(), play());
});

test("Content-Type 없는 명령 요청은 400 JSON을 반환한다", async () => {
  const response = await POST(
    new Request("http://localhost/api/command", {
      method: "POST",
      body: "audio",
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    reason: "multipart/form-data 요청이 필요합니다.",
  });
});

test("CLI는 같은 입력을 재현하고 전체 제작·납품을 완료한다", () => {
  const args = [
    "--seed=7",
    "GET_HERB",
    "ADD_HERB:cauldron-01",
    "MIX:cauldron-01",
    "WAIT:5000",
    "GET_PARCHMENT",
    "DIP_PARCHMENT:cauldron-01",
    "WAIT:5000",
    "TAKE_BOOK:cauldron-01",
    "SUBMIT",
  ];
  const first = simulate(args);
  assert.deepEqual(first, simulate(args));
  assert.equal(first.final.submitted, 1);
  assert.equal(first.final.actors["slime-01"].status, "IDLE");
  assert.equal(first.final.actors["slime-01"].carrying, null);
});

test("CLI의 허용 목록 밖 토큰은 nonzero로 종료된다", () => {
  assert.throws(
    () => simulate(["GET_HERB:cauldron-01"]),
    /허용 목록 밖/,
  );
  const cli = fileURLToPath(new URL("../game/cli.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "FLY"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /허용되지 않은 명령/);
});
