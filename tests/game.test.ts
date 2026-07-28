import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { POST } from "../app/api/command/route.js";
import { simulate } from "../game/cli.js";
import { parseSession } from "../game/session.js";
import { nextHint } from "../game/hint.js";
import {
  inspectPhrase,
  matchCarriedPhrase,
  matchPhrase,
} from "../game/phrase.js";
import {
  parseVoiceTest,
  voiceLabSquad,
  voiceTestRow,
} from "../game/voice-test.js";
import { facingFromDelta, slimeSvg, type Facing } from "../app/slime-art.js";
import {
  MAX_VOICE_TILES,
  STORAGE_MAX,
  SUMMON_INTERVAL_MS,
  SUMMON_MAX,
  TILE_SIZE,
  WORKSHOP_ROWS,
  allStations,
  command,
  displayTiles,
  executeEnvelope,
  findPath,
  initialState,
  isValidRoute,
  isWalkable,
  movePlayer,
  nextPlayerAction,
  playerAct,
  productOf,
  redirectCarried,
  slimeTypes,
  sourceOf,
  stockOf,
  taskTiles,
  tick,
  tileCenter,
  validateEnvelope,
  voiceRadiusPx,
  type ActorId,
  type GameState,
  type ItemId,
} from "../game/core.js";

function untilIdle(state: GameState) {
  let next = state;
  for (let count = 0; count < 20_000; count += 1) {
    const busy = Object.values(next.actors).some(
      (actor) => actor.current || actor.queue.length,
    );
    if (!busy) return next;
    next = tick(next, 50);
  }
  throw new Error("슬라임의 작업이 끝나지 않았습니다.");
}

function follow(state: GameState, actorId: ActorId) {
  const actor = state.actors[actorId]!;
  return movePlayer(state, actor.x, actor.y);
}

function order(state: GameState, actorId: ActorId, item: ItemId, target: Parameters<typeof command>[2]) {
  return untilIdle(
    executeEnvelope(follow(state, actorId), command(actorId, item, target)),
  );
}

function stand(state: GameState, tile: { col: number; row: number }) {
  const at = tileCenter(tile);
  return movePlayer(state, at.x, at.y);
}

test("설비는 종류마다 한 타일이고 작업 타일은 인접 바닥이다", () => {
  assert.equal(WORKSHOP_ROWS.length, 10);
  assert.ok(WORKSHOP_ROWS.every((row) => row.length === 16));
  const tiles = [...WORKSHOP_ROWS.join("")];
  for (const mark of ["R", "B", "W", "T", "S", "X"]) {
    assert.equal(tiles.filter((tile) => tile === mark).length, 1);
  }
  const adjacent = (
    a: { col: number; row: number },
    b: { col: number; row: number },
  ) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
  for (const id of allStations) {
    assert.ok(adjacent(taskTiles[id], displayTiles[id]), id);
    assert.ok(isWalkable(taskTiles[id]), id);
  }
  assert.ok(
    findPath(taskTiles["summon-red"], taskTiles.trash)?.every(isWalkable),
  );
});

test("색이 결과물 색을, 목적지가 형태를 정한다", () => {
  assert.equal(productOf("red-herb", "brewer"), "red-potion");
  assert.equal(productOf("red-herb", "table"), "red-scroll");
  assert.equal(productOf("blue-herb", "brewer"), "blue-potion");
  assert.equal(productOf("blue-herb", "table"), "blue-scroll");
  // 가공품은 다시 가공할 수 없다.
  assert.equal(productOf("red-potion", "table"), null);
  assert.equal(isValidRoute("red-potion", "brewer"), false);
  assert.equal(isValidRoute("red-potion", "submission"), true);
  assert.equal(isValidRoute("red-herb", "trash"), true);
  // 물품은 만들어진 곳에서 집는다.
  assert.equal(sourceOf("red-herb"), "summon-red");
  assert.equal(sourceOf("blue-potion"), "brewer");
  assert.equal(sourceOf("red-scroll"), "table");
});

