import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { POST } from "../app/api/command/route.js";
import { simulate } from "../game/cli.js";
import { parseSession } from "../game/session.js";
import { nextHint } from "../game/hint.js";
import {
  facingFromDelta,
  slimeSvg,
  type Facing,
} from "../app/slime-art.js";
import {
  TILE_SIZE,
  WORKSHOP_ROWS,
  command,
  displayTiles,
  executeEnvelope,
  findPath,
  initialState,
  isWalkable,
  movePlayer,
  slimeTypes,
  taskTiles,
  tick,
  tileCenter,
  validateEnvelope,
  type Action,
  type ActorId,
  type CauldronId,
  type GameState,
  type TargetId,
} from "../game/core.js";

function untilIdle(state: GameState) {
  let next = state;
  for (let count = 0; count < 10_000; count += 1) {
    const busy = Object.values(next.actors).some(
      (actor) => actor.current || actor.queue.length,
    );
    if (!busy) return next;
    next = tick(next, 50);
  }
  throw new Error("슬라임의 작업이 끝나지 않았습니다.");
}

// 청력 판정을 통과하도록 플레이어가 지시 대상 옆으로 이동했다고 가정한다.
function follow(state: GameState, actorId: ActorId) {
  const actor = state.actors[actorId]!;
  return movePlayer(state, actor.x, actor.y);
}

function act(
  state: GameState,
  actorId: ActorId,
  action: Action,
  targetId?: TargetId,
) {
  return untilIdle(
    executeEnvelope(follow(state, actorId), command(actorId, action, targetId)),
  );
}

function wait(state: GameState, durationMs: number) {
  let next = state;
  for (let elapsed = 0; elapsed < durationMs; elapsed += 50) {
    next = tick(next, Math.min(50, durationMs - elapsed));
  }
  return next;
}

function makeBook(state: GameState, actorId: ActorId, pot: CauldronId) {
  let next = act(state, actorId, "GET_HERB");
  next = act(next, actorId, "ADD_HERB", pot);
  next = act(next, actorId, "MIX", pot);
  next = wait(next, 5_000);
  next = act(next, actorId, "GET_PARCHMENT");
  next = act(next, actorId, "DIP_PARCHMENT", pot);
  next = wait(next, 5_000);
  return act(next, actorId, "TAKE_BOOK", pot);
}

test("가구는 종류마다 한 타일만 차지하고 작업 타일은 인접 바닥이다", () => {
  assert.equal(WORKSHOP_ROWS.length, 10);
  assert.ok(WORKSHOP_ROWS.every((row) => row.length === 16));
  assert.equal(TILE_SIZE, 60);
  const tiles = [...WORKSHOP_ROWS.join("")];
  assert.equal(tiles.filter((tile) => tile === "T").length, 1);
  assert.equal(tiles.filter((tile) => tile === "H").length, 1);
  assert.equal(tiles.filter((tile) => tile === "P").length, 1);
  assert.equal(tiles.filter((tile) => tile === "C").length, 2);
  assert.ok(tiles.filter((tile) => tile === "B").length > 0);

  const adjacent = (
    a: { col: number; row: number },
    b: { col: number; row: number },
  ) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
  assert.ok(adjacent(taskTiles["herb-box"], displayTiles.herb));
  assert.ok(adjacent(taskTiles["parchment-box"], displayTiles.parchment));
  assert.ok(adjacent(taskTiles["submission-table"], displayTiles.submission));
  assert.ok(adjacent(taskTiles["cauldron-01"], displayTiles["cauldron-01"]));
  assert.ok(adjacent(taskTiles["cauldron-02"], displayTiles["cauldron-02"]));
  assert.ok(Object.values(taskTiles).every(isWalkable));
  const path = findPath(taskTiles["herb-box"], taskTiles["parchment-box"]);
  assert.ok(path?.every(isWalkable));
});

test("슬라임 종류는 스탯 레벨을 결정하고 이동 속도는 레벨 표를 따른다", () => {
  assert.deepEqual(slimeTypes.nerd.statLevels, {
    workSpeed: 2,
    moveSpeed: 0,
    hearing: 1,
    focus: 3,
  });
  assert.deepEqual(slimeTypes.worker.statLevels, {
    workSpeed: 3,
    moveSpeed: 1,
    hearing: 0,
    focus: 2,
  });
  const swift = initialState(1, ["swift"]).actors.swift!;
  assert.equal(swift.moveSpeed, 2.5 * TILE_SIZE);
  const nerd = initialState(1, ["nerd"]).actors.nerd!;
  assert.equal(nerd.moveSpeed, 1.6 * TILE_SIZE);
  assert.throws(() => initialState(1, []), /1~3마리/);
  assert.throws(() => initialState(1, ["keen", "keen"]), /1~3마리/);
});

