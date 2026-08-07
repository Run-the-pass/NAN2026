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
  nextReadyActor,
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
  defaultStages,
  stageIndexOf,
  GOLD_PER_ORDER,
  dishConfig,
  incineratorConfig,
  isBoxStation,
  boxItems,
  carriedLabel,
  isDish,
  blenderStage,
  type BlenderStage,
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
import { itemIcons, stationIcons } from "./stage-info";
import StageSelect from "./StageSelect";
import { readProgress, withResult, writeProgress, type StageProgress } from "./progress";

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
  "banana-box": "/stations/ingredient-box.png",
  "strawberry-box": "/stations/ingredient-box.png",
  "mushroom-box": "/stations/ingredient-box.png",
  stove: "/food/doma.png",
  oven: "/stations/oven.png",
  fryer: "/stations/fryer.png",
  blender: "/stations/blender.png",
  submission: "/stations/submission.png",
  trash: "/stations/trash.png",
  "dish-rack": "/stations/ingredient-box.png",
  "dish-return": "/stations/dish-return.png",
  washer: "/stations/washer.png",
  table: "/stations/table.png",
};
// 상자류는 같은 상자 그림을 쓰고 안에 든 것만 얹어 구분한다. 그릇 상자도
// 접시 한 장만 덩그러니 두지 않고 같은 상자에 접시를 얹는다.
const stationBadgeArt: Partial<Record<StationId, string>> = {
  "dish-rack": "/food/plate.png",
  "potato-box": "/food/gamja.png",
  "carrot-box": "/food/carrot.png",
  "cabbage-box": "/food/cabbage.png",
  "banana-box": "/food/banana.png",
  "strawberry-box": "/food/strawberry.png",
  "mushroom-box": "/food/mushroom.png",
};

// 믹서기 단계별 그림. 과일만 넣은 상태는 물이 필요하다는 뜻이라
// 화면에서 물 아이콘도 함께 띄운다.
const blenderArt: Record<BlenderStage, string> = {
  empty: "/stations/blender.png",
  "needs-water": "/stations/blender-fruit.png",
  ready: "/stations/blender-ready.png",
  done: "/stations/blender-full.png",
};

// 도마·믹서기는 조리대 위에 놓인 물건이다. 아래에 테이블을 깔고 그림을
// 위로 올려 얹힌 것처럼 보이게 한다. 칸을 넘어가도 되고, 앞뒤 순서는
// 슬라임과 같은 y 정렬 규칙을 따른다.
const stationArtStyle: Partial<
  Record<StationId, { onTable?: boolean; lift?: number; grow?: number }>