test("소환진은 최대치까지만 약초를 만든다", () => {
  // 실제 루프처럼 50ms씩 흘린다.
  const run = (state: GameState, ms: number) => {
    let next = state;
    for (let elapsed = 0; elapsed < ms; elapsed += 50) next = tick(next, 50);
    return next;
  };
  let state = initialState(1, ["keen"]);
  assert.equal(state.summons.red.stock, 1);
  state = run(state, SUMMON_INTERVAL_MS);
  assert.equal(state.summons.red.stock, 2);
  // 최대치에 닿으면 멈춘다.
  state = run(state, SUMMON_INTERVAL_MS * 5);
  assert.equal(state.summons.red.stock, SUMMON_MAX);
  assert.equal(state.summons.blue.stock, SUMMON_MAX);
});

test("한 명령이 집기·이동·투입을 잇고 재고에 결과물이 쌓인다", () => {
  // 소환이 도중에 끼어들지 않도록 타이머를 멀리 둔다.
  let state = initialState(1, ["keen"]);
  state = {
    ...state,
    summons: {
      red: { stock: 2, timerMs: 999_000 },
      blue: { stock: 2, timerMs: 999_000 },
    },
  };
  state = order(state, "keen", "red-herb", "brewer");
  assert.equal(state.summons.red.stock, 1);
  assert.deepEqual(state.brewer, ["red-potion"]);
  assert.equal(state.actors.keen!.carrying, null);

  state = order(state, "keen", "blue-herb", "table");
  assert.deepEqual(state.table, ["blue-scroll"]);
});

test("재고가 없거나 가득 차면 슬라임을 보내지 않는다", () => {
  // 소환진을 비우면 SOURCE_EMPTY.
  let empty = initialState(1, ["keen"]);
  empty = {
    ...empty,
    summons: { ...empty.summons, red: { stock: 0, timerMs: 9_999 } },
  };
  const denied = executeEnvelope(
    follow(empty, "keen"),
    command("keen", "red-herb", "brewer"),
  );
  assert.equal(denied.actors.keen!.queue.length, 0);
  assert.equal(denied.actors.keen!.alert, "SOURCE_EMPTY");
  assert.match(denied.lastEvent, /필요한 물품이 없/);

  // 양조기가 가득 차면 TARGET_FULL.
  let full = initialState(1, ["keen"]);
  full = { ...full, brewer: ["red-potion", "red-potion", "red-potion"] };
  assert.equal(full.brewer.length, STORAGE_MAX);
  const blocked = executeEnvelope(
    follow(full, "keen"),
    command("keen", "red-herb", "brewer"),
  );
  assert.equal(blocked.actors.keen!.queue.length, 0);
  assert.equal(blocked.actors.keen!.alert, "TARGET_FULL");
});

test("주문을 채우면 골드가 오르고 다음 주문이 온다", () => {
  // seed 0의 주문은 붉은 약초 2개다.
  let state = initialState(0, ["keen"]);
  assert.deepEqual(state.order.need, { "red-herb": 2 });
  state = { ...state, summons: { ...state.summons, red: { stock: 2, timerMs: 9_999 } } };
  state = order(state, "keen", "red-herb", "submission");
  assert.equal(state.filled, 0);
  assert.equal(state.order.done["red-herb"], 1);
  state = order(state, "keen", "red-herb", "submission");
  assert.equal(state.filled, 1);
  assert.equal(state.gold, 100);
  assert.deepEqual(state.order.done, {});
});

test("버린 물품은 재고에서 사라지고 되돌아오지 않는다", () => {
  let state = initialState(1, ["keen"]);
  state = order(state, "keen", "red-herb", "brewer");
  assert.deepEqual(state.brewer, ["red-potion"]);
  state = order(state, "keen", "red-potion", "trash");
  assert.deepEqual(state.brewer, []);
  assert.equal(stockOf(state, "red-potion"), 0);
  assert.match(state.lastEvent, /버렸습니다/);
});

