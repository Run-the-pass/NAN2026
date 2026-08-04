"use client";

import * as Phaser from "phaser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  KITCHEN_ROWS,
  initialState,
  interactActors,
  isWalkable,
  moveActors,
  pixelToTile,
  slimeTypes,
  tick,
  tileCenter,
  INGREDIENT_MAX,
  stationInstances,
  stationType,
  stationLabels,
  activeOrders,
  itemLabel,
  recipes,
  squadActorIds,
  currentStage,
  isLastStage,
  nextStage,
  recruitSlime,
  GOLD_PER_ORDER,
  dishConfig,
  incineratorConfig,
  carriedLabel,
  isDish,
  type ActorId,
  type Carried,
  type GameState,
  type ItemId,
  type SlimeTypeId,
  type StationId,
  type StationInstanceId,
} from "../game/core";
import {
  facingFromDelta,
  facings,
  authoredFaceLayout,
  slimeDataUri,
  type Facing,
} from "./slime-art";
import Music, { MusicSettings } from "./Music";
import { gameMusicSource } from "./music-source";
import { GameSoundEffects } from "./SoundEffects";
import StageInfoScreen from "./StageInfoScreen";
import { itemIcons, stationIcons } from "./stage-info";

type View = {
  sync: (state: GameState) => void;
  pause: () => void;
  resume: () => void;
};

const typeColors: Record<SlimeTypeId, number> = {
  water: 0x189fc4,
  fire: 0xe05a39,
  lightning: 0xefb229,
  earth: 0x8b6c42,
};
const authoredSlimeAssets: Partial<Record<SlimeTypeId, string>> = {
  fire: "/slimes/fire.svg",
  lightning: "/slimes/lightning.svg",
  earth: "/slimes/earth.svg",
};
const allTypeIds = Object.keys(slimeTypes) as SlimeTypeId[];
// 캔버스 내부 해상도 배율. 카메라 zoom도 같은 값을 써서 보이는
// 영역은 그대로 두고 픽셀만 촘촘하게 만든다.
const RENDER_SCALE = 3;
// 텍스처는 world 58x45로 그린다. 확대에 견디도록 넉넉히 구워 둔다.
const SLIME_TEXTURE = { width: 348, height: 270 };
const SLIME_SCALE = 58 / SLIME_TEXTURE.width;
const AUTHORED_TEXTURE = { width: 348, height: 301 };
// 머리 장식 여백을 뺀 원본 몸통 폭이 물 슬라임의 58px 몸통과 맞는다.
const AUTHORED_SLIME_SCALE = SLIME_SCALE * 1.12;
// 젓기만 손에 드는 것이 없어 따로 보여 줘야 한다.
type Motion = "idle" | "walk" | "stir" | "pick";
const alertIcons: Record<string, string> = {
  WAITING: "⏳",
  SOURCE_EMPTY: "🫙",
  TARGET_FULL: "🚫",
  INVALID_ROUTE: "❓",
  WRONG_ELEMENT: "🔥",
};
const workStatusLabels = {
  IDLE: "대기",
  MISSING_MATERIAL: "식재료 부족",
  WORKING: "조리 중",
  COMPLETE: "요리 완성",
} as const;
// 주방 설비 타일 색.
const stationColors: Record<StationId, number> = {
  "ingredient-box": 0x9a6235,
  stove: 0x8b5b32,
  submission: 0x3f7f4a,
  trash: 0x585264,
  "dish-rack": 0x6f83a7,
  washer: 0x3e8e9e,
  table: 0x8b5b32,
};
// 이모지 대신 그림으로 그리는 설비. 조리 도구는 불을 쓰지 않으므로
// 테이블 위에 올린 도마로 표현한다.
const stationImages: Partial<Record<StationId, string>> = {
  stove: "/food/doma.png",
  "ingredient-box": "/food/gamja.png",
};
const STATION_ART_PX = 34;
// 판이 시작할 때와 마감이 다가올 때 잠깐 띄우는 큰 문구.
const bannerImages = {
  start: "/text/business-start-title.png",
  closing: "/text/closing-soon-title.png",
} as const;
const BANNER_MS = 1600;
// 주문 카드에 빈 접시 위로 얹어 그리는 완성 음식.
const foodImages: Partial<Record<ItemId, string>> = {
  "roasted-potato": "/food/gamja.png",
};

// 소지품은 머리 위가 아니라 슬라임이 앞으로 든 것처럼 놓는다. 등을 돌리면
// 몸 뒤로 넘겨 위쪽만 살짝 보이게 한다. 경고 말풍선은 그대로 머리 위다.
const carryOffsets: Record<Facing, { x: number; y: number; behind?: boolean }> = {
  down: { x: 0, y: 17 },
  left: { x: -23, y: 9 },
  right: { x: 23, y: 9 },
  up: { x: 0, y: -20, behind: true },
};

const carriedIcon = (carried: Carried) =>
  isDish(carried)
    ? carried.status === "dirty"
      ? "🍽️💧"
      : carried.content
        ? `🍽️${itemIcons[carried.content]}`
        : "🍽️"
    : itemIcons[carried];

const statRows = [
  ["🔨", "작업 속도", "workSpeed"],
  ["👟", "이동 속도", "moveSpeed"],
] as const;

type Metrics = {
  buttonCommands: number;
};

const emptyMetrics = (): Metrics => ({
  buttonCommands: 0,
});

type InspectorTarget =
  | { kind: "actor"; id: ActorId }
  | { kind: "station"; id: StationInstanceId };

const stationPanelInfo: Record<
  StationId,
  { description: string[]; required: SlimeTypeId[]; steps: string[] }