> = {
  stove: { onTable: true, lift: 16, grow: 0.92 },
  blender: { onTable: true, lift: 26, grow: 1.35 },
};
// 판이 시작할 때와 마감이 다가올 때 잠깐 띄우는 큰 문구.
const bannerImages = {
  start: "/text/business-start-title.png",
  closing: "/text/closing-soon-title.png",
} as const;
const BANNER_MS = 1600;
// 주문 카드에 빈 접시 위로 얹어 그리는 완성 음식.
const foodImages: Partial<Record<ItemId, string>> = {
  potato: "/food/gamja.png",
  "shredded-potato": "/food/shredded-potato.png",
  carrot: "/food/carrot.png",
  "shredded-carrot": "/food/shredded-carrot.png",
  cabbage: "/food/cabbage.png",
  "shredded-cabbage": "/food/shredded-cabbage.png",
  banana: "/food/banana.png",
  strawberry: "/food/strawberry.png",
  mushroom: "/food/mushroom.png",
  "banana-smoothie": "/food/banana-smoothie.png",
  "strawberry-smoothie": "/food/strawberry-smoothie.png",
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
  "banana-box": {
    description: ["바나나를 꺼냅니다. (행동력 1)", "빈손이나 깨끗한 그릇으로 꺼냅니다."],
    required: [],
    steps: ["🍌 바나나 받기"],
  },
  "strawberry-box": {
    description: ["딸기를 꺼냅니다. (행동력 1)", "빈손이나 깨끗한 그릇으로 꺼냅니다."],
    required: [],
    steps: ["🍓 딸기 받기"],
  },
  "mushroom-box": {
    description: ["버섯을 꺼냅니다. (행동력 1)", "빈손이나 깨끗한 그릇으로 꺼냅니다."],
    required: [],
    steps: ["🍄 버섯 받기"],
  },
  oven: {
    description: ["아직 화로 레시피가 없습니다.", "맵에 놓을 수만 있습니다."],
    required: [],
    steps: ["🔥 준비 중"],
  },
  "dish-return": {
    description: ["제출한 그릇이 한 턴 뒤 더러운 채로 나옵니다.", "집어서 세척대로 옮깁니다. (행동력 1)"],
    required: [],
    steps: ["🍴 그릇 회수", "🫧 세척대로"],
  },
  fryer: {
    description: ["아직 튀김 레시피가 없습니다.", "맵에 놓을 수만 있습니다."],
    required: [],
    steps: ["🍟 준비 중"],
  },
  blender: {
    description: [
      "과일 → 물 → 가동 순서로 스무디를 만듭니다.",
      "넣은 과일은 뺄 수 없고, 물을 먼저 채울 수도 없습니다.",
    ],
    required: ["water", "lightning"],
    steps: ["🍌 과일 넣기", "💧 물 슬라임이 물", "⚡ 번개 슬라임이 가동"],
  },
  stove: {
    description: ["땅 슬라임만 재료를 썰 수 있습니다. (행동력 1)", "재료를 올리고 꺼내는 것은 누구나 합니다."],
    required: ["earth"],
    steps: ["🥔 감자", "🔪 땅 슬라임이 썰기", "🍽️ 그릇"],
  },
  submission: {
    description: ["주문 음식이 담긴 그릇을 제출합니다. (행동력 1)", "그릇은 한 턴 뒤 반납대로 갑니다."],
    required: [],
    steps: ["🍲 음식", "📬 제출"],
  },
  trash: {
    description: ["쓰레기를 최대 5개까지 보관합니다. (버리기 행동력 1)", "불 슬라임이 소각해 비웁니다. (행동력 1)"],
    required: ["fire"],
    steps: ["🗑️ 쓰레기 투입", "🔥 소각"],
  },
  "dish-rack": {
    description: ["깨끗한 그릇을 꺼냅니다. (행동력 1)", "상자에는 그릇이 최대 3개고 새로 생기지 않습니다."],
    required: [],
    steps: ["🍽️ 그릇 받기"],
  },
  washer: {
    description: ["더러운 그릇을 맡깁니다. (행동력 1)", "물 슬라임만 세척할 수 있습니다. (행동력 1)"],
    required: ["water"],
    steps: ["🍽️ 더러운 그릇", "💧 세척"],
  },
  table: {
    description: ["재료나 그릇을 한 칸 보관합니다.", "다른 슬라임에게 물건을 인계할 수 있습니다."],
    required: [],
    steps: ["🪵 보관", "🤝 인계"],
  },
};