test("그거 명령은 현재 든 물품의 목적지를 바꾼다", () => {
  const squad: ActorId[] = ["keen", "swift"];
  assert.deepEqual(matchCarriedPhrase("날쌘아 그거 테이블로 가져가", squad), {
    actorId: "swift",
    target: "table",
  });
  assert.deepEqual(matchCarriedPhrase("들고 있는 거 버려", squad), {
    actorId: "keen",
    target: "trash",
  });
  assert.deepEqual(matchCarriedPhrase("가지고 있는 거 제출해", squad), {
    actorId: "keen",
    target: "submission",
  });
  assert.equal(matchCarriedPhrase("날쌘아 붉은 물약 버려", squad), null);

  let state = initialState(1, ["swift"]);
  state = executeEnvelope(
    follow(state, "swift"),
    command("swift", "red-herb", "brewer"),
  );
  for (let count = 0; count < 1_000 && !state.actors.swift!.carrying; count += 1) {
    state = tick(state, 50);
  }
  assert.equal(state.actors.swift!.carrying, "red-herb");
  assert.equal(state.actors.swift!.current?.target, "brewer");

  state = redirectCarried(follow(state, "swift"), "swift", "table");
  assert.equal(state.actors.swift!.carrying, "red-herb");
  assert.equal(state.actors.swift!.current?.target, "table");
  assert.deepEqual(state.brewer, []);
  state = untilIdle(state);
  assert.equal(state.actors.swift!.carrying, null);
  assert.deepEqual(state.brewer, []);
  assert.deepEqual(state.table, ["red-scroll"]);

  state = executeEnvelope(
    follow(state, "swift"),
    command("swift", "red-scroll", "submission"),
  );
  for (let count = 0; count < 1_000 && !state.actors.swift!.carrying; count += 1) {
    state = tick(state, 50);
  }
  const invalid = redirectCarried(follow(state, "swift"), "swift", "table");
  assert.equal(invalid.actors.swift!.carrying, "red-scroll");
  assert.equal(invalid.actors.swift!.current?.target, "submission");
  assert.match(invalid.lastEvent, /보낼 수 없습니다/);

  const empty = redirectCarried(
    follow(initialState(1, ["swift"]), "swift"),
    "swift",
    "table",
  );
  assert.equal(empty.actors.swift!.current, null);
  assert.match(empty.lastEvent, /들고 있는 물품이 없습니다/);
});

test("신뢰 경계는 허용된 슬라임·물품·목적지만 받는다", () => {
  assert.equal(validateEnvelope(command("keen", "red-herb", "brewer")).ok, true);
  const base = command("keen", "red-herb", "brewer");
  for (const bad of [
    { ...base, commands: [{ ...base.commands[0], actorId: "ghost" }] },
    { ...base, commands: [{ ...base.commands[0], item: "green-herb" }] },
    { ...base, commands: [{ ...base.commands[0], target: "moon" }] },
    // 물약은 양조기에 넣을 수 없다.
    { ...base, commands: [{ ...base.commands[0], item: "red-potion" }] },
    // 소환진은 목적지가 될 수 없다.
    { ...base, commands: [{ ...base.commands[0], target: "summon-red" }] },
  ]) {
    assert.equal(validateEnvelope(bad).ok, false);
  }
});

test("청력·집중력·소리 원이 명령 접수를 가른다", () => {
  const base = initialState(1, ["worker"]);
  const far = stand(base, { col: 11, row: 6 });
  // 일꾼은 청력 0(2타일). 조용히 말하면 닿지 않는다.
  const quiet = executeEnvelope(far, command("worker", "red-herb", "brewer"), 0);
  assert.equal(quiet.actors.worker!.alert, "NOT_HEARD");
  // 크게 외치면 소리 원 4타일이 더해져 닿는다.
  const shout = executeEnvelope(far, command("worker", "red-herb", "brewer"), 1);
  assert.equal(shout.actors.worker!.queue.length, 1);
  assert.equal(voiceRadiusPx(0.5), (MAX_VOICE_TILES * TILE_SIZE) / 2);

  // 날쌘은 집중력 1 → 2건까지. 3건은 TOO_COMPLEX.
  const swift = follow(initialState(1, ["swift"]), "swift");
  const cmd = (sequence: number) => ({
    actorId: "swift" as ActorId,
    item: "red-herb" as ItemId,
    target: "brewer" as const,
    sequence,
  });
  const tooMany = executeEnvelope(swift, {
    status: "OK",
    confidence: 1,
    reason: null,
    commands: [cmd(1), cmd(2), cmd(3)],
  });
  assert.equal(tooMany.actors.swift!.alert, "TOO_COMPLEX");
});