> = {
  "ingredient-box": {
    description: ["감자가 일정 시간마다 채워집니다.", "빈손이나 깨끗한 그릇으로 꺼냅니다."],
    required: [],
    steps: ["🥔 감자 받기"],
  },
  stove: {
    description: ["감자를 넣고 손질하면 요리가 됩니다.", "완성 음식은 깨끗한 그릇에 담습니다."],
    required: [],
    steps: ["🥔 감자", "🔪 손질", "🍽️ 그릇"],
  },
  submission: {
    description: ["주문 음식이 담긴 그릇을 제출합니다.", "제출한 그릇은 더러워집니다."],
    required: [],
    steps: ["🍲 음식", "📬 제출"],
  },
  trash: {
    description: ["쓰레기를 최대 5개까지 보관합니다.", "불 슬라임이 소각 작업으로 비웁니다."],
    required: ["fire"],
    steps: ["🗑️ 쓰레기 투입", "🔥 소각"],
  },
  "dish-rack": {
    description: ["깨끗한 그릇을 꺼내는 곳입니다.", "생성대에는 그릇이 최대 3개 있습니다."],
    required: [],
    steps: ["🍽️ 그릇 받기"],
  },
  washer: {
    description: ["더러운 그릇을 맡겨 세척합니다.", "물 슬라임이 세척을 완료할 수 있습니다."],
    required: ["water"],
    steps: ["🍽️ 더러운 그릇", "💧 세척"],
  },
  table: {
    description: ["재료나 그릇을 한 칸 보관합니다.", "다른 슬라임에게 물건을 인계할 수 있습니다."],
    required: [],
    steps: ["🪵 보관", "🤝 인계"],
  },
};

const slimePortrait = (typeId: SlimeTypeId) =>
  typeId === "water"
    ? "/slimes/water.svg"
    : authoredSlimeAssets[typeId] ?? slimeDataUri(typeId, "down");