// 슬라임 정보 패널의 "가능한 일"에 붙일 아이콘.
const roleIcons: Record<string, string> = {
  "물 공급": "💧",
  설거지: "🫧",
  가열: "🔥",
  소각: "🗑️",
  운반: "📦",
  발전: "⚡",
  손질: "🔪",
  썰기: "🥕",
  "다중 운반": "🍽️",
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

// 조리 흐름 한 칸. 게임에 쓰는 그림을 그대로 쓰고, 그림이 없을 때만
// 이모지로 대신한다.
function FlowIcon({ art, fallback }: { art?: string; fallback: string }) {
  if (!art) return <span aria-hidden>{fallback}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="flow-icon" src={art} alt="" aria-hidden />;
}

// 재료 → (믹서기라면 물) → 기구 순서. 주문 카드 두 종류가 같이 쓴다.
function OrderFlow({ foodId }: { foodId: ItemId }) {
  const recipe = recipes[foodId];
  if (!recipe) return null;
  return (
    <div className="order-process" aria-label="조리 흐름">
      <FlowIcon
        art={foodImages[recipe.ingredient.itemId]}
        fallback={itemIcons[recipe.ingredient.itemId]}
      />
      {recipe.station === "blender" ? (
        <>
          <i aria-hidden>+</i>
          <span aria-hidden>💧</span>
        </>
      ) : null}
      <i aria-hidden>→</i>
      <FlowIcon
        art={recipe.station === "blender" ? blenderArt.empty : stationArt[recipe.station]}
        fallback={stationIcons[recipe.station]}
      />
    </div>
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
            <OrderFlow foodId={order.foodId} />
            <footer>
              {recipes[order.foodId]
                ? stationLabels[recipes[order.foodId]!.station]
                : "조리 정보 없음"}
            </footer>
          </article>
        );
      })}
      {upcoming.map((order) => (
        <article className="order-card order-card-next" key={order.id}>
          <header>
            <b>다음</b>
          </header>
          <strong className="order-food">
            <OrderDish foodId={order.foodId} />
            {itemLabel(order.foodId)}
          </strong>
          <OrderFlow foodId={order.foodId} />
          <footer>
            {recipes[order.foodId]
              ? stationLabels[recipes[order.foodId]!.station]
              : "조리 정보 없음"}
          </footer>
        </article>
      ))}
    </section>
  );
}

// 설비가 지금 무엇을 얼마나 들고 있는지. 캔버스 게이지와 같은 값을 쓴다.
function stationStock(state: GameState, id: StationInstanceId) {
  const type = stationType(id);
  if (isBoxStation(type)) {
    return { label: itemLabel(boxItems[type]), have: state.ingredients[id]!.stock, max: INGREDIENT_MAX };
  }
  if (type === "dish-rack") {
    return { label: "깨끗한 그릇", have: state.dishRacks[id]!.length, max: dishConfig.rackCapacity };
  }
  if (type === "trash") {
    return { label: "쌓인 쓰레기", have: state.incinerators[id]!.count, max: incineratorConfig.capacity };
  }
  if (type === "dish-return") {
    return { label: "반납된 그릇", have: state.dishReturns[id]!.length, max: dishConfig.rackCapacity };
  }
  return null;
}