test("플레이어는 전담키로 앞에 있는 설비를 직접 다룬다", () => {
  let state = initialState(1, ["keen"]);
  assert.equal(nextPlayerAction(state), null);

  // 붉은 소환진 앞 → 약초 집기.
  state = stand(state, displayTiles["summon-red"]);
  assert.equal(nextPlayerAction(state)?.label, "붉은 약초 집기");
  state = playerAct(state);
  assert.equal(state.player.carrying, "red-herb");

  // 약초를 들고 양조기 앞 → 물약 만들기.
  state = stand(state, displayTiles.brewer);
  assert.equal(nextPlayerAction(state)?.label, "붉은 물약 만들기");
  state = playerAct(state);
  assert.equal(state.player.carrying, null);
  assert.deepEqual(state.brewer, ["red-potion"]);

  // 빈손으로 다시 서면 이번엔 꺼내기가 된다.
  assert.equal(nextPlayerAction(state)?.label, "붉은 물약 꺼내기");
  state = playerAct(state);
  assert.equal(state.player.carrying, "red-potion");

  // 쓰레기통 앞이면 버리기.
  state = stand(state, displayTiles.trash);
  assert.equal(nextPlayerAction(state)?.label, "붉은 물약 버리기");
  state = playerAct(state);
  assert.equal(state.player.carrying, null);
});

test("실시간 문장은 물품과 목적지를 잡아 바로 명령이 된다", () => {
  const squad: ActorId[] = ["keen", "worker"];
  const one = (text: string) => matchPhrase(text, squad)?.[0];

  assert.deepEqual(one("쫑긋아 붉은 약초를 양조기에 넣어"), {
    actorId: "keen",
    item: "red-herb",
    target: "brewer",
    sequence: 1,
  });
  assert.equal(one("파란 약초를 테이블로 가져가")?.target, "table");
  assert.equal(one("파란 약초를 테이블로 가져가")?.item, "blue-herb");
  assert.equal(one("붉은 물약 제출해")?.target, "submission");
  assert.equal(one("붉은 물약 제출해")?.item, "red-potion");
  assert.equal(one("파란 스크롤 버려")?.target, "trash");
  assert.equal(one("일꾼아 붉은 약초 제출해")?.actorId, "worker");
  assert.equal(one("종끗아 불근 약추를 양주기에 넣어")?.actorId, "keen");
  assert.equal(one("종끗아 불근 약추를 양주기에 넣어")?.item, "red-herb");
  assert.equal(one("종끗아 불근 약추를 양주기에 넣어")?.target, "brewer");
  assert.deepEqual(one("좀 끄자 붉은 양초를 양조기에 넣어"), {
    actorId: "keen",
    item: "red-herb",
    target: "brewer",
    sequence: 1,
  });
  assert.equal(one("일꾸니 파랑 무략 재출해")?.actorId, "worker");
  assert.equal(one("일꾸니 파랑 무략 재출해")?.item, "blue-potion");
  assert.equal(one("일꾸니 파랑 무략 재출해")?.target, "submission");

  // 목적지나 물품이 빠지면 사전이 명령을 만들지 않는다.
  assert.equal(matchPhrase("붉은 약초 가져와", squad), null);
  assert.equal(matchPhrase("양조기에 넣어", squad), null);
  // 물약을 양조기에 넣는 말은 규칙상 성립하지 않는다.
  assert.equal(matchPhrase("붉은 물약을 양조기에 넣어", squad), null);
  assert.equal(matchPhrase("오늘 날씨 좋다", squad), null);

  const inspected = inspectPhrase("붉은 양초 양쪽에", [
    "nerd",
    "keen",
    "swift",
  ]);
  assert.deepEqual(inspected.matches, [
    {
      field: "actor",
      spoken: null,
      canonical: "너드",
      source: "default",
    },
    {
      field: "color",
      spoken: "붉은",
      canonical: "붉은색",
      source: "dictionary",
    },
    {
      field: "item",
      spoken: "양초",
      canonical: "약초",
      source: "dictionary",
    },
    {
      field: "target",
      spoken: "양쪽",
      canonical: "양조기",
      source: "dictionary",
    },
  ]);
});

