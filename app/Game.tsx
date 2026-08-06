"use client";

import * as Phaser from "phaser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  KITCHEN_ROWS,
  initialState,
  interactActor,
  moveActor,
  moveTargets,
  endTurn,
  pixelToTile,
  slimeTypes,
  tileCenter,
  actionCost,
  maxActionPoints,
  stageRank,
  upcomingOrders,
  RUSH_TURNS_LEFT,
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
  GOLD_PER_ORDER,
  dishConfig,
  incineratorConfig,
  isBoxStation,
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
// 행동 한 번은 즉시 끝나므로 모션도 잠깐만 재생하고 숨쉬기로 돌아간다.
const MOTION_MS = 320;
const workStatusLabels = {
  IDLE: "대기",
  MISSING_MATERIAL: "식재료 부족",
  WORKING: "조리 중",
  COMPLETE: "요리 완성",
} as const;
// 기구마다 그려 넣을 그림. 원본은 raw/에셋에 있고 public으로 줄여 넣었다.
const stationArt: Record<StationId, string> = {
  "potato-box": "/stations/ingredient-box.png",
  "carrot-box": "/stations/ingredient-box.png",
  "cabbage-box": "/stations/ingredient-box.png",
  stove: "/food/doma.png",
  fryer: "/stations/fryer.png",
  blender: "/stations/blender.png",
  submission: "/stations/submission.png",
  trash: "/stations/trash.png",
  "dish-rack": "/stations/dish-rack.png",
  washer: "/stations/washer.png",
  table: "/stations/table.png",
};
// 재료 상자는 같은 상자 그림을 쓰고 안에 든 재료만 얹어 구분한다.
const boxItemArt: Partial<Record<StationId, string>> = {
  "potato-box": "/food/gamja.png",
  "carrot-box": "/food/carrot.png",
  "cabbage-box": "/food/cabbage.png",
};
// 판이 시작할 때와 마감이 다가올 때 잠깐 띄우는 큰 문구.
const bannerImages = {
  start: "/text/business-start-title.png",
  closing: "/text/closing-soon-title.png",
} as const;
const BANNER_MS = 1600;
// 주문 카드에 빈 접시 위로 얹어 그리는 완성 음식.
const foodImages: Partial<Record<ItemId, string>> = {
  "roasted-potato": "/food/roasted-potato.png",
  "chopped-carrot": "/food/carrot.png",
  "chopped-cabbage": "/food/cabbage.png",
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
  "potato-box": {
    description: ["턴이 끝날 때마다 감자가 한 개 찹니다.", "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)"],
    required: [],
    steps: ["🥔 감자 받기"],
  },
  "carrot-box": {
    description: ["턴이 끝날 때마다 당근이 한 개 찹니다.", "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)"],
    required: [],
    steps: ["🥕 당근 받기"],
  },
  "cabbage-box": {
    description: ["턴이 끝날 때마다 양배추가 한 개 찹니다.", "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)"],
    required: [],
    steps: ["🥬 양배추 받기"],
  },
  fryer: {
    description: ["아직 튀김 레시피가 없습니다.", "맵에 놓을 수만 있습니다."],
    required: [],
    steps: ["🍟 준비 중"],
  },
  blender: {
    description: ["아직 믹서기 레시피가 없습니다.", "맵에 놓을 수만 있습니다."],
    required: [],
    steps: ["🥤 준비 중"],
  },
  stove: {
    description: ["땅 슬라임만 감자를 썰 수 있습니다. (행동력 2)", "재료를 올리고 꺼내는 것은 누구나 합니다."],
    required: ["earth"],
    steps: ["🥔 감자", "🔪 땅 슬라임이 썰기", "🍽️ 그릇"],
  },
  submission: {
    description: ["주문 음식이 담긴 그릇을 제출합니다. (행동력 1)", "제출한 그릇은 더러워집니다."],
    required: [],
    steps: ["🍲 음식", "📬 제출"],
  },
  trash: {
    description: ["쓰레기를 최대 5개까지 보관합니다. (버리기 행동력 1)", "불 슬라임이 소각해 비웁니다. (행동력 2)"],
    required: ["fire"],
    steps: ["🗑️ 쓰레기 투입", "🔥 소각"],
  },
  "dish-rack": {
    description: ["깨끗한 그릇을 꺼내는 곳입니다. (행동력 1)", "생성대에는 그릇이 최대 3개 있습니다."],
    required: [],
    steps: ["🍽️ 그릇 받기"],
  },
  washer: {
    description: ["더러운 그릇을 맡깁니다. (행동력 1)", "물 슬라임만 세척할 수 있습니다. (행동력 2)"],
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

// 남은 행동력을 칸으로 보여 준다. 턴제에서 슬라임을 가르는 유일한 수치다.
function ActionPoints({ actor }: { actor: { typeId: SlimeTypeId; actionPoints: number } }) {
  const max = maxActionPoints(actor.typeId);
  return (
    <ul className="slime-stats">
      <li>
        <span aria-hidden>⚡</span>
        <span>행동력</span>
        <span
          className="stat-gauge"
          role="img"
          aria-label={`남은 행동력 ${actor.actionPoints} / ${max}`}
        >
          {Array.from({ length: max }, (_, cell) => (
            <i key={cell} data-on={cell < actor.actionPoints ? "" : undefined} />
          ))}
        </span>
      </li>
    </ul>
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
  const upcoming = upcomingOrders(state);
  return (
    <section className="order-cards" aria-label="진행 중인 주문">
      {[0, 1].map((index) => {
        const order = orders[index];
        if (!order) return <span className="order-card order-card-empty" aria-hidden key={index} />;
        const recipe = recipes[order.foodId as keyof typeof recipes];
        return (
          <article className="order-card" key={order.id}>
            <header>
              <b>주문 {index + 1}</b>
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
      {/* 다음에 들어올 레시피는 현재 주문 오른쪽 위에 작게 붙인다. */}
      <aside className="order-next" aria-label="다음 레시피">
        <b>다음</b>
        {upcoming.length ? (
          upcoming.map((order) => (
            <span key={order.id} title={itemLabel(order.foodId)}>
              {itemIcons[order.foodId]}
            </span>
          ))
        ) : (
          <span className="order-next-empty">—</span>
        )}
      </aside>
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
        <ActionPoints actor={actor} />
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
      <small className="inspector-hint">옆 칸에 선 슬라임을 고르고 설비를 클릭하면 사용합니다.</small>
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
          <p><b>조작:</b> 설비 옆 칸의 슬라임을 고르고 설비 타일을 클릭</p>
        </section>
        <button type="button" onClick={onClose}>확인</button>
      </div>
    </section>
  );
}

export default function Game() {
  const [squad, setSquad] = useState<SlimeTypeId[] | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  // 턴제는 한 마리씩 조작한다. 선택은 늘 0마리 아니면 1마리다.
  const [selectedActor, setSelectedActor] = useState<ActorId | null>(null);
  const [inspected, setInspected] = useState<InspectorTarget | null>(null);
  const [helpStation, setHelpStation] = useState<StationId | null>(null);
  const [stageInfoOpen, setStageInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [banner, setBanner] = useState<keyof typeof bannerImages | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const paused = stageInfoOpen || settingsOpen || helpStation !== null || resumeCount !== null;

  const [saved, setSaved] = useState("");
  const stateRef = useRef(state);
  const selectedActorRef = useRef(selectedActor);
  const view = useRef<View | null>(null);
  const metrics = useRef<Metrics>(emptyMetrics());
  const savedRef = useRef(false);
  const roundSeed = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    selectedActorRef.current = selectedActor;
  }, [selectedActor]);

  useEffect(() => {
    setInspected((current) => selectedActor
      ? { kind: "actor", id: selectedActor }
      : current?.kind === "actor" ? null : current);
  }, [selectedActor]);

  // 판이 시작되면 "영업 시작", 남은 턴이 얼마 없으면 "마감 임박"을 한 번씩 띄운다.
  const startedStageId =
    state?.phase === "playing" && !stageInfoOpen ? currentStage(state).id : null;
  const closingSoon = state?.phase === "playing" && state.turnsLeft <= RUSH_TURNS_LEFT;
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

  // 유효하지 않은 상호작용은 행동력을 쓰지 않고 이유만 토스트로 알린다.
  const refusalSeq = state?.refusal?.seq ?? 0;
  useEffect(() => {
    const message = stateRef.current?.refusal?.message;
    // 성공한 행동은 refusal을 지운다. 그때 바로 닫지 않으면 이 effect의
    // 정리가 아래 타이머를 취소해 토스트가 그대로 남는다.
    if (!refusalSeq || !message) {
      setToast(null);
      return;
    }
    setToast(message);
    const timer = setTimeout(() => setToast(null), 2_200);
    return () => clearTimeout(timer);
  }, [refusalSeq]);

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
  }, [state, selectedActor]);

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
        // 턴제라 벽시계 시간이 없다. 소모한 턴 수를 그대로 보낸다.
        elapsedMs: currentStage(state).turnLimit - state.turnsLeft,
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
            acts: number;
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
        for (const url of new Set([
          ...Object.values(stationArt),
          ...Object.values(boxItemArt),
        ])) {
          this.load.image(url, url);
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
        // 기구는 차지한 칸 범위에 나무 상판을 깔고 그림을 얹는다.
        this.stations = {} as Record<StationInstanceId, Phaser.GameObjects.Text>;
        for (const station of stationInstances) {
          const { id, type, tiles } = station;
          const first = tileCenter(tiles[0]);
          const last = tileCenter(tiles[tiles.length - 1]);
          const x = (first.x + last.x) / 2;
          const y = (first.y + last.y) / 2;
          const width = Math.abs(last.x - first.x) + TILE_SIZE;
          const height = Math.abs(last.y - first.y) + TILE_SIZE;
          this.add
            .graphics()
            .setDepth(y - 1)
            .fillStyle(0x6d4526, 1)
            .fillRoundedRect(x - width / 2 + 3, y - height / 2 + 3, width - 6, height - 6, 7)
            .lineStyle(3, 0xc89258, 0.9)
            .strokeRoundedRect(x - width / 2 + 3, y - height / 2 + 3, width - 6, height - 6, 7);
          const art = this.add.image(x, y, stationArt[type]).setDepth(y + 1);
          art.setScale(
            Math.min((width - 12) / art.width, (height - 12) / art.height),
          );
          const itemArt = boxItemArt[type];
          if (itemArt) {
            // 상자 그림 가운데 흰 원 자리에 재료를 얹는다.
            const badge = this.add.image(x, y + 2, itemArt).setDepth(y + 2);
            badge.setScale(26 / Math.max(badge.width, badge.height));
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
                if (!pointer.leftButtonDown()) return;
                // 설비 클릭은 정보를 열고, 고른 슬라임이 있으면 사용까지 한다.
                setInspected({ kind: "station", id });
                const actorId = selectedActorRef.current;
                if (!actorId) return;
                metrics.current.buttonCommands += 1;
                setState((value) =>
                  value ? interactActor(value, actorId, id) : value,
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
          const spot = tileCenter(actor);
          const container = this.add
            .container(spot.x, spot.y, [visual])
            .setDepth(spot.y)
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
                setSelectedActor((selected) =>
                  selected === actorId ? null : actorId,
                );
              },
            );
          const carried = this.add
            .text(spot.x, spot.y - 52, "", { fontSize: "24px", resolution: RENDER_SCALE })
            .setOrigin(0.5)
            .setDepth(spot.y + 2);
          const selected = this.add
            .circle(spot.x, spot.y + 14, 30)
            .setStrokeStyle(3, typeColors[actor.typeId], 0.95)
            .setFillStyle(typeColors[actor.typeId], 0.12)
            .setDepth(spot.y - 1)
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
            last: { x: spot.x, y: spot.y },
            acts: actor.acts,
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
        // 바닥을 클릭했을 때. 이동 가능 표시가 뜬 칸이면 그리로 한 칸
        // 가고, 아니면 선택을 푼다.
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!fromCanvas(pointer) || !pointer.leftButtonDown()) return;
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          const tile = pixelToTile(point.x, point.y);
          const current = stateRef.current;
          const actorId = selectedActorRef.current;
          if (
            current &&
            actorId &&
            moveTargets(current, actorId).some(
              (target) => target.col === tile.col && target.row === tile.row,
            )
          ) {
            metrics.current.buttonCommands += 1;
            setState((value) => (value ? moveActor(value, actorId, tile) : value));
            return;
          }
          setSelectedActor(null);
          setInspected(null);
        });

        // 선택한 슬라임이 갈 수 있는 칸 표시. 클릭 판정은 바닥 핸들러가 한다.
        const moveMarks = this.add.graphics().setDepth(3);

        view.current = {
          sync: (current) => {
            for (const actorId of roster) {
              const actor = current.actors[actorId];
              const sprite = this.slimes[actorId];
              if (!actor || !sprite) continue;
              const spot = tileCenter(actor);
              const facing = facingFromDelta(
                spot.x - sprite.last.x,
                spot.y - sprite.last.y,
                sprite.facing,
              );
              if (facing !== sprite.facing) {
                sprite.facing = facing;
                this.paintSlime(actorId);
              }
              // 행동은 즉시 끝나므로 한 번 행동할 때마다 모션을 잠깐 재생하고
              // 숨쉬기로 돌아간다. acts가 늘어난 것이 행동했다는 신호다.
              if (actor.acts !== sprite.acts) {
                sprite.acts = actor.acts;
                const mode: Motion =
                  actor.status === "MOVING"
                    ? "walk"
                    : actor.status === "WORKING"
                      ? "stir"
                      : "pick";
                sprite.motion.stop();
                sprite.visual.setAngle(0).setY(0);
                sprite.motion = this.startMotion(sprite.visual, mode, sprite.scale);
                this.time.delayedCall(MOTION_MS, () => {
                  const back = this.slimes[actorId];
                  if (!back || back.acts !== actor.acts) return;
                  back.motion.stop();
                  back.visual.setAngle(0).setY(0);
                  back.motion = this.breathe(back.visual, back.scale);
                });
              }
              sprite.last = { x: spot.x, y: spot.y };
              sprite.body.setPosition(spot.x, spot.y).setDepth(spot.y);
              sprite.selected
                .setPosition(spot.x, spot.y + 14)
                .setDepth(spot.y - 1)
                .setVisible(selectedActorRef.current === actorId);
              const hold = carryOffsets[sprite.facing];
              sprite.carried
                .setText(actor.carrying.map(carriedIcon).join(" ") ?? "")
                .setPosition(spot.x + hold.x, spot.y + hold.y)
                // 등을 돌렸을 때만 몸보다 뒤에 그린다. 선택 링(-1)보다는 앞이다.
                .setDepth(spot.y + (hold.behind ? -0.5 : 2));
            }
            moveMarks.clear();
            const selected = selectedActorRef.current;
            if (selected) {
              for (const tile of moveTargets(current, selected)) {
                const { x, y } = tileCenter(tile);
                moveMarks
                  .fillStyle(0xffe9b8, 0.22)
                  .fillRect(x - 24, y - 24, 48, 48)
                  .lineStyle(2, 0xffe9b8, 0.85)
                  .strokeRect(x - 24, y - 24, 48, 48);
              }
            }
            for (const { id, type } of stationInstances) {
              const washer = current.washers[id];
              const incinerator = current.incinerators[id];
              const workstation = current.workstations[id];
              const label = current.fires[id]?.onFire
                ? "🔥"
                : isBoxStation(type)
                  ? `${current.ingredients[id]!.stock}/${INGREDIENT_MAX}`
                  : type === "stove"
                    ? workstation!.progress > 0
                      ? `${workStatusLabels.WORKING} ${workstation!.progress}/${actionCost.chop}`
                      : workStatusLabels[workstation!.status]
                    : type === "dish-rack"
                      ? `${current.dishRacks[id]!.length}/${dishConfig.rackCapacity}`
                      : type === "washer"
                        ? washer!.progress > 0
                          ? `세척 ${washer!.progress}/${actionCost.wash}`
                          : washer!.dish
                            ? washer!.dish!.status === "clean" ? "세척 완료" : "세척 대기"
                            : "비어 있음"
                        : type === "table"
                          ? current.tables[id]![0] ? carriedLabel(current.tables[id]![0]) : ""
                          : type === "trash"
                            ? incinerator!.progress > 0
                              ? `소각 ${incinerator!.progress}/${actionCost.burn}`
                              : `${incinerator!.count}/${incineratorConfig.capacity}`
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
    setSelectedActor(null);
    setInspected(null);
    setHelpStation(null);
    setStageInfoOpen(true);
    setSettingsOpen(false);
    setResumeCount(null);
    setState(next);
    setSquad(list);
  }

  const finishTurn = useCallback(() => {
    setSelectedActor(null);
    setState((value) => (value ? endTurn(value) : value));
  }, []);

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
      }
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [helpStation, settingsOpen, squad, stageInfoOpen]);

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
  const roster = squadActorIds(squad);
  // 아직 행동력이 남은 슬라임. 턴 종료 버튼이 이걸 알려 준다.
  const readyCount = roster.filter(
    (actorId) => (state.actors[actorId]?.actionPoints ?? 0) > 0,
  ).length;
  const rank = state.phase === "won" ? stageRank(state) : 0;

  return (
    <main className="stage">
      <Music src={gameMusicSource(state.turnsLeft, state.phase)} />
      {!stageInfoOpen && (
        <GameSoundEffects
          state={state}
          selectedActors={selectedActor ? [selectedActor] : []}
        />
      )}
      <div className="stage-frame" data-inspector={inspected ? "" : undefined}>
        <div id="game-canvas" aria-label="탑다운 판타지 식당 게임 맵" />
        <MusicSettings
          variant="game"
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            setResumeCount(open || stageInfoOpen || helpStation !== null ? null : 3);
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
          <span
            className="hud-chip"
            data-warn={state.turnsLeft <= RUSH_TURNS_LEFT ? "" : undefined}
          >
            🔄 {state.turnsLeft}턴
          </span>
          <span className="hud-chip hud-goal">
            📦 {state.filled} / {state.goal}
          </span>
          <span className="hud-chip">💰 {state.gold}G</span>
        </div>

        {toast && (
          <p className="action-toast" role="status" aria-live="polite">
            {toast}
          </p>
        )}

        <div className="hud-bottom">
          <div className="turn-bar" aria-label="슬라임 행동력">
            {roster.map((actorId) => {
              const actor = state.actors[actorId];
              if (!actor) return null;
              return (
                <button
                  type="button"
                  key={actorId}
                  data-type={actor.typeId}
                  data-spent={actor.actionPoints === 0 ? "" : undefined}
                  aria-label={`${actor.name} 선택, 남은 행동력 ${actor.actionPoints}`}
                  aria-pressed={selectedActor === actorId}
                  onClick={() =>
                    setSelectedActor((current) => (current === actorId ? null : actorId))
                  }
                >
                  <b>{slimeTypes[actor.typeId].name}</b>
                  <small>
                    ⚡{actor.actionPoints}/{maxActionPoints(actor.typeId)}
                  </small>
                </button>
              );
            })}
            <button
              type="button"
              className="turn-end"
              onClick={finishTurn}
              aria-label={`턴 종료, 행동력이 남은 슬라임 ${readyCount}마리`}
            >
              <b>턴 종료</b>
              <small>{readyCount ? `${readyCount}마리 대기` : "모두 사용"}</small>
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
            onNext={() => setStageInfoOpen(false)}
          />
        )}

      </div>

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
            {rank > 0 && (
              <p className="stage-rank" aria-label={`스테이지 랭크 별 ${rank}개`}>
                {"★".repeat(rank)}
                <span aria-hidden>{"☆".repeat(3 - rank)}</span>
              </p>
            )}
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
                    setSelectedActor(null);
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