test("작업 속도 배율이 실제 작업 시간을 줄인다", () => {
  const atHerbBox = (typeId: "worker" | "nerd") => {
    const state = initialState(1, [typeId]);
    const actor = state.actors[typeId]!;
    return follow(
      {
        ...state,
        actors: {
          [typeId]: { ...actor, ...tileCenter(taskTiles["herb-box"]) },
        },
      },
      typeId,
    );
  };
  // 일꾼(작업 3, 배율 1.2)은 700ms 작업을 583.3ms에 끝낸다.
  let fast = executeEnvelope(atHerbBox("worker"), command("worker", "GET_HERB"));
  fast = tick(fast, 600);
  assert.equal(fast.actors.worker!.carrying, "herb");
  // 너드(작업 2, 배율 1.0)는 600ms 안에 끝내지 못한다.
  let slow = executeEnvelope(atHerbBox("nerd"), command("nerd", "GET_HERB"));
  slow = tick(slow, 600);
  assert.equal(slow.actors.nerd!.carrying, null);
  slow = tick(slow, 100);
  assert.equal(slow.actors.nerd!.carrying, "herb");
});

test("청력 범위 밖의 명령은 NOT_HEARD로 버려진다", () => {
  // 일꾼은 청력 0 → 2타일까지만 듣는다. 스폰 (7,6) 기준.
  const state = initialState(1, ["worker"]);
  const inRange = movePlayer(
    state,
    tileCenter({ col: 9, row: 6 }).x,
    tileCenter({ col: 9, row: 6 }).y,
  );
  const heard = executeEnvelope(inRange, command("worker", "GET_HERB"));
  assert.equal(heard.actors.worker!.queue.length, 1);

  const outOfRange = movePlayer(
    state,
    tileCenter({ col: 10, row: 6 }).x,
    tileCenter({ col: 10, row: 6 }).y,
  );
  const missed = executeEnvelope(outOfRange, command("worker", "GET_HERB"));
  assert.equal(missed.actors.worker!.queue.length, 0);
  assert.equal(missed.actors.worker!.alert, "NOT_HEARD");
  assert.match(missed.lastEvent, /듣지 못했습니다/);
  // 알림은 시간이 지나면 사라진다.
  const calmed = tick(missed, 2_000);
  assert.equal(calmed.actors.worker!.alert, null);
});

test("집중력은 명령 수를 제한한다 (TOO_COMPLEX, QUEUE_FULL)", () => {
  // 날쌘은 집중력 1 → 원자 작업 2개까지 기억한다.
  const base = follow(initialState(1, ["swift"]), "swift");
  const cmd = (sequence: number) => ({
    ...command("swift", "GET_HERB").commands[0],
    sequence,
  });
  const tooComplex = executeEnvelope(base, {
    status: "OK",
    confidence: 1,
    reason: null,
    commands: [cmd(1), cmd(2), cmd(3)],
  });
  assert.equal(tooComplex.actors.swift!.queue.length, 0);
  assert.equal(tooComplex.actors.swift!.alert, "TOO_COMPLEX");

  const filled = executeEnvelope(base, {
    status: "OK",
    confidence: 1,
    reason: null,
    commands: [cmd(1), cmd(2)],
  });
  assert.equal(filled.actors.swift!.queue.length, 2);
  const overflow = executeEnvelope(filled, command("swift", "GET_HERB"));
  assert.equal(overflow.actors.swift!.queue.length, 2);
  assert.equal(overflow.actors.swift!.alert, "QUEUE_FULL");
  assert.match(overflow.lastEvent, /기억 공간/);
});

test("여러 슬라임이 독립 큐로 병렬 작업한다", () => {
  let state = initialState(7, ["nerd", "swift"]);
  state = executeEnvelope(follow(state, "swift"), command("swift", "GET_HERB"));
  state = executeEnvelope(
    follow(state, "nerd"),
    command("nerd", "GET_PARCHMENT"),
  );
  state = untilIdle(state);
  assert.equal(state.actors.swift!.carrying, "herb");
  assert.equal(state.actors.nerd!.carrying, "parchment");
  assert.equal(state.actors.swift!.status, "IDLE");
  assert.equal(state.actors.nerd!.status, "IDLE");
});