function StationStock({ state, id }: { state: GameState; id: StationInstanceId }) {
  const stock = stationStock(state, id);
  if (!stock) return null;
  return (
    <div className="station-stock">
      <b>{stock.label}</b>
      <span className="stock-gauge" data-full={stock.have >= stock.max ? "" : undefined}>
        <i style={{ width: `${Math.min(100, (stock.have / stock.max) * 100)}%` }} />
      </span>
      <small>{stock.have} / {stock.max}</small>
    </div>
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
          {type.role.split(" · ").map((role) => (
            <span key={role}>
              <i aria-hidden>{roleIcons[role] ?? "•"}</i>
              {role}
            </span>
          ))}
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
      <StationStock state={state} id={target.id} />
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
  const [progress, setProgress] = useState<StageProgress>({});
  const [stageId, setStageId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  // 턴제는 한 마리씩 조작한다. 선택은 늘 0마리 아니면 1마리다.
  const [selectedActor, setSelectedActor] = useState<ActorId | null>(null);
  const [inspected, setInspected] = useState<InspectorTarget | null>(null);
  const [helpStation, setHelpStation] = useState<StationId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [banner, setBanner] = useState<keyof typeof bannerImages | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const paused = settingsOpen || helpStation !== null || resumeCount !== null;

  const [saved, setSaved] = useState("");
  const stateRef = useRef(state);
  const selectedActorRef = useRef(selectedActor);
  // 캔버스가 이름표를 띄울지 판단하는 데 쓴다.
  const inspectedRef = useRef(inspected);
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
    inspectedRef.current = inspected;
    view.current?.sync(stateRef.current!);
  }, [inspected]);

  useEffect(() => {
    setInspected((current) => selectedActor
      ? { kind: "actor", id: selectedActor }
      : current?.kind === "actor" ? null : current);
  }, [selectedActor]);

  // 판이 시작되면 "영업 시작", 남은 턴이 얼마 없으면 "마감 임박"을 한 번씩 띄운다.
  const startedStageId =
    state?.phase === "playing" ? currentStage(state).id : null;
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
    // 최고 별만 남긴다. 못 깬 판도 0으로 적어야 다음 칸이 열리지 않는다.
    setProgress((current) => {
      const kept = withResult(
        current,
        currentStage(state).id,
        state.phase === "won" ? stageRank(state) : 0,
      );
      writeProgress(kept);
      return kept;
    });
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
            // 행동력이 남았을 때 머리 위에 뜨는 물음표와, 골랐을 때의 이름표.
            idleMark: Phaser.GameObjects.Text;
            nameTag: Phaser.GameObjects.Text;
            facing: Facing;
            last: { x: number; y: number };
            acts: number;
            blinking: boolean;
            scale: number;
            motion: Phaser.Tweens.Tween;
            walking?: Phaser.Tweens.Tween;
          }
        >
      >;
      stations!: Record<StationInstanceId, Phaser.GameObjects.Text>;
      // 믹서기만 단계에 따라 그림이 바뀌어 따로 들고 있는다.
      blenders!: Partial<Record<StationInstanceId, { art: Phaser.GameObjects.Image; fit: () => void }>>;
      blenderHints!: Partial<Record<StationInstanceId, Phaser.GameObjects.Text>>;
      // 재고 게이지와, 골랐을 때만 뜨는 이름표.
      gauges!: Partial<Record<StationInstanceId, Phaser.GameObjects.Graphics>>;
      stationNames!: Partial<Record<StationInstanceId, Phaser.GameObjects.Text>>;
      // 직전에 본 설비 상태. 바뀐 순간에만 이펙트를 터뜨리려고 들고 있는다.
      stationMarks!: Partial<Record<StationInstanceId, string>>;
      // 이펙트를 그림 높이에 맞춰 띄우려고 만들 때 계산한 값을 들고 있는다.
      stationLift!: Partial<Record<StationInstanceId, number>>;
      sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

      // 게이지 한 줄. 남은 양을 설비 위에 가로 막대로 그린다.
      drawGauge(
        id: StationInstanceId,
        x: number,
        y: number,
        filled: number,
        total: number,
      ) {
        const gauge = this.gauges[id];
        if (!gauge) return;
        const width = 34;
        const height = 5;
        const left = x - width / 2;
        gauge
          .setVisible(true)
          .clear()
          .fillStyle(0x1c0f07, 0.85)
          .fillRoundedRect(left - 1, y - 1, width + 2, height + 2, 3);
        if (filled > 0) {
          // 가득 차면 색이 바뀌어, 소각기가 찼는지 상자가 찼는지 바로 보인다.
          gauge
            .fillStyle(filled >= total ? 0xffc65c : 0x8ed07a, 1)
            .fillRoundedRect(left, y, (width * filled) / total, height, 2);
        }
      }

      // 이펙트는 점 하나짜리 텍스처를 색만 바꿔 재사용한다. 라이브러리를
      // 더 들이지 않고 Phaser의 파티클만 쓴다.
      burst(x: number, y: number, tint: number, count = 10, speed = 90) {
        this.sparks.setParticleTint(tint);
        this.sparks.emitParticleAt(x, y, count);
        this.sparks.speed = { min: speed * 0.4, max: speed };
      }

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

      // 몸은 tween이 옮기고, 딸린 표시들은 매 프레임 그 위치에 붙인다.
      // 표시마다 tween을 걸면 어긋나서 한곳에서 따라가게 한다.
      update() {
        for (const actorId of Object.keys(this.slimes) as ActorId[]) {
          const sprite = this.slimes[actorId];
          if (!sprite) continue;
          const { x, y } = sprite.body;
          sprite.body.setDepth(y);
          sprite.selected.setPosition(x, y + 14).setDepth(y - 1);
          sprite.nameTag.setPosition(x, y + 26).setDepth(y + 6);
          // 위아래로 살랑이게 한다. 몸을 따라다녀야 해서 tween 대신 계산한다.
          sprite.idleMark
            .setPosition(x + 18, y - 30 + Math.sin(this.time.now / 320) * 3)
            .setDepth(y + 3);
          const hold = carryOffsets[sprite.facing];
          sprite.carried
            .setPosition(x + hold.x, y + hold.y)
            // 등을 돌렸을 때만 몸보다 뒤에 그린다. 선택 링(-1)보다는 앞이다.
            .setDepth(y + (hold.behind ? -0.5 : 2));
        }
      }

      preload() {
        for (const url of new Set([
          ...Object.values(stationArt),
          ...Object.values(stationBadgeArt),
          ...Object.values(blenderArt),
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
        // 파티클용 점 텍스처. 파일을 더 두지 않고 그려서 만든다.
        if (!this.textures.exists("spark-dot")) {
          const dot = this.make.graphics({ x: 0, y: 0 }, false);
          dot.fillStyle(0xffffff, 1).fillCircle(6, 6, 6);
          dot.generateTexture("spark-dot", 12, 12);
          dot.destroy();
        }
        this.cameras.main
          .setBackgroundColor("#21130b")
          .setZoom(RENDER_SCALE)
          .centerOn(MAP_WIDTH * TILE_SIZE / 2, MAP_HEIGHT * TILE_SIZE / 2);
        // Phaser는 캔버스 밖 DOM 오버레이의 좌표도 입력으로 받으므로,
        // 실제 캔버스에서 시작한 포인터만 게임 명령으로 처리한다.
        const fromCanvas = (pointer: Phaser.Input.Pointer) =>
          pointer.event?.target === this.game.canvas;
        // 바닥과 벽은 단색이다. 그림이 많아 결까지 그리면 산만해진다.
        const planks = this.add.graphics().setDepth(0);
        KITCHEN_ROWS.forEach((row, rowIndex) => {
          [...row].forEach((tile, colIndex) => {
            const { x, y } = tileCenter({ col: colIndex, row: rowIndex });
            planks.fillStyle(tile === "#" ? 0xa9713a : 0x3d2314, 1);
            planks.fillRect(x - TILE_SIZE / 2, y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
          });
        });
        // 기구는 차지한 칸 범위에 그림만 얹는다. 배경 네모는 두지 않는다.
        this.stations = {} as Record<StationInstanceId, Phaser.GameObjects.Text>;
        this.blenders = {};
        this.blenderHints = {};
        this.gauges = {};
        this.stationNames = {};
        this.stationMarks = {};
        this.stationLift = {};
        for (const station of stationInstances) {
          const { id, type, tiles } = station;
          const first = tileCenter(tiles[0]);
          const last = tileCenter(tiles[tiles.length - 1]);
          const x = (first.x + last.x) / 2;
          const y = (first.y + last.y) / 2;
          const width = Math.abs(last.x - first.x) + TILE_SIZE;
          const height = Math.abs(last.y - first.y) + TILE_SIZE;
          const style = stationArtStyle[type] ?? {};
          // 칸을 꽉 채우도록 긴 쪽에 맞춘다. 조리대 위에 놓는 기구는 칸보다
          // 크게 그리고 위로 올려, 테이블에 얹힌 것처럼 보이게 한다.
          const grow = style.grow ?? 1;
          const fit = (image: Phaser.GameObjects.Image) =>
            image.setScale(
              Math.min(width / image.width, height / image.height) * grow,
            );
          // 깊이는 언제나 서 있는 칸의 y로 잡는다. 그림을 위로 올려도
          // 앞뒤 순서는 슬라임과 같은 규칙으로 정렬된다.
          const lift = style.lift ?? 0;
          this.stationLift[id] = lift;
          if (style.onTable) {
            this.add
              .image(x, y, "/stations/table.png")
              .setScale(Math.min(width / 230, height / 226))
              .setDepth(y);
          }
          const art = this.add.image(x, y - lift, stationArt[type]).setDepth(y + 1);
          fit(art);
          if (type === "blender") {
            // 단계가 바뀌면 그림만 갈아 끼우고 칸 맞춤은 그대로 다시 잡는다.
            this.blenders[id] = { art, fit: () => fit(art) };
            // 물이 필요할 때 띄우는 안내 아이콘.
            this.blenderHints[id] = this.add
              .text(x + TILE_SIZE / 2 - 8, y - lift - 12, "", {
                fontFamily: "Jua, sans-serif",
                fontSize: "20px",
                resolution: RENDER_SCALE,
              })
              .setOrigin(0.5)
              .setDepth(y + 3);
          }
          const itemArt = stationBadgeArt[type];
          if (itemArt) {
            // 상자 그림 가운데 흰 원 자리에 내용물을 얹는다.
            const badge = this.add.image(x, y + 2 - lift, itemArt).setDepth(y + 2);
            badge.setScale(24 / Math.max(badge.width, badge.height));
          }
          // 재료·그릇·쓰레기 수는 숫자 대신 게이지로 보여 준다. 정확한 수는
          // 설비를 클릭했을 때 정보 패널에서 본다.
          this.gauges[id] = this.add
            .graphics()
            .setDepth(y + 3)
            .setVisible(false);
          // 상태 문구. 게이지로 대신할 수 없는 것만 짧게 남긴다.
          this.stations[id] = this.add
            .text(x, y - lift - height / 2 - 4, "", {
              color: "#ffe9b8",
              fontFamily: "Jua, sans-serif",
              fontSize: "12px",
              align: "center",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5, 1)
            .setDepth(y + 2);
          // 이름은 골랐을 때만 설비 아래에 뜬다.
          this.stationNames[id] = this.add
            .text(x, y + height / 2 - 2, stationLabels[type], {
              color: "#fff4dc",
              backgroundColor: "#00000099",
              padding: { x: 5, y: 2 },
              fontFamily: "Jua, sans-serif",
              fontSize: "12px",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5, 0)
            .setDepth(y + 6)
            .setVisible(false);
          this.add
            .zone(x, y, width, height)
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

        this.sparks = this.add
          .particles(0, 0, "spark-dot", {
            lifespan: 520,
            speed: { min: 40, max: 90 },
            scale: { start: 0.55, end: 0 },
            alpha: { start: 0.95, end: 0 },
            gravityY: 120,
            emitting: false,
          })
          .setDepth(900);

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
          // "아직 시킬 일이 남았다"는 표시. 고른 슬라임에는 띄우지 않는다.
          const idleMark = this.add
            .text(spot.x + 18, spot.y - 30, "?", {
              color: "#ffe9b8",
              fontFamily: "Jua, sans-serif",
              fontSize: "20px",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setAlpha(0.75)
            .setDepth(spot.y + 3)
            .setVisible(false);
          const nameTag = this.add
            .text(spot.x, spot.y + 26, actor.name, {
              color: "#fff4dc",
              backgroundColor: "#00000099",
              padding: { x: 5, y: 2 },
              fontFamily: "Jua, sans-serif",
              fontSize: "12px",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5, 0)
            .setDepth(spot.y + 6)
            .setVisible(false);
          this.slimes[actorId] = {
            typeId: actor.typeId,
            body: container,
            visual,
            art,
            faceLayer,
            carried,
            selected,
            idleMark,
            nameTag,
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
                // 발밑에서 작게 튀는 먼지. 걸을 때와 일할 때 색을 다르게 준다.
                if (mode !== "walk") {
                  this.burst(
                    spot.x,
                    spot.y + 14,
                    mode === "stir" ? 0xffe08a : 0xd8c7a8,
                    mode === "stir" ? 10 : 6,
                    mode === "stir" ? 110 : 60,
                  );
                }
                this.time.delayedCall(MOTION_MS, () => {
                  const back = this.slimes[actorId];
                  if (!back || back.acts !== actor.acts) return;
                  back.motion.stop();
                  back.visual.setAngle(0).setY(0);
                  back.motion = this.breathe(back.visual, back.scale);
                });
              }
              // 칸을 뛰어넘지 않고 미끄러지듯 옮긴다. 딸린 표시들은 update가
              // 몸 위치를 따라 붙이므로 여기서는 몸만 움직인다.
              if (sprite.last.x !== spot.x || sprite.last.y !== spot.y) {
                sprite.walking?.stop();
                sprite.walking = this.tweens.add({
                  targets: sprite.body,
                  x: spot.x,
                  y: spot.y,
                  duration: MOTION_MS,
                  ease: "Sine.easeInOut",
                });
              }
              sprite.last = { x: spot.x, y: spot.y };
              sprite.carried.setText(actor.carrying.map(carriedIcon).join(" ") ?? "");
              sprite.selected.setVisible(selectedActorRef.current === actorId);
              sprite.nameTag.setVisible(selectedActorRef.current === actorId);
              // 아직 행동력이 남은 슬라임에게만 물음표를 띄운다. 지금 고른
              // 슬라임은 이미 보고 있으니 뺀다.
              sprite.idleMark.setVisible(
                current.phase === "playing" &&
                  actor.actionPoints > 0 &&
                  selectedActorRef.current !== actorId,
              );
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
            const shown = inspectedRef.current;
            for (const station of stationInstances) {
              const { id, type, tiles } = station;
              const washer = current.washers[id];
              const incinerator = current.incinerators[id];
              const workstation = current.workstations[id];
              // 수량은 게이지가 맡고, 글자는 게이지로 못 나타내는 상태만 쓴다.
              const label = current.fires[id]?.onFire
                ? "🔥"
                : type === "stove"
                  ? workstation!.progress > 0
                    ? `${workStatusLabels.WORKING} ${workstation!.progress}/${actionCost.chop}`
                    : workStatusLabels[workstation!.status]
                  : type === "washer"
                    ? washer!.progress > 0
                      ? `세척 ${washer!.progress}/${actionCost.wash}`
                      : washer!.dish
                        ? washer!.dish.status === "clean" ? "세척 완료" : "세척 대기"
                        : ""
                    : type === "table"
                      ? current.tables[id]![0] ? carriedLabel(current.tables[id]![0]) : ""
                      : type === "dish-return"
                        ? current.dishReturns[id]!.length
                          ? `${current.dishReturns[id]!.length}개`
                          : ""
                        : "";
              this.stations[id].setText(label);
              // 재고가 있는 설비만 게이지를 띄운다.
              const stock = isBoxStation(type)
                ? ([current.ingredients[id]!.stock, INGREDIENT_MAX] as const)
                : type === "dish-rack"
                  ? ([current.dishRacks[id]!.length, dishConfig.rackCapacity] as const)
                  : type === "trash"
                    ? ([incinerator!.count, incineratorConfig.capacity] as const)
                    : null;
              const spot = tileCenter(tiles[0]);
              if (stock) {
                this.drawGauge(id, spot.x, spot.y - TILE_SIZE / 2 - 6, stock[0], stock[1]);
              }
              // 이름표는 그 설비를 골랐을 때만.
              this.stationNames[id]!.setVisible(
                shown?.kind === "station" && shown.id === id,
              );
              const blender = current.blenders[id];
              if (blender) {
                const stage = blenderStage(blender);
                this.blenders[id]!.art.setTexture(blenderArt[stage]);
                this.blenders[id]!.fit();
                // 과일만 들어간 믹서기는 물이 필요하다는 것을 아이콘으로 알린다.
                this.blenderHints[id]!.setText(stage === "needs-water" ? "💧" : "");
              }
            }
            // 설비에서 무슨 일이 일어났는지 파티클로 한 번 보여 준다.
            // 상태를 저장하지 않고 바뀐 것만 골라 터뜨린다.
            for (const station of stationInstances) {
              const { id, type, tiles } = station;
              const seen = this.stationMarks[id];
              const now =
                type === "stove"
                  ? `${current.stoves[id]!.join()}/${current.workstations[id]!.status}`
                  : type === "blender"
                    ? blenderStage(current.blenders[id]!)
                    : type === "washer"
                      ? `${current.washers[id]!.dish?.status ?? "-"}`
                      : type === "trash"
                        ? `${current.incinerators[id]!.count}`
                        : type === "submission"
                          ? `${current.filled}`
                          : "";
              this.stationMarks[id] = now;
              if (seen === undefined || seen === now || !now) continue;
              const spot = tileCenter(tiles[0]);
              const y = spot.y - (this.stationLift[id] ?? 0);
              if (type === "stove" && current.workstations[id]!.status === "COMPLETE") {
                this.burst(spot.x, y, 0xfff0b8, 12);
              } else if (type === "blender") {
                const stage = blenderStage(current.blenders[id]!);
                if (stage === "ready") this.burst(spot.x, y, 0x7fd4ff, 10);
                if (stage === "done") this.burst(spot.x, y, 0xff8fc4, 16, 130);
              } else if (type === "washer" && current.washers[id]!.dish?.status === "clean") {
                this.burst(spot.x, y, 0x9fe8ff, 14);
              } else if (type === "trash" && current.incinerators[id]!.count === 0) {
                this.burst(spot.x, y, 0xffa23c, 16, 140);
              } else if (type === "submission") {
                this.burst(spot.x, y, 0xffd45c, 18, 150);
              }
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
      // 음악·효과음은 React <audio>가 낸다. Phaser 사운드는 쓰지 않는다.
      // ponytail: 화면을 떠날 때 콘솔에 남는 "closed AudioContext" 오류는
      // 이걸로 사라지지 않았다. scene.pause/resume 경로에서 나는 것으로
      // 보이며 동작에는 영향이 없다.
      audio: { noAudio: true },
      scene: Restaurant,
      render: { antialias: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    });
    return () => {
      view.current = null;
      game.destroy(true);
    };
  }, [squad]);

  // 저장된 별은 브라우저에만 있어 첫 렌더 뒤에 읽는다.
  useEffect(() => {
    setProgress(readProgress());
  }, []);

  // 한 마리가 행동력을 다 쓰면 아직 남은 다음 슬라임으로 넘어간다.
  useEffect(() => {
    if (!state || !squad || !selectedActor) return;
    if ((state.actors[selectedActor]?.actionPoints ?? 0) > 0) return;
    setSelectedActor(nextReadyActor(state, squadActorIds(squad), selectedActor));
  }, [state, selectedActor, squad]);

  function startRound(list: SlimeTypeId[], id: string = stageId ?? "0") {
    const index = Math.max(0, stageIndexOf(id));
    const next = initialState(2026, list, defaultStages(), index);
    setStageId(id);
    metrics.current = emptyMetrics();
    savedRef.current = false;
    roundSeed.current = next.seed;
    setSaved("");
    setSelectedActor(null);
    setInspected(null);
    setHelpStation(null);
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
          setResumeCount(next || helpStation !== null ? null : 3);
          return next;
        });
      }
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [helpStation, settingsOpen, squad]);

  // 판을 고르기 전에는 선택 화면을 보여 준다.
  if (!squad || !state) {
    return (
      <>
        <Music src="/music/home.mp3" />
        <StageSelect
          progress={progress}
          onPick={(id) => startRound(allTypeIds, id)}
          onBack={() => window.location.assign("/")}
        />
      </>
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
      <GameSoundEffects
        state={state}
        selectedActors={selectedActor ? [selectedActor] : []}
      />
      <div className="stage-frame" data-inspector={inspected ? "" : undefined}>
        <div id="game-canvas" aria-label="탑다운 판타지 식당 게임 맵" />
        <MusicSettings
          variant="game"
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            setResumeCount(open || helpStation !== null ? null : 3);
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
          <span
            className="hud-chip"
            data-warn={state.turnsLeft <= RUSH_TURNS_LEFT ? "" : undefined}
          >
            🔄 {state.turnsLeft}턴
          </span>
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
                                  }}
                >
                  다음 스테이지
                </button>
              ) : (
                <button autoFocus onClick={() => startRound(squad, currentStage(state).id)}>
                  다시 도전
                </button>
              )}
              <button
                onClick={() => {
                  setSquad(null);
                  setState(null);
                  setStageId(null);
                }}
              >
                스테이지 선택
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