function StatGauges({ levels }: { levels: Record<string, number> }) {
  return (
    <ul className="slime-stats">
      {statRows.map(([icon, label, key]) => (
        <li key={key}>
          <span aria-hidden>{icon}</span>
          <span>{label}</span>
          <span
            className="stat-gauge"
            role="img"
            aria-label={`${label} 레벨 ${levels[key]} / 5`}
          >
            {[0, 1, 2, 3, 4].map((cell) => (
              <i key={cell} data-on={cell < levels[key] ? "" : undefined} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecruitScreen({
  picked,
  onPick,
  onConfirm,
}: {
  picked: SlimeTypeId;
  onPick: (typeId: SlimeTypeId) => void;
  onConfirm: () => void;
}) {
  return (
    <section className="recruit-overlay" role="dialog" aria-modal="true" aria-labelledby="recruit-title">
      <div className="recruit-screen">
        <h2 id="recruit-title">추가할 슬라임을 선택하세요!</h2>
        <div className="select-grid">
          {allTypeIds.map((typeId) => {
            const kind = slimeTypes[typeId];
            return (
              <button
                key={typeId}
                className="slime-select-card"
                data-slime-type={typeId}
                data-active={picked === typeId ? "" : undefined}
                aria-pressed={picked === typeId}
                onClick={() => onPick(typeId)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="slime-portrait"
                  data-water={typeId === "water" ? "" : undefined}
                  data-authored={authoredSlimeAssets[typeId] ? "" : undefined}
                  src={slimePortrait(typeId)}
                  alt=""
                />
                <strong>{kind.name} 슬라임</strong>
                <small>{kind.role}</small>
              </button>
            );
          })}
        </div>
        <p>선택: {slimeTypes[picked].name} 슬라임</p>
        <button className="select-start" type="button" onClick={onConfirm}>확인</button>
      </div>
    </section>
  );
}

// 완성 음식은 빈 접시 위에 올려 보여 준다. 그림이 없는 음식은 이모지로 남긴다.
function OrderDish({ foodId }: { foodId: ItemId }) {
  const art = foodImages[foodId];
  if (!art) return <span aria-hidden>{itemIcons[foodId]}</span>;
  return (
    <span className="order-dish" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/food/plate.png" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" />
    </span>
  );
}

function OrderCards({ state }: { state: GameState }) {
  const orders = activeOrders(state);
  const urgency = state.timeLeft <= 20 ? "danger" : state.timeLeft <= 40 ? "warn" : "ready";
  // 카드 위 띠는 남은 영업 시간 게이지다. 주문별 제한 시간이 생기면
  // 이 비율만 주문 기준으로 바꾸면 된다.
  const left = Math.max(
    0,
    Math.min(100, (state.timeLeftMs / currentStage(state).timeLimitMs) * 100),
  );
  return (
    <section className="order-cards" aria-label="진행 중인 주문">
      {[0, 1, 2].map((index) => {
        const order = orders[index];
        if (!order) return <span className="order-card order-card-empty" aria-hidden key={index} />;
        const recipe = recipes[order.foodId as keyof typeof recipes];
        return (
          <article className="order-card" data-urgency={urgency} key={order.id}>
            <span className="order-gauge" aria-hidden>
              <i style={{ width: `${left}%` }} />
            </span>
            <header>
              <b>주문 {index + 1}</b>
              <span>영업 {state.timeLeft}초</span>
            </header>
            <strong className="order-food">
              <OrderDish foodId={order.foodId} />
              {itemLabel(order.foodId)}
              <small>{order.submittedCount}/{order.targetCount}</small>
            </strong>
            <div className="order-process" aria-label="조리 흐름">
              <span>{recipe ? itemIcons[recipe.ingredient.itemId] : "?"}</span>
              <i aria-hidden>→</i>
              <span>{recipe ? stationIcons[recipe.station] : "?"}</span>
            </div>
            <footer>
              {recipe ? stationLabels[recipe.station] : "조리 정보 없음"}
            </footer>
          </article>
        );
      })}
    </section>
  );
}

function GameInspector({
  state,
  target,
  onClose,
  onHelp,
}: {
  state: GameState;
  target: InspectorTarget;
  onClose: () => void;
  onHelp: (id: StationId) => void;
}) {
  if (target.kind === "actor") {
    const actor = state.actors[target.id];
    if (!actor) return null;
    const type = slimeTypes[actor.typeId];
    return (
      <aside className="game-inspector" data-type={actor.typeId} aria-label={`${actor.name} 정보`}>
        <button className="inspector-close" type="button" onClick={onClose} aria-label="정보 패널 닫기">×</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="inspector-portrait" src={slimePortrait(actor.typeId)} alt="" />
        <p className="eyebrow">SLIME INFO</p>
        <h2>{actor.name}</h2>
        <p className="inspector-copy">{type.trait}</p>
        <StatGauges levels={actor.statLevels} />
        <h3>가능한 일</h3>
        <div className="inspector-badges">
          {type.role.split(" · ").map((role) => <span key={role}>{role}</span>)}
        </div>
      </aside>
    );
  }
  const type = stationType(target.id);
  const info = stationPanelInfo[type];
  return (
    <aside className="game-inspector" data-station aria-label={`${stationLabels[type]} 정보`}>
      <button className="inspector-close" type="button" onClick={onClose} aria-label="정보 패널 닫기">×</button>
      <button className="inspector-station-icon" type="button" onClick={() => onHelp(type)} aria-label={`${stationLabels[type]} 자세히 보기`}>
        <span aria-hidden>{stationIcons[type]}</span>
      </button>
      <p className="eyebrow">STATION INFO</p>
      <h2>{stationLabels[type]}</h2>
      <small>{target.id}</small>
      <div className="inspector-copy">
        {info.description.map((line) => <p key={line}>{line}</p>)}
      </div>
      <h3>필요 슬라임</h3>
      <div className="required-slimes">
        {info.required.length ? info.required.map((typeId) => (
          <span key={typeId}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slimePortrait(typeId)} alt="" />
            {slimeTypes[typeId].name}
          </span>
        )) : <span className="any-slime">누구나 사용 가능</span>}
      </div>
      <h3>작업 흐름</h3>
      <div className="station-workflow">
        {info.steps.map((step, index) => (
          <span key={step}>{index > 0 && <i aria-hidden>→</i>}<b>{step}</b></span>
        ))}
      </div>
      <small className="inspector-hint">설비를 우클릭하면 선택한 슬라임에게 지시합니다.</small>
    </aside>
  );
}

function StationHelp({ id, onClose }: { id: StationId; onClose: () => void }) {
  const info = stationPanelInfo[id];
  return (
    <section className="station-help-overlay" role="dialog" aria-modal="true" aria-labelledby="station-help-title">
      <div>
        <span className="station-help-icon" aria-hidden>{stationIcons[id]}</span>
        <section>
          <p className="eyebrow">도구 인포</p>
          <h2 id="station-help-title">{stationLabels[id]}</h2>
          {info.description.map((line) => <p key={line}>{line}</p>)}
          <p><b>조작:</b> 슬라임 선택 후 설비 타일을 우클릭</p>
        </section>
        <button type="button" onClick={onClose}>확인</button>
      </div>
    </section>
  );
}

export default function Game() {
  const [squad, setSquad] = useState<SlimeTypeId[] | null>(null);
  // 일반 플레이는 첫 직원 한 마리, 상호작용 검증은 네 마리로 시작한다.
  const [picked, setPicked] = useState<SlimeTypeId>("water");
  const [state, setState] = useState<GameState | null>(null);
  const [selectedActors, setSelectedActors] = useState<ActorId[]>([]);
  const [inspected, setInspected] = useState<InspectorTarget | null>(null);
  const [helpStation, setHelpStation] = useState<StationId | null>(null);
  const [stageInfoOpen, setStageInfoOpen] = useState(false);
  const [recruitOpen, setRecruitOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [banner, setBanner] = useState<keyof typeof bannerImages | null>(null);
  const paused = stageInfoOpen || recruitOpen || settingsOpen || helpStation !== null || resumeCount !== null;

  const [saved, setSaved] = useState("");
  const stateRef = useRef(state);
  const selectedActorsRef = useRef(selectedActors);
  const view = useRef<View | null>(null);
  const metrics = useRef<Metrics>(emptyMetrics());
  const savedRef = useRef(false);
  const roundSeed = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    selectedActorsRef.current = selectedActors;
  }, [selectedActors]);

  useEffect(() => {
    setInspected((current) => selectedActors.length === 1
      ? { kind: "actor", id: selectedActors[0] }
      : current?.kind === "actor" ? null : current);
  }, [selectedActors]);

  // 판이 시작되면 "영업 시작", 30초가 남으면 "마감 임박"을 한 번씩 띄운다.
  const startedStageId =
    state?.phase === "playing" && !stageInfoOpen && !recruitOpen ? currentStage(state).id : null;
  const closingSoon = state?.phase === "playing" && state.timeLeft <= 30;
  useEffect(() => {
    if (startedStageId) setBanner("start");
  }, [startedStageId]);
  useEffect(() => {
    if (closingSoon) setBanner("closing");
  }, [closingSoon]);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!squad || paused) return;
    // 탭이 백그라운드로 가면 인터벌이 스로틀되므로 고정 50ms 대신
    // 실제 경과 시간을 델타로 넘겨 게임 시간이 벽시계와 함께 흐르게 한다.
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setState((current) => (current ? tick(current, delta) : current));
    }, 50);
    return () => window.clearInterval(timer);
  }, [squad, paused]);

  useEffect(() => {
    if (resumeCount === null) return;
    const timer = window.setTimeout(
      () => setResumeCount((count) => count === null || count <= 1 ? null : count - 1),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resumeCount]);

  useEffect(() => {
    if (paused) view.current?.pause();
    else view.current?.resume();
  }, [paused]);

  useEffect(() => {
    if (state) view.current?.sync(state);
  }, [state, selectedActors]);

  // 한 판이 끝나면 요약 지표를 한 번만 저장한다.
  useEffect(() => {
    if (!state || state.phase === "playing" || savedRef.current) return;
    savedRef.current = true;
    const counts = metrics.current;
    setSaved("기록 저장 중…");
    fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seed: roundSeed.current,
        result: state.phase,
        booksSubmitted: state.filled,
        goal: state.goal,
        elapsedMs: currentStage(state).timeLimitMs - state.timeLeftMs,
        voiceCommands: 0,
        buttonCommands: counts.buttonCommands,
        voiceFailures: 0,
        avgConfidence: null,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error || "기록 저장 실패");
        }
        setSaved("플레이 기록을 저장했습니다.");
      })
      .catch((error: unknown) => {
        setSaved(error instanceof Error ? error.message : "기록 저장 실패");
      });
  }, [state]);

  useEffect(() => {
    if (!squad) return;
    // 스프라이트는 마리 수만큼, 텍스처는 속성 수만큼 만든다.
    const roster = squadActorIds(squad);
    const kinds = [...new Set(squad)];
    class Restaurant extends Phaser.Scene {
      slimes!: Partial<
        Record<
          ActorId,
          {
            typeId: SlimeTypeId;
            body: Phaser.GameObjects.Container;
            visual: Phaser.GameObjects.Container;
            art: Phaser.GameObjects.Image;
            faceLayer?: Phaser.GameObjects.Graphics;
            carried: Phaser.GameObjects.Text;
            selected: Phaser.GameObjects.Arc;
            facing: Facing;
            last: { x: number; y: number };
            mode: Motion;
            blinking: boolean;
            scale: number;
            motion: Phaser.Tweens.Tween;
          }
        >
      >;
      stations!: Record<StationInstanceId, Phaser.GameObjects.Text>;

      // 가만히 있을 때: 원본 SVG의 숨쉬기를 tween으로 옮긴 것.
      breathe(visual: Phaser.GameObjects.Container, scale = SLIME_SCALE) {
        visual.setScale(scale);
        return this.tweens.add({
          targets: visual,
          scaleX: scale * 0.985,
          scaleY: scale * 1.035,
          y: -2,
          duration: 1600,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // 걸을 때: 더 짧고 크게 통통 튄다.
      walk(visual: Phaser.GameObjects.Container, scale = SLIME_SCALE) {
        visual.setScale(scale);
        return this.tweens.add({
          targets: visual,
          scaleX: scale * 1.06,
          scaleY: scale * 0.9,
          y: 3,
          duration: 240,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // 젓기: 팔이 없으니 몸을 좌우로 기울여 젓는다.
      // 도마질: 빠르게 내리찍고 잠깐 멈췄다 돌아온 뒤 한 박 쉰다.
      // 같은 폭으로 좌우로만 흔들면 단조로워서 리듬을 준다.
      stir(visual: Phaser.GameObjects.Container, scale = SLIME_SCALE) {
        visual.setScale(scale).setAngle(0);
        return this.tweens.add({
          targets: visual,
          scaleX: scale * 1.14,
          scaleY: scale * 0.8,
          y: 10,
          angle: -8,
          duration: 120,
          ease: "Quad.easeIn",
          yoyo: true,
          hold: 40,
          repeatDelay: 150,
          repeat: -1,
        });
      }

      // 집기·놓기: 푹 눌렸다 펴지는 한 동작.
      pick(visual: Phaser.GameObjects.Container, scale = SLIME_SCALE) {
        visual.setScale(scale);
        return this.tweens.add({
          targets: visual,
          scaleX: scale * 1.12,
          scaleY: scale * 0.8,
          y: 6,
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: "Quad.easeOut",
        });
      }

      startMotion(visual: Phaser.GameObjects.Container, mode: Motion, scale = SLIME_SCALE) {
        if (mode === "walk") return this.walk(visual, scale);
        if (mode === "stir") return this.stir(visual, scale);
        if (mode === "pick") return this.pick(visual, scale);
        return this.breathe(visual, scale);
      }

      // 방향과 깜빡임 상태를 하나의 텍스처 키로 합쳐 적용한다.
      paintSlime(actorId: ActorId) {
        const sprite = this.slimes[actorId];
        if (!sprite) return;
        if (authoredSlimeAssets[sprite.typeId] && sprite.faceLayer) {
          sprite.art
            .setTexture(`slime-${sprite.typeId}-art`)
            .setFlipX(sprite.facing === "left");
          const face = authoredFaceLayout(sprite.facing, sprite.blinking, sprite.typeId);
          sprite.faceLayer.clear();
          if (face) {
            const eyeY = face.y + face.eyeY;
            const mouthY = face.y + face.mouthY;
            sprite.faceLayer.fillStyle(0x020100, 1);
            if (face.blink) {
              sprite.faceLayer
                .fillRoundedRect(
                  face.x - face.eyeOffsetX - face.blinkWidth / 2,
                  face.y + face.blinkY,
                  face.blinkWidth,
                  face.blinkHeight,
                  face.blinkHeight / 2,
                )
                .fillRoundedRect(
                  face.x + face.eyeOffsetX - face.blinkWidth / 2,
                  face.y + face.blinkY,
                  face.blinkWidth,
                  face.blinkHeight,
                  face.blinkHeight / 2,
                );
            } else if (sprite.typeId === "fire") {
              // 각 눈은 원호와 사선 한 개로 닫아, 원의 윗부분만 잘라낸다.
              const fireEyeRadius = face.eyeRadius;
              sprite.faceLayer
                .beginPath()
                .arc(
                  face.x - face.eyeOffsetX,
                  eyeY,
                  fireEyeRadius,
                  -Math.PI / 15,
                  7 * Math.PI / 6,
                )
                .closePath()
                .fillPath()
                .beginPath()
                .arc(
                  face.x + face.eyeOffsetX,
                  eyeY,
                  fireEyeRadius,
                  -Math.PI / 6,
                  16 * Math.PI / 15,
                )
                .closePath()
                .fillPath();
            } else {
              sprite.faceLayer
                .fillCircle(face.x - face.eyeOffsetX, eyeY, face.eyeRadius)
                .fillCircle(face.x + face.eyeOffsetX, eyeY, face.eyeRadius);
            }
            sprite.faceLayer
              .beginPath()
              .moveTo(face.x - face.mouthRadius, mouthY)
              .lineTo(face.x + face.mouthRadius, mouthY)
              .arc(face.x, mouthY, face.mouthRadius, 0, Math.PI)
              .closePath()
              .fillPath();
          }
          return;
        }
        const blink = sprite.blinking && sprite.facing !== "up" ? "-blink" : "";
        sprite.art.setTexture(`slime-${sprite.typeId}-${sprite.facing}${blink}`);
      }

      preload() {
        for (const [id, url] of Object.entries(stationImages)) {
          this.load.image(`station-${id}`, url);
        }
        for (const typeId of kinds) {
          const asset = authoredSlimeAssets[typeId];
          if (asset) {
            this.load.svg(`slime-${typeId}-art`, asset, AUTHORED_TEXTURE);
            continue;
          }
          for (const facing of facings) {
            for (const blink of [false, true]) {
              this.load.svg(
                `slime-${typeId}-${facing}${blink ? "-blink" : ""}`,
                slimeDataUri(typeId, facing, { blink }),
                SLIME_TEXTURE,
              );
            }
          }
        }
      }

      create() {
        this.cameras.main
          .setBackgroundColor("#21130b")
          .setZoom(RENDER_SCALE)
          .centerOn(MAP_WIDTH * TILE_SIZE / 2, MAP_HEIGHT * TILE_SIZE / 2);
        // Phaser는 캔버스 밖 DOM 오버레이의 좌표도 입력으로 받으므로,
        // 실제 캔버스에서 시작한 포인터만 게임 명령으로 처리한다.
        const fromCanvas = (pointer: Phaser.Input.Pointer) =>
          pointer.event?.target === this.game.canvas;
        // 나무와 금속 중심의 판타지 식당 바닥과 벽.
        const planks = this.add.graphics().setDepth(0);
        KITCHEN_ROWS.forEach((row, rowIndex) => {
          [...row].forEach((tile, colIndex) => {
            const { x, y } = tileCenter({ col: colIndex, row: rowIndex });
            const left = x - TILE_SIZE / 2;
            const top = y - TILE_SIZE / 2;
            const wall = tile === "#";
            // 판자마다 결이 조금씩 다르게 보이도록 행마다 색을 흔든다.
            const shade = (rowIndex * 7 + colIndex * 13) % 3;
            planks.fillStyle(
              wall
                ? [0xa9713a, 0xb0773e, 0xa26c36][shade]
                : [0x402514, 0x452917, 0x3b2112][shade],
              1,
            );
            planks.fillRect(left, top, TILE_SIZE, TILE_SIZE);
            if (wall) {
              // 벽은 세로 널, 바닥은 가로 판자로 결을 반대로 준다.
              planks.fillStyle(0x7d4f26, 0.85);
              planks.fillRect(left + TILE_SIZE - 4, top, 4, TILE_SIZE);
              planks.fillStyle(0xffffff, 0.07);
              planks.fillRect(left + 3, top, 3, TILE_SIZE);
            } else {
              planks.fillStyle(0x2c180d, 0.9);
              planks.fillRect(left, top + TILE_SIZE - 3, TILE_SIZE, 3);
              if ((colIndex + rowIndex) % 2 === 0) {
                planks.fillRect(left, top, 2, TILE_SIZE);
              }
              planks.fillStyle(0xffffff, 0.03);
              planks.fillRect(left, top + 3, TILE_SIZE, 2);
            }
          });
        });
        // 네 주방 설비를 서로 다른 실루엣으로 그린다.
        this.stations = {} as Record<StationInstanceId, Phaser.GameObjects.Text>;
        for (const station of stationInstances) {
          const { id, type, displayTile } = station;
          const { x, y } = tileCenter(displayTile);
          const shape = this.add.graphics().setDepth(y);
          if (type === "ingredient-box") {
            shape
              .fillStyle(0x6d3f20, 1)
              .fillRect(x - 28, y - 28, 56, 56)
              .lineStyle(3, 0xc88a4c, 0.9)
              .strokeRect(x - 28, y - 28, 56, 56)
              .lineStyle(2, 0x3d2415, 0.8)
              .strokeLineShape(new Phaser.Geom.Line(x, y - 26, x, y + 26));
          } else if (type === "stove" || type === "table") {
            // 조리 도구는 불을 쓰지 않는다. 테이블 위에 도마를 올린 모습이다.
            shape
              .fillStyle(stationColors[type], 1)
              .fillRoundedRect(x - 29, y - 17, 58, 34, 6)
              .lineStyle(3, 0xc89258, 0.9)
              .strokeRoundedRect(x - 29, y - 17, 58, 34, 6)
              .fillStyle(0x563619, 1)
              .fillRect(x - 22, y + 14, 7, 12)
              .fillRect(x + 15, y + 14, 7, 12);
          } else if (type === "submission") {
            shape
              .fillStyle(stationColors[type], 1)
              .fillRoundedRect(x - 27, y - 22, 54, 45, 5)
              .lineStyle(2, 0xb9edbd, 0.75)
              .strokeRoundedRect(x - 27, y - 22, 54, 45, 5)
              .fillStyle(0x183b24, 1)
              .fillRect(x - 14, y - 8, 28, 4);
          } else if (type === "dish-rack") {
            shape
              .fillStyle(0x4b382a, 1)
              .fillRoundedRect(x - 27, y - 23, 54, 46, 5)
              .lineStyle(3, stationColors[type], 0.95)
              .strokeRoundedRect(x - 27, y - 23, 54, 46, 5)
              .lineStyle(2, 0xd9e8ff, 0.7)
              .strokeLineShape(new Phaser.Geom.Line(x - 20, y - 5, x + 20, y - 5))
              .strokeLineShape(new Phaser.Geom.Line(x - 20, y + 10, x + 20, y + 10));
          } else if (type === "washer") {
            shape
              .fillStyle(0x394b50, 1)
              .fillRoundedRect(x - 27, y - 18, 54, 42, 6)
              .fillStyle(0x77c9d8, 0.75)
              .fillEllipse(x, y - 14, 45, 18)
              .lineStyle(2, 0xcdf8ff, 0.8)
              .strokeEllipse(x, y - 14, 45, 18);
          } else {
            shape
              .fillStyle(stationColors[type], 1)
              .fillRect(x - 28, y - 28, 56, 56)
              .lineStyle(3, 0xbdb6c9, 0.65)
              .strokeRect(x - 28, y - 28, 56, 56)
              .fillStyle(0x2b2731, 1)
              .fillRect(x - 19, y - 18, 38, 9)
              .lineStyle(2, 0xbdb6c9, 0.55)
              .strokeLineShape(new Phaser.Geom.Line(x - 13, y - 8, x - 13, y + 16))
              .strokeLineShape(new Phaser.Geom.Line(x + 13, y - 8, x + 13, y + 16));
          }
          if (stationImages[type]) {
            const art = this.add.image(x, y - 10, `station-${type}`).setDepth(y + 1);
            art.setScale(STATION_ART_PX / Math.max(art.width, art.height));
          } else if (type !== "table") {
            this.add
              .text(x, y - 10, stationIcons[type], {
                fontSize: "20px",
                resolution: RENDER_SCALE,
              })
              .setOrigin(0.5)
              .setDepth(y + 1);
          }
          // 설비 이름은 상시 표시하지 않는다. 그림으로 알아보고, 자세한
          // 내용은 클릭했을 때 정보 패널에서 본다.
          // 재료 수와 조리 상태 표시.
          this.stations[id] = this.add
            .text(x, y - 30, "", {
              color: "#ffe9b8",
              fontFamily: "Jua, sans-serif",
              fontSize: "12px",
              align: "center",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setDepth(y + 2);
          this.add
            .zone(x, y, TILE_SIZE, TILE_SIZE)
            .setDepth(4)
            .setInteractive()
            .on(
              "pointerdown",
              (
                pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                inputEvent: Phaser.Types.Input.EventData,
              ) => {
                inputEvent.stopPropagation();
                if (!fromCanvas(pointer)) return;
                if (pointer.leftButtonDown()) {
                  setInspected({ kind: "station", id });
                  return;
                }
                if (!pointer.rightButtonDown()) return;
                metrics.current.buttonCommands += 1;
                setState((value) =>
                  value
                    ? interactActors(value, selectedActorsRef.current, id)
                    : value,
                );
              },
            );
        }

        this.slimes = {};
        const current = stateRef.current;
        for (const actorId of roster) {
          const actor = current?.actors[actorId];
          if (!actor) continue;
          const authored = Boolean(authoredSlimeAssets[actor.typeId]);
          const scale = authored ? AUTHORED_SLIME_SCALE : SLIME_SCALE;
          const art = this.add
            .image(0, 0, authored ? `slime-${actor.typeId}-art` : `slime-${actor.typeId}-down`)
            .setOrigin(0.5, authored ? 0.62 : 0.5);
          const faceLayer = authored ? this.add.graphics() : undefined;
          const visual = this.add.container(0, 0, faceLayer ? [art, faceLayer] : [art]);
          const container = this.add
            .container(actor.x, actor.y, [visual])
            .setDepth(actor.y)
            .setInteractive(
              new Phaser.Geom.Rectangle(-29, -23, 58, 45),
              Phaser.Geom.Rectangle.Contains,
            )
            .on(
              "pointerdown",
              (
                pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                inputEvent: Phaser.Types.Input.EventData,
              ) => {
                inputEvent.stopPropagation();
                if (!fromCanvas(pointer)) return;
                if (!pointer.leftButtonDown()) return;
                const additive =
                  pointer.event instanceof MouseEvent && pointer.event.shiftKey;
                setSelectedActors((selected) =>
                  additive
                    ? selected.includes(actorId)
                      ? selected.filter((id) => id !== actorId)
                      : [...selected, actorId]
                    : [actorId],
                );
              },
            );
          const carried = this.add
            .text(actor.x, actor.y - 52, "", { fontSize: "24px", resolution: RENDER_SCALE })
            .setOrigin(0.5)
            .setDepth(actor.y + 2);
          const selected = this.add
            .circle(actor.x, actor.y + 14, 30)
            .setStrokeStyle(3, typeColors[actor.typeId], 0.95)
            .setFillStyle(typeColors[actor.typeId], 0.12)
            .setDepth(actor.y - 1)
            .setVisible(false);
          this.slimes[actorId] = {
            typeId: actor.typeId,
            body: container,
            visual,
            art,
            faceLayer,
            carried,
            selected,
            facing: "down",
            last: { x: actor.x, y: actor.y },
            mode: "idle",
            blinking: false,
            scale,
            motion: this.breathe(visual, scale),
          };
          this.paintSlime(actorId);
          // 걷는 중에도 눈은 계속 깜빡이도록 몸 tween과 분리해 둔다.
          this.time.addEvent({
            delay: Phaser.Math.Between(3200, 5200),
            loop: true,
            callback: () => {
              const sprite = this.slimes[actorId];
              if (!sprite || sprite.facing === "up") return;
              sprite.blinking = true;
              this.paintSlime(actorId);
              this.time.delayedCall(140, () => {
                const open = this.slimes[actorId];
                if (!open) return;
                open.blinking = false;
                this.paintSlime(actorId);
              });
            },
          });
        }
        // 슬라임이 움직여 커서 밑에서 벗어나도 pointerout이 뜨도록 매 프레임
        // 히트 테스트를 갱신한다.
        this.input.setPollAlways();
        this.input.mouse?.disableContextMenu();
        const selectionBox = this.add
          .rectangle(0, 0, 0, 0, 0x9fdcff, 0.16)
          .setOrigin(0)
          .setStrokeStyle(1, 0xd9f4ff, 0.95)
          .setDepth(10_000)
          .setVisible(false);
        let dragStart: {
          world: Phaser.Math.Vector2;
          screenX: number;
          screenY: number;
          additive: boolean;
        } | null = null;
        // 커서가 브라우저 밖에서 놓이면 Phaser는 pointerup을 못 받는다.
        // 마지막 지점을 들고 있다가 window 이벤트로 마무리한다.
        let dragPoint: { x: number; y: number } | null = null;
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!fromCanvas(pointer)) return;
          if (pointer.leftButtonDown()) {
            dragPoint = null;
            dragStart = {
              world: this.cameras.main.getWorldPoint(pointer.x, pointer.y),
              screenX: pointer.x,
              screenY: pointer.y,
              additive:
                pointer.event instanceof MouseEvent && pointer.event.shiftKey,
            };
            return;
          }
          if (!pointer.rightButtonDown()) return;
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          if (!isWalkable(pixelToTile(point.x, point.y))) return;
          metrics.current.buttonCommands += 1;
          setState((value) =>
            value
              ? moveActors(value, selectedActorsRef.current, { x: point.x, y: point.y })
              : value,
          );
        });
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (!dragStart || !pointer.isDown) return;
          if (
            Math.hypot(pointer.x - dragStart.screenX, pointer.y - dragStart.screenY) <
            dishConfig.dragThresholdPx
          ) return;
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          dragPoint = { x: point.x, y: point.y };
          const left = Math.min(dragStart.world.x, point.x);
          const top = Math.min(dragStart.world.y, point.y);
          selectionBox
            .setPosition(left, top)
            .setSize(Math.abs(point.x - dragStart.world.x), Math.abs(point.y - dragStart.world.y))
            .setVisible(true);
        });
        // 캔버스 안에서 놓든 밖에서 놓든 같은 마무리를 탄다.
        const endDrag = (point: { x: number; y: number } | null) => {
          if (!dragStart) return;
          const start = dragStart;
          dragStart = null;
          selectionBox.setVisible(false);
          if (!point) {
            setSelectedActors([]);
            setInspected(null);
            return;
          }
          const left = Math.min(start.world.x, point.x);
          const right = Math.max(start.world.x, point.x);
          const top = Math.min(start.world.y, point.y);
          const bottom = Math.max(start.world.y, point.y);
          const inside = roster.filter((actorId) => {
            const actor = stateRef.current?.actors[actorId];
            return (
              actor &&
              actor.x >= left &&
              actor.x <= right &&
              actor.y >= top &&
              actor.y <= bottom
            );
          });
          setInspected(null);
          setSelectedActors((selected) =>
            start.additive ? [...new Set([...selected, ...inside])] : inside,
          );
        };
        this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          const dragged =
            dragStart &&
            Math.hypot(pointer.x - dragStart.screenX, pointer.y - dragStart.screenY) >=
              dishConfig.dragThresholdPx;
          endDrag(
            dragged ? this.cameras.main.getWorldPoint(pointer.x, pointer.y) : null,
          );
        });
        // 브라우저 밖에서 버튼을 놓거나 창이 포커스를 잃어도 네모를 정리한다.
        const finishOutside = () => endDrag(dragPoint);
        window.addEventListener("pointerup", finishOutside);
        window.addEventListener("blur", finishOutside);
        this.events.once("shutdown", () => {
          window.removeEventListener("pointerup", finishOutside);
          window.removeEventListener("blur", finishOutside);
        });

        view.current = {
          sync: (current) => {
            for (const actorId of roster) {
              const actor = current.actors[actorId];
              const sprite = this.slimes[actorId];
              if (!actor || !sprite) continue;
              const facing = facingFromDelta(
                actor.x - sprite.last.x,
                actor.y - sprite.last.y,
                sprite.facing,
              );
              if (facing !== sprite.facing) {
                sprite.facing = facing;
                this.paintSlime(actorId);
              }
              const mode: Motion =
                actor.status === "MOVING"
                  ? "walk"
                  : actor.status === "WORKING"
                    ? Object.values(current.workstations).some((workstation) => workstation?.workerId === actorId)
                      ? "stir"
                      : "pick"
                    : "idle";
              if (mode !== sprite.mode) {
                sprite.mode = mode;
                sprite.motion.stop();
                sprite.visual.setAngle(0).setY(0);
                sprite.motion = this.startMotion(sprite.visual, mode, sprite.scale);
              }
              sprite.last = { x: actor.x, y: actor.y };
              sprite.body.setPosition(actor.x, actor.y).setDepth(actor.y);
              sprite.selected
                .setPosition(actor.x, actor.y + 14)
                .setDepth(actor.y - 1)
                .setVisible(selectedActorsRef.current.includes(actorId));
              const alerting = Boolean(actor.alert);
              const icon = alerting
                ? alertIcons[actor.alert!]
                : actor.carrying.map(carriedIcon).join(" ");
              const hold = carryOffsets[sprite.facing];
              sprite.carried
                .setText(icon ?? "")
                .setPosition(
                  actor.x + (alerting ? 0 : hold.x),
                  actor.y + (alerting ? -52 : hold.y),
                )
                // 등을 돌렸을 때만 몸보다 뒤에 그린다. 선택 링(-1)보다는 앞이다.
                .setDepth(actor.y + (!alerting && hold.behind ? -0.5 : 2));
            }
            for (const { id, type } of stationInstances) {
              const fire = current.fires[id];
              const label = fire?.onFire
                ? // 불이 난 설비는 진화 진행도를 대신 보여 준다. 총 시간은
                  // 붙은 슬라임의 작업 속도에 따라 달라져 화재 상태에 들어 있다.
                  `🔥 ${fire.extinguishTotalMs ? Math.round((fire.extinguishMs / fire.extinguishTotalMs) * 100) : 0}%`
                : type === "ingredient-box"
                  ? `${current.ingredients[id]!.stock}/${INGREDIENT_MAX}`
                  : type === "stove"
                    ? current.workstations[id]!.status === "WORKING"
                      ? `${workStatusLabels.WORKING} ${Math.round((current.workstations[id]!.progressMs / current.workstations[id]!.totalMs) * 100)}%`
                      : workStatusLabels[current.workstations[id]!.status]
                    : type === "dish-rack"
                      ? `${current.dishRacks[id]!.length}/${dishConfig.rackCapacity}`
                      : type === "washer"
                        ? current.washers[id]!.workerId
                          ? `세척 ${Math.round((current.washers[id]!.progressMs / current.washers[id]!.totalMs) * 100)}%`
                          : current.washers[id]!.dish
                            ? current.washers[id]!.dish!.status === "clean" ? "세척 완료" : "세척 대기"
                            : "비어 있음"
                        : type === "table"
                          ? current.tables[id]![0] ? carriedLabel(current.tables[id]![0]) : ""
                          : type === "trash"
                            ? current.incinerators[id]!.workerId
                              ? `소각 ${Math.round((current.incinerators[id]!.progressMs / current.incinerators[id]!.totalMs) * 100)}%`
                              : `${current.incinerators[id]!.count}/${incineratorConfig.capacity}`
                          : "";
              this.stations[id].setText(label);
            }
          },
          pause: () => this.scene.pause(),
          resume: () => this.scene.resume(),
        };
        if (stateRef.current) view.current.sync(stateRef.current);
      }
    }

    // 맵 좌표계보다 화면에서는 크게 늘어나므로 캔버스
    // 내부 해상도를 RENDER_SCALE배로 잡고 카메라를 같은 배율로 당겨
    // 같은 영역을 더 촘촘한 픽셀로 그린다.
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-canvas",
      width: MAP_WIDTH * TILE_SIZE * RENDER_SCALE,
      height: MAP_HEIGHT * TILE_SIZE * RENDER_SCALE,
      backgroundColor: "#21130b",
      scene: Restaurant,
      render: { antialias: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    });
    return () => {
      view.current = null;
      game.destroy(true);
    };
  }, [squad]);

  // 선택 화면이 없으므로 들어오자마자 네 마리로 판을 연다.
  useEffect(() => {
    startRound(allTypeIds);
  }, []);

  function startRound(list: SlimeTypeId[]) {
    const next = initialState(2026, list);
    metrics.current = emptyMetrics();
    savedRef.current = false;
    roundSeed.current = next.seed;
    setSaved("");
    setSelectedActors([]);
    setInspected(null);
    setHelpStation(null);
    setStageInfoOpen(true);
    setRecruitOpen(false);
    setSettingsOpen(false);
    setResumeCount(null);
    setState(next);
    setSquad(list);
  }

  const selectElement = useCallback((element: SlimeTypeId) => {
    if (!squad) return;
    const ids = squadActorIds(squad).filter(
      (actorId) => stateRef.current?.actors[actorId]?.typeId === element,
    );
    setSelectedActors(ids);
  }, [squad]);

  const selectEveryone = useCallback(() => {
    if (!squad) return;
    const ids = squadActorIds(squad);
    setSelectedActors(ids);
  }, [squad]);

  // 속성 키와 전체 선택 키.
  useEffect(() => {
    if (!squad) return;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName);
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return;
      if (event.code === "Escape" && helpStation) {
        event.preventDefault();
        setHelpStation(null);
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        setSettingsOpen((open) => {
          const next = !open;
          setResumeCount(next || stageInfoOpen || helpStation !== null ? null : 3);
          return next;
        });
        return;
      }
      if (stageInfoOpen || recruitOpen || settingsOpen) return;
      const elementByKey = {
        KeyQ: "water",
        KeyW: "fire",
        KeyE: "lightning",
        KeyR: "earth",
      } as const;
      const element = elementByKey[event.code as keyof typeof elementByKey];
      if (element) {
        // 속성 키 하나가 그 속성의 모든 마리를 고른다.
        selectElement(element);
        return;
      }
      if (event.code !== "Space") return;
      event.preventDefault();
      selectEveryone();
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
    // 핸들러는 ref만 보므로 squad가 바뀔 때만 다시 건다.
  }, [helpStation, recruitOpen, selectElement, selectEveryone, settingsOpen, squad, stageInfoOpen]);

  // 첫 판은 네 속성을 모두 데리고 시작한다. 고르는 화면은 두지 않는다.
  if (!squad || !state) {
    return (
      <main className="select-shell">
        <Music src="/music/main.mp3" />
        <p className="loading">영업 준비 중…</p>
      </main>
    );
  }

  const result =
    state.phase === "lost"
      ? "영업 종료. 주문을 다 채우지 못했습니다."
      : isLastStage(state)
        ? "모든 스테이지를 클리어했습니다!"
        : `${currentStage(state).id} 클리어!`;
  const selectedElements = new Set(
    selectedActors.flatMap((actorId) => {
      const typeId = state.actors[actorId]?.typeId;
      return typeId ? [typeId] : [];
    }),
  );

  return (
    <main className="stage">
      <Music src={gameMusicSource(state.timeLeft, state.phase)} />
      {!stageInfoOpen && !recruitOpen && (
        <GameSoundEffects state={state} selectedActors={selectedActors} />
      )}
      <div className="stage-frame" data-inspector={inspected ? "" : undefined}>
        <div id="game-canvas" aria-label="탑다운 판타지 식당 게임 맵" />
        <MusicSettings
          variant="game"
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            setResumeCount(open || stageInfoOpen || recruitOpen || helpStation !== null ? null : 3);
          }}
        />
        {resumeCount !== null && (
          <div className="resume-countdown" role="status" aria-live="assertive">
            <strong key={resumeCount}>{resumeCount}</strong>
          </div>
        )}

        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="stage-banner"
            key={banner}
            src={bannerImages[banner]}
            alt={banner === "start" ? "영업 시작" : "마감 임박"}
          />
        )}

        <OrderCards state={state} />

        <div className="hud-top" aria-label="라운드 정보">
          <span className="hud-chip">
            🍽 {currentStage(state).id} {currentStage(state).name}
          </span>
          <span className="hud-chip" data-warn={state.timeLeft <= 30 ? "" : undefined}>
            ⏱ {state.timeLeft}
          </span>
          <span className="hud-chip hud-goal">
            📦 {state.filled} / {state.goal}
          </span>
          <span className="hud-chip">💰 {state.gold}G</span>
        </div>

        <div className="hud-bottom">
          <div className="control-keys" aria-label="슬라임 선택키">
            {([
              ["Q", "water"],
              ["W", "fire"],
              ["E", "lightning"],
              ["R", "earth"],
            ] as const).map(([key, typeId]) => (
              <button
                type="button"
                key={key}
                data-type={typeId}
                aria-label={`${key}: ${slimeTypes[typeId].name} 슬라임 선택`}
                aria-pressed={selectedElements.has(typeId)}
                onClick={() => selectElement(typeId)}
              >
                <b>{key}</b>
                <small>{slimeTypes[typeId].name}</small>
              </button>
            ))}
            <button
              type="button"
              className="control-key-space"
              aria-label="Space: 모든 슬라임 선택"
              aria-pressed={selectedActors.length === squadActorIds(squad).length}
              onClick={selectEveryone}
            >
              <b>Space</b>
              <small>전체</small>
            </button>
          </div>

          <div className="hud-right">
            <div className="feed">
              <span className="feed-event">{state.lastEvent}</span>
            </div>
          </div>
        </div>

        <div className="info-rail" role="complementary" aria-label="선택 정보 영역">
          {inspected && (
            <GameInspector
              state={state}
              target={inspected}
              onClose={() => setInspected(null)}
              onHelp={setHelpStation}
            />
          )}
        </div>

        {helpStation && (
          <StationHelp id={helpStation} onClose={() => setHelpStation(null)} />
        )}

        {stageInfoOpen && (
          <StageInfoScreen
            key={currentStage(state).id}
            stage={currentStage(state)}
            onNext={(step) => {
              setStageInfoOpen(false);
              if (step === "RECRUIT") setRecruitOpen(true);
            }}
          />
        )}

      </div>

      {recruitOpen && (
        <RecruitScreen
          picked={picked}
          onPick={setPicked}
          onConfirm={() => {
            const recruited = recruitSlime(state, picked);
            setState(recruited);
            setSquad(recruited.squad);
            setRecruitOpen(false);
          }}
        />
      )}

      {state.phase !== "playing" && (
        <section
          className="result-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="result-title-art"
              src={state.phase === "lost" ? "/text/game-over-title.png" : "/text/business-end-title.png"}
              alt={state.phase === "lost" ? "게임 오버" : "영업 종료"}
            />
            <h2 id="result-title">{result}</h2>
            {/* 정산: 주문 성공은 골드로, 실수는 횟수만 보여 준다. */}
            <dl className="settle">
              <div>
                <dt>주문 성공 횟수</dt>
                <dd>
                  {state.filled}번 × {GOLD_PER_ORDER}G
                </dd>
                <dd>{state.filled * GOLD_PER_ORDER}G</dd>
              </div>
              <div>
                <dt>주문 실수 횟수</dt>
                <dd>{state.misses}번</dd>
                <dd aria-hidden>—</dd>
              </div>
              <div className="settle-total">
                <dt>합계</dt>
                <dd />
                <dd>{state.gold}G</dd>
              </div>
            </dl>
            <p className="mic-state">{saved}</p>
            <div className="result-actions">
              {state.phase === "won" && !isLastStage(state) ? (
                <button
                  autoFocus
                  onClick={() => {
                    savedRef.current = false;
                    setSaved("");
                    setSelectedActors([]);
                    setState(nextStage(state));
                    setStageInfoOpen(true);
                  }}
                >
                  다음 스테이지
                </button>
              ) : (
                <button autoFocus onClick={() => startRound(squad)}>
                  1-1부터
                </button>
              )}
              <button onClick={() => window.location.assign("/")}>타이틀로</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