test("잘못된 작업 순서는 재료·솥·납품 상태를 바꾸지 않고 이유를 남긴다", () => {
  const before = initialState(1, ["keen"]);
  const after = act(before, "keen", "MIX", "cauldron-01");
  assert.deepEqual(after.cauldrons, before.cauldrons);
  assert.equal(after.submitted, before.submitted);
  assert.equal(after.actors.keen!.carrying, null);
  assert.match(after.lastEvent, /약초가 든 솥/);
});

test("두 솥의 5초 타이머는 독립적으로 진행된다", () => {
  let state = initialState(1, ["keen"]);
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

test("한 tick 도중 시작한 솥 타이머는 시작 전 시간을 차감하지 않는다", () => {
  const base = initialState(1, ["keen"]);
  const actor = base.actors.keen!;
  const state: GameState = {
    ...base,
    actors: {
      keen: {
        ...actor,
        ...tileCenter(taskTiles["cauldron-01"]),
        current: command("keen", "MIX", "cauldron-01").commands[0],
        status: "WORKING",
        workLeftMs: 100,
      },
    },
    cauldrons: {
      ...base.cauldrons,
      "cauldron-01": { status: "HERB_LOADED", timerMs: 0 },
    },
  };
  const after = tick(state, 1_000);
  assert.deepEqual(after.cauldrons["cauldron-01"], {
    status: "MIXING",
    timerMs: 4_100,
  });
});

test("솥 미지정 명령은 상태가 맞는 솥을 우선해 가까운 솥으로 간다", () => {
  assert.equal(validateEnvelope(command("keen", "MIX")).ok, true);
  assert.equal(
    validateEnvelope({
      ...command("keen", "GET_HERB"),
      commands: [{ ...command("keen", "GET_HERB").commands[0], targetId: null }],
    }).ok,
    false,
  );

  // 약초 상자(1,6)에서 가까운 솥은 왼쪽 솥이다.
  let nearest = initialState(1, ["keen"]);
  nearest = act(nearest, "keen", "GET_HERB");
  nearest = act(nearest, "keen", "ADD_HERB");
  assert.equal(nearest.cauldrons["cauldron-01"].status, "HERB_LOADED");
  assert.equal(nearest.cauldrons["cauldron-02"].status, "EMPTY");

  // 먼 솥이라도 작업 상태가 맞으면 가까운 빈 솥보다 우선한다.
  let eligible = initialState(1, ["keen"]);
  eligible = {
    ...eligible,
    cauldrons: {
      "cauldron-01": { status: "EMPTY" as const, timerMs: 0 },
      "cauldron-02": { status: "HERB_LOADED" as const, timerMs: 0 },
    },
  };
  eligible = act(eligible, "keen", "MIX");
  assert.equal(eligible.cauldrons["cauldron-02"].status, "MIXING");
  assert.equal(eligible.cauldrons["cauldron-01"].status, "EMPTY");
});

test("약초부터 납품까지 완주하면 납품 수와 골드가 오른다", () => {
  let state = makeBook(initialState(2026, ["keen"]), "keen", "cauldron-01");
  assert.equal(state.actors.keen!.carrying, "book");
  assert.equal(state.cauldrons["cauldron-01"].status, "EMPTY");
  assert.equal(state.submitted, 0);
  state = act(state, "keen", "SUBMIT");
  assert.equal(state.submitted, 1);
  assert.equal(state.gold, 100);
  assert.equal(state.actors.keen!.carrying, null);
});

test("8권째 납품은 즉시 성공하고 180초 무납품은 실패한다", () => {
  const base = initialState(1, ["keen"]);
  let state: GameState = {
    ...base,
    submitted: 7,
    gold: 700,
    actors: {
      keen: { ...base.actors.keen!, carrying: "book" as const },
    },
  };
  state = act(state, "keen", "SUBMIT");
  assert.equal(state.phase, "won");
  assert.equal(state.submitted, 8);
  assert.equal(state.gold, 800);
  assert.equal(tick(state, 999_999), state);

  const lost = tick(initialState(1, ["keen"]), 180_000);
  assert.equal(lost.phase, "lost");
  assert.equal(lost.timeLeft, 0);
});

test("같은 seed, 스쿼드, 명령과 시간은 같은 결과를 만든다", () => {
  const play = () => {
    let state = initialState(91, ["keen", "worker"]);
    state = makeBook(state, "keen", "cauldron-02");
    state = act(state, "worker", "GET_PARCHMENT");
    return act(state, "keen", "SUBMIT");
  };
  assert.deepEqual(play(), play());
});

test("신뢰 경계는 허용된 슬라임과 action/target만 받는다", () => {
  assert.equal(validateEnvelope(command("keen", "GET_HERB")).ok, true);
  assert.equal(
    validateEnvelope(command("nerd", "GET_HERB"), ["keen"]).ok,
    false,
  );
  assert.equal(
    validateEnvelope({
      ...command("keen", "GET_HERB"),
      commands: [{ ...command("keen", "GET_HERB").commands[0], actorId: "ghost" }],
    }).ok,
    false,
  );
  assert.equal(
    validateEnvelope({
      ...command("keen", "GET_HERB"),
      commands: [
        { ...command("keen", "GET_HERB").commands[0], targetId: "cauldron-01" },
      ],
    }).ok,
    false,
  );
  // 구조는 유효해도 이번 판에 없는 슬라임이면 큐에 넣지 않는다.
  const state = follow(initialState(1, ["keen"]), "keen");
  const rejected = executeEnvelope(state, command("nerd", "GET_HERB"));
  assert.match(rejected.lastEvent, /선택되지 않은 슬라임/);
  assert.equal(rejected.actors.keen!.queue.length, 0);

  // transcript는 표시용 문자열만 허용하고 상태 UNKNOWN은 실행하지 않는다.
  const spoken = command("keen", "GET_HERB");
  assert.equal(
    validateEnvelope({ ...spoken, transcript: "쫑긋아 약초 가져와" }).ok,
    true,
  );
  assert.equal(validateEnvelope({ ...spoken, transcript: null }).ok, true);
  assert.equal(validateEnvelope({ ...spoken, transcript: 123 }).ok, false);
  assert.equal(
    validateEnvelope({ ...spoken, status: "UNKNOWN", commands: [] }).ok,
    false,
  );
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
    "--slimes=keen",
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
  assert.equal(first.final.gold, 100);
  assert.equal(first.final.actors.keen!.status, "IDLE");
  assert.equal(first.final.actors.keen!.carrying, null);
});

test("CLI는 액터 접두사·스쿼드·고정 플레이어 위치를 지원한다", () => {
  const result = simulate([
    "--slimes=nerd,swift",
    "swift.GET_HERB",
    "nerd.GET_PARCHMENT",
  ]);
  assert.equal(result.final.actors.swift!.carrying, "herb");
  assert.equal(result.final.actors.nerd!.carrying, "parchment");

  assert.throws(
    () => simulate(["--slimes=nerd", "swift.GET_HERB"]),
    /스쿼드에 없는 슬라임/,
  );

  // 플레이어 위치를 고정하면 청력 밖 명령은 NOT_HEARD가 된다.
  const missed = simulate(["--slimes=worker", "--player=10,8", "GET_HERB"]);
  assert.equal(missed.final.actors.worker!.carrying, null);
  assert.match(missed.steps[0].event, /듣지 못했습니다/);
});

test("CLI의 허용 목록 밖 토큰은 nonzero로 종료된다", () => {
  assert.throws(() => simulate(["GET_HERB:cauldron-01"]), /허용 목록 밖/);
  const cli = fileURLToPath(new URL("../game/cli.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "FLY"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /허용되지 않은 명령/);
});

test("플레이테스트 세션은 위조된 요약을 저장 전에 거부한다", () => {
  const valid = {
    seed: 2026,
    result: "lost",
    booksSubmitted: 3,
    goal: 8,
    elapsedMs: 180_000,
    voiceCommands: 5,
    buttonCommands: 2,
    voiceFailures: 1,
    avgConfidence: 0.8,
  };
  const accepted = parseSession(valid);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.ok && accepted.value.booksSubmitted, 3);
  assert.equal(parseSession({ ...valid, avgConfidence: null }).ok, true);

  for (const bad of [
    { ...valid, result: "cheated" },
    { ...valid, result: "won", booksSubmitted: 0, elapsedMs: 1 },
    { ...valid, goal: 1, booksSubmitted: 1 },
    { ...valid, elapsedMs: 1 },
    { ...valid, booksSubmitted: 8 },
    { ...valid, booksSubmitted: 99 },
    { ...valid, voiceCommands: -1 },
    { ...valid, elapsedMs: 999_999 },
    { ...valid, elapsedMs: 1.5 },
    { ...valid, avgConfidence: 1.5 },
    "문자열",
  ]) {
    assert.equal(parseSession(bad).ok, false);
  }
});

test("슬라임 아트는 종류별 색과 방향별 얼굴을 만든다", () => {
  // 종류마다 색이 다르다.
  const colors = new Set(
    (["nerd", "swift", "keen", "worker"] as const).map(
      (typeId) => slimeSvg(typeId, "down").match(/stop-color="(#[0-9a-f]{6})"/)![1],
    ),
  );
  assert.equal(colors.size, 4);

  // 좌우는 얼굴을 반대로 옮기고, 위는 얼굴을 감춘다.
  const face = (facing: Facing) =>
    slimeSvg("keen", facing).match(/translate\((-?\d+) /)?.[1] ?? null;
  assert.equal(face("down"), "0");
  assert.equal(Number(face("left")) < 0, true);
  assert.equal(Number(face("right")) > 0, true);
  assert.equal(face("up"), null);
  assert.equal(slimeSvg("keen", "up").includes("<circle"), false);

  // 깜빡임은 눈만 감기고 입은 남는다. 애니메이션은 img로 띄울 때만 붙는다.
  const open = slimeSvg("keen", "down");
  const shut = slimeSvg("keen", "down", { blink: true });
  assert.equal(open.includes("<circle cx=\"526\""), true);
  assert.equal(shut.includes("<circle cx=\"526\""), false);
  assert.equal(shut.includes("M 581 718"), true);
  assert.equal(open.includes("@keyframes"), false);
  assert.equal(slimeSvg("keen", "down", { animate: true }).includes("@keyframes"), true);

  // 큰 축이 방향을 정하고, 멈춰 있으면 이전 방향을 유지한다.
  assert.equal(facingFromDelta(9, -2, "down"), "right");
  assert.equal(facingFromDelta(-9, 2, "down"), "left");
  assert.equal(facingFromDelta(1, 9, "left"), "down");
  assert.equal(facingFromDelta(1, -9, "left"), "up");
  assert.equal(facingFromDelta(0, 0, "right"), "right");
});

test("다음 할 일 힌트는 소지품과 솥 상태를 따라 한 걸음씩 안내한다", () => {
  const base = initialState(1, ["keen"]);
  // 아무것도 없을 때는 약초부터.
  assert.match(nextHint(base, "keen").title, /약초를 가져/);
  assert.match(nextHint(base, "keen").say ?? "", /쫑긋/);

  const carrying = (item: "herb" | "parchment" | "book") => ({
    ...base,
    actors: { keen: { ...base.actors.keen!, carrying: item } },
  });
  assert.match(nextHint(carrying("herb"), "keen").title, /솥에 약초를 넣/);
  assert.match(nextHint(carrying("parchment"), "keen").title, /양피지를 담그/);
  assert.match(nextHint(carrying("book"), "keen").title, /납품/);

  const pots = (
    one: GameState["cauldrons"]["cauldron-01"]["status"],
    two: GameState["cauldrons"]["cauldron-02"]["status"],
  ) => ({
    ...base,
    cauldrons: {
      "cauldron-01": { status: one, timerMs: 0 },
      "cauldron-02": { status: two, timerMs: 0 },
    },
  });
  assert.match(nextHint(pots("HERB_LOADED", "EMPTY"), "keen").title, /저어/);
  assert.match(
    nextHint(pots("READY_FOR_PARCHMENT", "EMPTY"), "keen").title,
    /양피지를 가져/,
  );
  assert.match(nextHint(pots("BOOK_READY", "EMPTY"), "keen").title, /꺼내/);
  // 두 솥이 모두 돌아가는 중이면 기다리는 것 말고 할 일이 없다.
  const waiting = nextHint(pots("MIXING", "INSCRIBING"), "keen");
  assert.match(waiting.title, /기다리/);
  assert.equal(waiting.say, null);
});