test("음성 실험 결과는 기대값과 로컬·Gemini 일치 여부를 정형화한다", () => {
  const input = {
    batchId: "batch-1",
    expectedActor: "keen",
    expectedItem: "red-herb",
    expectedTarget: "brewer",
    transcript: "좀 끄자 붉은 양초를 양조기에 넣어",
    sttConfidence: 0.72,
    durationMs: 1800,
    gemini: {
      status: "OK",
      confidence: 0.91,
      commands: [{
        actorId: "keen",
        item: "red-herb",
        target: "brewer",
        sequence: 1,
      }],
      reason: null,
    },
  };
  const parsed = parseVoiceTest(input);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const row = voiceTestRow(parsed.value);
  assert.equal(voiceLabSquad("keen")[0] === "keen", false);
  assert.equal(row.localAllMatch, true);
  assert.equal(row.geminiAllMatch, true);
  assert.equal(
    parseVoiceTest({ ...input, expectedItem: "red-potion" }).ok,
    false,
  );
});

test("음성 실험실은 현재 든 물품의 목적지 변경을 기대값으로 검증한다", () => {
  const input = {
    batchId: "batch-carried",
    expectedActor: "swift",
    expectedItem: "carried",
    expectedTarget: "table",
    expectedPhraseStyle: "holding",
    transcript: "날쌘아 들고 있는 거 테이블로 가져가",
    sttConfidence: 0.9,
    durationMs: 1200,
    gemini: {
      status: "SKIPPED",
      confidence: null,
      commands: [],
      reason: "브라우저 STT 텍스트는 Gemini로 재분석하지 않습니다.",
    },
  };
  const parsed = parseVoiceTest(input);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const row = voiceTestRow(parsed.value);
  assert.equal(row.expectedPhrase, "날쌘아, 들고 있는 거 테이블로 가져가");
  assert.equal(row.localStatus, "CONTEXTUAL");
  assert.equal(row.localAllMatch, true);
  assert.equal(row.localItemMatch, true);
  assert.equal(
    parseVoiceTest({ ...input, expectedTarget: "summon-red" }).ok,
    false,
  );
  assert.equal(
    parseVoiceTest({ ...input, expectedPhraseStyle: "unknown" }).ok,
    false,
  );
});

test("다음 할 일 힌트는 주문에서 부족한 것을 짚는다", () => {
  // seed 0 주문은 붉은 약초 2개. 재고가 있으면 제출부터.
  const herbOrder = initialState(0, ["keen"]);
  assert.match(nextHint(herbOrder, "keen").title, /붉은 약초.*제출/);

  // 붉은 물약이 필요한데 재고가 없으면 양조기로 보내라고 한다.
  const potionOrder: GameState = {
    ...herbOrder,
    order: { need: { "red-potion": 1 }, done: {} },
  };
  const hint = nextHint(potionOrder, "keen");
  assert.match(hint.title, /양조기에 넣/);
  assert.match(hint.say ?? "", /붉은 약초/);
});

test("같은 seed, 스쿼드, 명령은 같은 결과를 만든다", () => {
  const play = () => {
    let state = initialState(91, ["keen", "worker"]);
    state = order(state, "keen", "red-herb", "brewer");
    state = order(state, "worker", "blue-herb", "table");
    return state;
  };
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

test("브라우저 STT 텍스트는 Gemini 명령 API가 다시 분석하지 않는다", async () => {
  const form = new FormData();
  form.set("text", "쫑긋아 붉은 약초를 양조기에 넣어");
  const response = await POST(
    new Request("http://localhost/api/command", { method: "POST", body: form }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    reason: "8MB 이하 오디오 파일이 필요합니다.",
  });
});

test("마이크 오디오는 이름 별칭 안내와 함께 Gemini로 전달된다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  let sent = "";
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async (_input, init) => {
    sent = String(init?.body);
    return Response.json({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              status: "OK",
              confidence: 0.8,
              transcript: "종끗아 불근 약추를 양주기에 넣어",
              commands: [{
                actorId: "keen",
                item: "red-herb",
                target: "brewer",
                sequence: 1,
              }],
              reason: null,
            }),
          }],
        },
      }],
    });
  };
  try {
    const form = new FormData();
    form.set("audio", new File(["voice"], "command.webm", { type: "audio/webm" }));
    form.set("actors", "keen,worker");
    const response = await POST(
      new Request("http://localhost/api/command", { method: "POST", body: form }),
    );
    assert.equal(response.status, 200);
    assert.match(sent, /inlineData/);
    assert.match(sent, /쫑긋.*종끗/);
    assert.deepEqual((await response.json()).commands[0], {
      actorId: "keen",
      item: "red-herb",
      target: "brewer",
      sequence: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test("CLI는 같은 입력을 재현하고 물품 이동을 완료한다", () => {
  const args = ["--seed=7", "--slimes=keen", "red-herb>brewer", "red-potion>trash"];
  const first = simulate(args);
  assert.deepEqual(first, simulate(args));
  assert.deepEqual(first.final.brewer, []);
  assert.equal(first.final.actors.keen!.carrying, null);

  const team = simulate(["--slimes=nerd,swift", "swift.red-herb>table"]);
  assert.deepEqual(team.final.table, ["red-scroll"]);

  assert.throws(() => simulate(["red-potion>brewer"]), /허용되지 않은 명령/);
  assert.throws(() => simulate(["--slimes=nerd", "swift.red-herb>brewer"]), /스쿼드에 없는/);
  const cli = fileURLToPath(new URL("../game/cli.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "FLY"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
});

test("슬라임 아트는 종류별 색과 방향별 얼굴을 만든다", () => {
  const colors = new Set(
    (["nerd", "swift", "keen", "worker"] as const).map(
      (typeId) => slimeSvg(typeId, "down").match(/stop-color="(#[0-9a-f]{6})"/)![1],
    ),
  );
  assert.equal(colors.size, 4);
  const face = (facing: Facing) =>
    slimeSvg("keen", facing).match(/translate\((-?\d+) /)?.[1] ?? null;
  assert.equal(face("down"), "0");
  assert.equal(Number(face("left")) < 0, true);
  assert.equal(Number(face("right")) > 0, true);
  assert.equal(face("up"), null);
  assert.equal(slimeSvg("keen", "down", { blink: true }).includes('<circle cx="526"'), false);
  assert.equal(facingFromDelta(9, -2, "down"), "right");
  assert.equal(facingFromDelta(1, 9, "left"), "down");
  assert.equal(facingFromDelta(0, 0, "right"), "right");
});

test("슬라임 종류는 스탯 레벨을 결정한다", () => {
  assert.deepEqual(slimeTypes.nerd.statLevels, {
    workSpeed: 2,
    moveSpeed: 0,
    hearing: 1,
    focus: 3,
  });
  assert.equal(initialState(1, ["swift"]).actors.swift!.moveSpeed, 2.5 * TILE_SIZE);
  assert.throws(() => initialState(1, []), /1~3마리/);
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
  assert.equal(parseSession(valid).ok, true);
  for (const bad of [
    { ...valid, result: "cheated" },
    { ...valid, booksSubmitted: 99 },
    { ...valid, voiceCommands: -1 },
    { ...valid, avgConfidence: 1.5 },
    "문자열",
  ]) {
    assert.equal(parseSession(bad).ok, false);
  }
});
