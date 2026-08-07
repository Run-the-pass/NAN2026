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
  isBesideStation,
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
  servedBare,
  stationElements,
  allRecipes,
  type ActorId,
  type Order,
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
// 커서 그림과 핫스팟. 화살표는 뾰족한 끝, 손은 손가락 끝이 기준점이다.
// globals.css의 --cursor-arrow / --cursor-hand와 같은 값이어야 한다.
const CURSOR_ARROW = 'url("/ui/cursor.png") 2 0, auto';
const CURSOR_HAND = 'url("/ui/cursor-click.png") 9 0, pointer';
const CURSOR_DENY = 'url("/ui/cursor.png") 2 0, not-allowed';
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

// 믹서기는 빈 그림 하나만 쓰고 안에 든 것을 그 위에 겹쳐 그린다. 과일마다
// 그림을 따로 만들면 레시피가 늘 때마다 에셋이 필요해서, 재료·완성품이
// 이미 가진 그림을 유리병 자리에 얹는 방식으로 둔다.
const BLENDER_ART = "/stations/blender.png";
// blender.png(205×256) 안에서 유리병 안쪽 칸과 물이 차는 칸. 그림 가운데를
// 기준으로 잰 값이라 그림을 칸에 맞춘 배율만 곱하면 된다.
const BLENDER_JAR = { dx: -14.5, dy: -47, width: 88, height: 78 };
const BLENDER_WATER = { dx: -14.5, dy: -38, width: 88, height: 60 };
// ingredient-box.png(179×185) 가운데 흰 원. 알파값에서 실제 원 범위를 재서
// 얻은 값이다. 내용물은 이 원 안에 앉는다.
const BOX_BADGE = { dx: 0, dy: -7, diameter: 59 };

// 도마·믹서기는 조리대 위에 놓인 물건이다. 아래에 테이블을 깔고 그림을
// 위로 올려 얹힌 것처럼 보이게 한다. 칸을 넘어가도 되고, 앞뒤 순서는
// 슬라임과 같은 y 정렬 규칙을 따른다.
const stationArtStyle: Partial<
  Record<StationId, { onTable?: boolean; lift?: number; grow?: number }>
> = {
  stove: { onTable: true, lift: 16, grow: 0.92 },
  // 믹서기는 칸을 조금 넘되 슬라임보다 커 보이지 않을 만큼만.
  blender: { onTable: true, lift: 18, grow: 1.18 },
  // 소각기는 칸을 꽉 채우는데도 어두워서 작아 보인다. 살짝 키워 세운다.
  trash: { lift: 5, grow: 1.14 },
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
  "fried-potato": "/food/fried-potato.png",
  "fried-mushroom": "/food/fried-mushroom.png",
  "grilled-mushroom": "/food/grilled-mushroom.png",
};

// 손에 든 것은 실제 게임 그림으로 "?" 왼쪽에 보여 준다. 그릇은 접시 그림
// 위에 담긴 음식 그림을 얹는다. 이모지는 쓰지 않는다.
const DIRTY_PLATE_ART = "/food/dirty-plate.png";
function carriedArt(carried: Carried): { bg?: string; fg?: string } {
  if (isDish(carried)) {
    return {
      bg: carried.status === "dirty" ? DIRTY_PLATE_ART : stationBadgeArt["dish-rack"],
      fg: carried.content ? foodImages[carried.content] : undefined,
    };
  }
  return { fg: foodImages[carried] };
}

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
  { description: string[]; required: SlimeTypeId[]; steps: { art: string; text: string }[] }
> = {
  "potato-box": {
    description: ["턴이 끝날 때마다 감자가 한 개 찹니다.", "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)"],
    required: [],
    steps: [{ art: "/food/gamja.png", text: "감자 받기" }],
  },
  "carrot-box": {
    description: ["턴이 끝날 때마다 당근이 한 개 찹니다.", "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)"],
    required: [],
    steps: [{ art: "/food/carrot.png", text: "당근 받기" }],
  },
  "cabbage-box": {
    description: ["턴이 끝날 때마다 양배추가 한 개 찹니다.", "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)"],
    required: [],
    steps: [{ art: "/food/cabbage.png", text: "양배추 받기" }],
  },
  "banana-box": {
    description: ["바나나를 꺼냅니다. (행동력 1)", "빈손이나 깨끗한 그릇으로 꺼냅니다."],
    required: [],
    steps: [{ art: "/food/banana.png", text: "바나나 받기" }],
  },
  "strawberry-box": {
    description: ["딸기를 꺼냅니다. (행동력 1)", "빈손이나 깨끗한 그릇으로 꺼냅니다."],
    required: [],
    steps: [{ art: "/food/strawberry.png", text: "딸기 받기" }],
  },
  "mushroom-box": {
    description: ["버섯을 꺼냅니다. (행동력 1)", "빈손이나 깨끗한 그릇으로 꺼냅니다."],
    required: [],
    steps: [{ art: "/food/mushroom.png", text: "버섯 받기" }],
  },
  oven: {
    description: ["불 슬라임만 구울 수 있습니다. (행동력 1)", "재료를 올리고 꺼내는 것은 누구나 합니다."],
    required: ["fire"],
    steps: [{ art: "/food/mushroom.png", text: "버섯" }, { art: "/stations/oven.png", text: "불 슬라임이 굽기" }, { art: "/food/plate.png", text: "그릇에 담기" }],
  },
  "dish-return": {
    description: ["제출한 그릇이 한 턴 뒤 더러운 채로 나옵니다.", "집어서 세척대로 옮깁니다. (행동력 1)"],
    required: [],
    steps: [{ art: "/food/dirty-plate.png", text: "더러운 그릇 회수" }, { art: "/stations/washer.png", text: "세척대로" }],
  },
  fryer: {
    description: ["불 슬라임만 튀길 수 있습니다. (행동력 1)", "감자와 버섯을 튀깁니다."],
    required: ["fire"],
    steps: [{ art: "/food/gamja.png", text: "감자·버섯" }, { art: "/stations/fryer.png", text: "불 슬라임이 튀기기" }, { art: "/food/plate.png", text: "그릇에 담기" }],
  },
  blender: {
    description: [
      "과일 → 물 → 가동 순서로 스무디를 만듭니다.",
      "넣은 과일은 뺄 수 없고, 물을 먼저 채울 수도 없습니다.",
    ],
    required: ["water", "lightning"],
    steps: [{ art: "/food/banana.png", text: "과일 넣기" }, { art: "/stations/washer-water.png", text: "물 슬라임이 물" }, { art: "/ui/energy.png", text: "번개 슬라임이 가동" }],
  },
  stove: {
    description: ["땅 슬라임만 재료를 썰 수 있습니다. (행동력 1)", "감자·당근·양배추를 채썹니다."],
    required: ["earth"],
    steps: [{ art: "/food/gamja.png", text: "감자·당근·양배추" }, { art: "/food/doma.png", text: "땅 슬라임이 썰기" }, { art: "/food/plate.png", text: "그릇에 담기" }],
  },
  submission: {
    description: ["주문 음식이 담긴 그릇을 제출합니다. (행동력 1)", "그릇은 한 턴 뒤 반납대로 갑니다."],
    required: [],
    steps: [{ art: "/food/plate.png", text: "완성 음식" }, { art: "/stations/submission.png", text: "제출" }],
  },
  trash: {
    description: ["쓰레기를 최대 5개까지 보관합니다. (버리기 행동력 1)", "불 슬라임이 소각해 비웁니다. (행동력 1)"],
    required: ["fire"],
    steps: [{ art: "/stations/trash-full.png", text: "쓰레기 투입" }, { art: "/stations/trash.png", text: "불 슬라임이 소각" }],
  },
  "dish-rack": {
    description: ["깨끗한 그릇을 꺼냅니다. (행동력 1)", "상자에는 그릇이 최대 3개고 새로 생기지 않습니다."],
    required: [],
    steps: [{ art: "/food/plate.png", text: "깨끗한 그릇 받기" }],
  },
  washer: {
    description: ["더러운 그릇을 맡깁니다. (행동력 1)", "물 슬라임만 세척할 수 있습니다. (행동력 1)"],
    required: ["water"],
    steps: [{ art: "/food/dirty-plate.png", text: "더러운 그릇 넣기" }, { art: "/stations/washer-water.png", text: "물 슬라임이 세척" }],
  },
  table: {
    description: ["재료나 그릇을 한 칸 보관합니다.", "다른 슬라임에게 물건을 인계할 수 있습니다."],
    required: [],
    steps: [{ art: "/stations/table.png", text: "잠깐 올려 두기" }, { art: "/food/plate.png", text: "다시 집기" }],
  },
};

// 슬라임 "특징"에 붙일 그림. 이모지 대신 게임에 쓰는 에셋을 그대로 쓴다.
const traitArt: Record<string, string> = {
  "water-supply": "/stations/washer-water.png",
  wash: "/stations/washer.png",
  "cook-heat": "/stations/oven.png",
  burn: "/stations/trash.png",
  "double-move": "/ui/energy.png",
  power: "/stations/blender.png",
  chop: "/food/doma.png",
};

// 버튼에 쓸 표정 없는 몸. 그려 온 SVG는 얼굴이 따로라 그대로 쓰면 된다.
const facelessSlime = (typeId: SlimeTypeId) =>
  authoredSlimeAssets[typeId] ?? slimeDataUri(typeId, "down", { faceless: true });

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
        <span>행동력</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="energy-icon" src="/ui/energy.png" alt="" aria-hidden />
        <span
          className="stat-gauge"
          role="img"
          aria-label={`남은 행동력 ${actor.actionPoints} / ${max}`}
        >
          {Array.from({ length: max }, (_, cell) => (
            <i key={cell} data-on={cell < actor.actionPoints ? "" : undefined} />
          ))}
        </span>
        {/* 칸만 보면 몇 개인지 세야 한다. 옆에 숫자를 같이 둔다. */}
        <small className="stat-count">{actor.actionPoints} / {max}</small>
      </li>
    </ul>
  );
}

// 완성 음식은 빈 접시 위에 올려 보여 준다. 그릇 없이 내는 음식(스무디)은
// 접시를 깔지 않는다. 그림이 없는 음식은 이모지로 남긴다.
function OrderDish({ foodId }: { foodId: ItemId }) {
  const art = foodImages[foodId];
  if (!art) return <span aria-hidden>{itemIcons[foodId]}</span>;
  if (servedBare(foodId)) {
    return (
      <span className="order-dish order-dish-bare" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} alt="" />
      </span>
    );
  }
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

// 설비를 대표하는 아이콘. 상자류는 담긴 재료 그림을 쓰고, 나머지는 설비
// 그림을 그대로 쓴다. 인게임과 같은 그림이라 이모지보다 바로 알아본다.
function StationIcon({ id }: { id: StationId }) {
  const art = stationBadgeArt[id] ?? stationArt[id];
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={art} alt="" aria-hidden />;
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="flow-icon" src="/stations/washer-water.png" alt="" aria-hidden />
        </>
      ) : null}
      <i aria-hidden>→</i>
      <FlowIcon
        art={stationArt[recipe.station]}
        fallback={stationIcons[recipe.station]}
      />
    </div>
  );
}

function OrderCards({ state }: { state: GameState }) {
  const orders = activeOrders(state);
  const upcoming = upcomingOrders(state);
  // 카드에는 무엇을 만들지만 둔다. 번호·개수·기구 이름은 그림과 조리 흐름이
  // 이미 말해 주고 있어 글자로 또 적으면 읽을 것만 늘어난다.
  const card = (order: Order, next = false) => (
    <article className={next ? "order-card order-card-next" : "order-card"} key={order.id}>
      <strong className="order-food">
        <OrderDish foodId={order.foodId} />
        {itemLabel(order.foodId)}
      </strong>
      <OrderFlow foodId={order.foodId} />
    </article>
  );
  return (
    <section className="order-cards" aria-label="진행 중인 주문">
      {[0, 1].map((index) => {
        const order = orders[index];
        if (!order) return <span className="order-card order-card-empty" aria-hidden key={index} />;
        return card(order);
      })}
      {upcoming.map((order) => card(order, true))}
    </section>
  );
}

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
      <span
        className="stat-gauge"
        role="img"
        aria-label={`${stock.label} ${stock.have} / ${stock.max}`}
        data-full={stock.have >= stock.max ? "" : undefined}
      >
        {Array.from({ length: stock.max }, (_, cell) => (
          <i key={cell} data-on={cell < stock.have ? "" : undefined} />
        ))}
      </span>
      <small>{stock.have} / {stock.max}</small>
    </div>
  );
}

// 이 설비를 실제로 돌릴 수 있는 속성. 밸런스 파일을 고치면 같이 바뀐다.
function workersFor(type: StationId): SlimeTypeId[] {
  if (type === "washer") return stationElements.wash;
  if (type === "trash") return stationElements.burn;
  const list = allRecipes.filter((recipe) => recipe.station === type);
  if (!list.length) return [];
  const seen = new Set(list.flatMap((recipe) => recipe.workers));
  // 믹서기는 물을 채우는 속성도 필요하다.
  if (type === "blender") for (const one of stationElements.wash) seen.add(one);
  return [...seen];
}

function GameInspector({
  state,
  target,
  onClose,
}: {
  state: GameState;
  target: InspectorTarget;
  onClose: () => void;
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
        <h2>{actor.name}</h2>
        <p className="inspector-copy">{type.trait}</p>
        <ActionPoints actor={actor} />
        <h3>특징</h3>
        <div className="inspector-badges">
          {type.traits.map((one) => (
            // 자세한 설명은 마우스를 올렸을 때만 보여 준다. 패널이 길어지면
            // 정작 봐야 할 행동력과 재고가 밀린다.
            <span key={one.id} title={one.detail}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={traitArt[one.id]} alt="" aria-hidden />
              {one.name}
            </span>
          ))}
        </div>
      </aside>
    );
  }
  const type = stationType(target.id);
  const info = stationPanelInfo[type];
  const required = workersFor(type);
  return (
    <aside className="game-inspector" data-station aria-label={`${stationLabels[type]} 정보`}>
      <button className="inspector-close" type="button" onClick={onClose} aria-label="정보 패널 닫기">×</button>
      <span className="inspector-station-icon" aria-hidden>
        <StationIcon id={type} />
      </span>
      <h2>{stationLabels[type]}</h2>
      <div className="inspector-copy">
        {info.description.map((line) => <p key={line}>{line}</p>)}
      </div>
      <StationStock state={state} id={target.id} />
      <h3>필요 슬라임</h3>
      <div className="required-slimes">
        {required.length ? required.map((typeId) => (
          <span key={typeId}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slimePortrait(typeId)} alt="" />
            {slimeTypes[typeId].name}
          </span>
        )) : <span className="any-slime">누구나 사용 가능</span>}
      </div>
      <h3>가능한 작업</h3>
      <div className="station-workflow">
        {info.steps.map((step, index) => (
          <span key={step.text}>
            {index > 0 && <i aria-hidden>→</i>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.art} alt="" aria-hidden />
            <b>{step.text}</b>
          </span>
        ))}
      </div>
      <small className="inspector-hint">옆 칸에 선 슬라임을 고르고 설비를 클릭하면 사용합니다.</small>
    </aside>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [banner, setBanner] = useState<keyof typeof bannerImages | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const paused = settingsOpen || resumeCount !== null;

  const [saved, setSaved] = useState("");
  const stateRef = useRef(state);
  const selectedActorRef = useRef(selectedActor);
  // 캔버스가 이름표를 띄울지 판단하는 데 쓴다.
  const inspectedRef = useRef(inspected);
  // 행동력이 떨어져 자동으로 넘긴 슬라임. 같은 마리를 되풀이해 뺏지 않는다.
  const handedOff = useRef<ActorId | null>(null);
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
            carried: { bg: Phaser.GameObjects.Image; fg: Phaser.GameObjects.Image }[];
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
      blenders!: Partial<Record<StationInstanceId, {
        art: Phaser.GameObjects.Image;
        fit: () => void;
        water: Phaser.GameObjects.Rectangle;
        contents: Phaser.GameObjects.Image;
        showContents: (key: string) => void;
      }>>;
      blenderHints!: Partial<Record<StationInstanceId, Phaser.GameObjects.Image>>;
      // 재고 게이지와, 골랐을 때만 뜨는 이름표.
      gauges!: Partial<Record<StationInstanceId, Phaser.GameObjects.Graphics>>;
      stationNames!: Partial<Record<StationInstanceId, Phaser.GameObjects.Text>>;
      // 직전에 본 설비 상태. 바뀐 순간에만 이펙트를 터뜨리려고 들고 있는다.
      stationMarks!: Partial<Record<StationInstanceId, string>>;
      // 이펙트를 그림 높이에 맞춰 띄우려고 만들 때 계산한 값을 들고 있는다.
      stationLift!: Partial<Record<StationInstanceId, number>>;
      // 지금 고른 슬라임이 각 설비를 쓸 수 있는지. 커서 모양이 이걸 본다.
      usable!: Partial<Record<StationInstanceId, boolean>>;
      sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

      // 게이지 한 줄. 남은 양을 칸으로 나눠 그린다. 이어 붙은 막대는 눈대중
      // 으로 세야 해서 칸마다 떨어뜨려 그린다.
      drawGauge(
        id: StationInstanceId,
        x: number,
        y: number,
        filled: number,
        total: number,
      ) {
        const gauge = this.gauges[id];
        if (!gauge) return;
        const cell = 6;
        const gap = 2;
        const height = 6;
        const width = total * cell + (total - 1) * gap;
        const left = x - width / 2;
        gauge.setVisible(true).clear();
        const color = filled >= total ? 0xffc65c : 0x8ed07a;
        for (let i = 0; i < total; i++) {
          const cx = left + i * (cell + gap);
          gauge
            .fillStyle(i < filled ? color : 0x1c0f07, i < filled ? 1 : 0.85)
            .fillRoundedRect(cx, y, cell, height, 1.5)
            .lineStyle(1, 0x000000, 0.35)
            .strokeRoundedRect(cx, y, cell, height, 1.5);
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
          const markY = y - 30 + Math.sin(this.time.now / 320) * 3;
          sprite.idleMark.setPosition(x + 18, markY).setDepth(y + 3);
          // 들고 있는 것은 "?"와 같은 줄, 바로 왼쪽에 나란히 놓는다.
          sprite.carried.forEach((slot, index) => {
            const slotX = x + 18 - 16 - index * 18;
            slot.bg.setPosition(slotX, markY).setDepth(y + 3);
            slot.fg.setPosition(slotX, markY).setDepth(y + 4);
          });
        }
      }

      preload() {
        for (const url of new Set([
          ...Object.values(stationArt),
          ...Object.values(stationBadgeArt),
          BLENDER_ART,
          ...Object.values(foodImages),
          DIRTY_PLATE_ART,
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
        if (!this.textures.exists("water-drop")) {
          // 물이 필요하다는 표시. 이모지 대신 그려서 텍스처로 만든다.
          const drop = this.make.graphics({ x: 0, y: 0 }, false);
          drop.fillStyle(0x2a1608, 1)
            .fillCircle(16, 22, 12)
            .fillTriangle(16, 2, 5, 20, 27, 20);
          drop.fillStyle(0x6ec8ff, 1)
            .fillCircle(16, 22, 9)
            .fillTriangle(16, 7, 8, 20, 24, 20);
          drop.fillStyle(0xffffff, 0.75).fillCircle(12, 21, 3);
          drop.generateTexture("water-drop", 32, 36);
          drop.destroy();
        }
        if (!this.textures.exists("spark-dot")) {
          const dot = this.make.graphics({ x: 0, y: 0 }, false);
          dot.fillStyle(0xffffff, 1).fillCircle(6, 6, 6);
          dot.generateTexture("spark-dot", 12, 12);
          dot.destroy();
        }
        this.input.setDefaultCursor(CURSOR_ARROW);
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
        // 기구는 차지한 칸 범위에 그림만 얹는다. 배경 네모는 두지 않는다.
        this.stations = {} as Record<StationInstanceId, Phaser.GameObjects.Text>;
        this.blenders = {};
        this.blenderHints = {};
        this.gauges = {};
        this.stationNames = {};
        this.stationMarks = {};
        this.stationLift = {};
        this.usable = {};
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
            // 유리병 안쪽 자리. 그림을 칸에 맞춘 배율만큼 같이 줄인다.
            const k = art.scaleX;
            const jarX = x + BLENDER_JAR.dx * k;
            const jarY = y - lift + BLENDER_JAR.dy * k;
            const jarW = BLENDER_JAR.width * k;
            const jarH = BLENDER_JAR.height * k;
            // 물은 유리병 아래쪽만 채운다. 병 전체를 덮으면 물인지
            // 유리인지 알아볼 수 없다. 과일 뒤에 깔아 잠긴 것처럼 보인다.
            const water = this.add
              .rectangle(
                x + BLENDER_WATER.dx * k,
                y - lift + BLENDER_WATER.dy * k,
                BLENDER_WATER.width * k,
                BLENDER_WATER.height * k,
                0x6ec8ff,
                0.67,
              )
              .setDepth(y + 1.2)
              .setVisible(false);
            const contents = this.add
              .image(jarX, jarY, BLENDER_ART)
              .setDepth(y + 1.4)
              .setVisible(false);
            this.blenders[id] = {
              art,
              fit: () => fit(art),
              water,
              contents,
              // 내용물 그림마다 크기가 달라 넣을 때마다 유리병에 맞춘다.
              showContents: (key: string) => {
                contents.setTexture(key).setVisible(true);
                contents.setScale(
                  Math.min(jarW / contents.width, jarH / contents.height) * 0.8,
                );
              },
            };
            // 물이 필요할 때 띄우는 안내 아이콘.
            this.blenderHints[id] = this.add
              .image(x + TILE_SIZE / 2 - 6, y - lift - 10, "water-drop")
              .setOrigin(0.5)
              .setDisplaySize(16, 18)
              .setDepth(y + 3)
              .setVisible(false);
          }
          const itemArt = stationBadgeArt[type];
          if (itemArt) {
            // 상자 그림 가운데 흰 원 자리에 내용물을 얹는다. 원 지름과 위치를
            // 그림 배율에 맞춰 재므로 어떤 재료 그림이든 원 안에 들어간다.
            const k = art.scaleX;
            const badge = this.add
              .image(x + BOX_BADGE.dx * k, y - lift + BOX_BADGE.dy * k, itemArt)
              .setDepth(y + 2);
            const room = BOX_BADGE.diameter * k * 0.82;
            badge.setScale(Math.min(room / badge.width, room / badge.height));
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
            // 쓸 수 있으면 손, 옆에 서 있는데 안 되면 금지 표시, 그 밖에는
            // 기본 화살표. 상호작용 테두리 색과 같은 판정을 쓴다.
            .on("pointerover", () => {
              const ok = this.usable[id];
              this.input.setDefaultCursor(
                ok === undefined ? CURSOR_ARROW : ok ? CURSOR_HAND : CURSOR_DENY,
              );
            })
            .on("pointerout", () => this.input.setDefaultCursor(CURSOR_ARROW))
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
                // 쓸 수 있으면 그대로 쓴다. 쓸 수 없는 설비를 누른 것은
                // "이게 뭔지 보자"는 뜻이지 실패를 보고 싶다는 뜻이 아니다.
                // 그럴 때는 거절 토스트를 띄우지 않고 슬라임 선택을 놓는다.
                setInspected({ kind: "station", id });
                const actorId = selectedActorRef.current;
                if (!actorId) return;
                if (!this.usable[id]) {
                  setSelectedActor(null);
                  return;
                }
                metrics.current.buttonCommands += 1;
                setState((value) =>
                  value ? interactActor(value, actorId, id) : value,
                );
              },
            );
        }

        this.sparks = this.add
          // 점 하나짜리 파티클이라 크게 튀기면 싸구려로 보인다. 작게,
          // 짧게, 옅게 흩어지도록 둔다.
          .particles(0, 0, "spark-dot", {
            lifespan: { min: 260, max: 430 },
            speed: { min: 25, max: 70 },
            angle: { min: 200, max: 340 },
            scale: { start: 0.32, end: 0 },
            alpha: { start: 0.8, end: 0 },
            rotate: { start: 0, end: 180 },
            gravityY: 200,
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
            .on("pointerover", () => this.input.setDefaultCursor(CURSOR_HAND))
            .on("pointerout", () => this.input.setDefaultCursor(CURSOR_ARROW))
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
          // 손에 든 것 표시 칸. 한 번에 하나만 들지만 배열로 두면 표시
          // 코드가 그대로다.
          const carried = Array.from({ length: 1 }, () => ({
            bg: this.add.image(spot.x, spot.y, stationBadgeArt["dish-rack"]!).setOrigin(0.5).setDisplaySize(18, 18).setVisible(false),
            fg: this.add.image(spot.x, spot.y, stationBadgeArt["dish-rack"]!).setOrigin(0.5).setDisplaySize(14, 14).setVisible(false),
          }));
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
            const shown = inspectedRef.current;
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
                  // 몸 아래쪽에서 살짝. 발밑에 딱 붙이면 바닥에 박힌 것처럼
                  // 보이고, 몸 한가운데면 슬라임을 가린다.
                  this.burst(
                    spot.x,
                    spot.y + 8,
                    mode === "stir" ? 0xffe08a : 0xd8c7a8,
                    mode === "stir" ? 7 : 5,
                    mode === "stir" ? 80 : 50,
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
              sprite.carried.forEach((slot, index) => {
                const held = actor.carrying[index];
                const art = held ? carriedArt(held) : null;
                slot.bg.setVisible(Boolean(art?.bg));
                if (art?.bg) slot.bg.setTexture(art.bg);
                slot.fg.setVisible(Boolean(art?.fg));
                if (art?.fg) slot.fg.setTexture(art.fg);
              });
              sprite.selected.setVisible(selectedActorRef.current === actorId);
              // 이름표는 정보 패널이 보고 있는 대상에만 붙인다. 슬라임을 고른
              // 채로 설비를 누르면 이름표가 둘 다 뜨던 문제를 여기서 막는다.
              sprite.nameTag.setVisible(
                shown?.kind === "actor" && shown.id === actorId,
              );
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
            // 지금 고른 슬라임이 쓸 수 있는 설비. 코어를 한 번 돌려 보고
            // 거절당하는지로 판단해서, 화면이 규칙을 따로 흉내내지 않는다.
            this.usable = {};
            if (selected) {
              for (const tile of moveTargets(current, selected)) {
                const { x, y } = tileCenter(tile);
                moveMarks
                  .fillStyle(0xffe9b8, 0.22)
                  .fillRect(x - 24, y - 24, 48, 48)
                  .lineStyle(2, 0xffe9b8, 0.85)
                  .strokeRect(x - 24, y - 24, 48, 48);
              }
              const actor = current.actors[selected];
              for (const station of stationInstances) {
                if (!actor || !isBesideStation(actor, station)) continue;
                const after = interactActor(current, selected, station.id);
                const ok = (after.refusal?.seq ?? -1) === (current.refusal?.seq ?? -1);
                this.usable[station.id] = ok;
                const first = tileCenter(station.tiles[0]);
                const last = tileCenter(station.tiles[station.tiles.length - 1]);
                const x = (first.x + last.x) / 2;
                const y = (first.y + last.y) / 2;
                const width = Math.abs(last.x - first.x) + TILE_SIZE - 12;
                const height = Math.abs(last.y - first.y) + TILE_SIZE - 12;
                moveMarks
                  .fillStyle(ok ? 0x8ed07a : 0xd75f4c, ok ? 0.2 : 0.16)
                  .fillRect(x - width / 2, y - height / 2, width, height)
                  .lineStyle(2, ok ? 0x8ed07a : 0xd75f4c, 0.9)
                  .strokeRect(x - width / 2, y - height / 2, width, height);
              }
            }
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
              const view = this.blenders[id];
              if (blender && view) {
                const stage = blenderStage(blender);
                // 무엇이 들어 있는지 그대로 보여 준다. 딸기만 넣었으면
                // 딸기가, 완성했으면 그 스무디가 유리병에 보인다.
                const inside = blender.food ?? blender.fruit;
                const art = inside ? foodImages[inside] : undefined;
                if (art) view.showContents(art);
                else view.contents.setVisible(false);
                view.water.setVisible(blender.water);
                // 과일만 들어간 믹서기는 물이 필요하다는 것을 아이콘으로 알린다.
                this.blenderHints[id]!.setVisible(stage === "needs-water");
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

  // 한 마리가 행동력을 다 쓰면 아직 남은 다음 슬라임으로 넘어간다. 단
  // 한 번 넘긴 뒤에는 다시 뺏지 않는다. 행동력이 없어도 눌러서 정보를
  // 볼 수 있어야 한다.
  useEffect(() => {
    if (!state || !squad || !selectedActor) return;
    if ((state.actors[selectedActor]?.actionPoints ?? 0) > 0) {
      handedOff.current = null;
      return;
    }
    if (handedOff.current === selectedActor) return;
    handedOff.current = selectedActor;
    const next = nextReadyActor(state, squadActorIds(squad), selectedActor);
    if (next) setSelectedActor(next);
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
    setSettingsOpen(false);
    setResumeCount(null);
    setState(next);
    setSquad(list);
  }

  const finishTurn = useCallback(() => {
    setState((value) => {
      if (!value) return value;
      const next = endTurn(value);
      // 턴을 넘긴 뒤 아무도 골라져 있지 않으면 손이 멈춘다. 첫 마리를
      // 자동으로 골라 바로 이어서 시킬 수 있게 한다.
      const first = squadActorIds(next.squad).find(
        (id) => (next.actors[id]?.actionPoints ?? 0) > 0,
      );
      setSelectedActor(first ?? null);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!squad) return;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName);
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return;
      if (event.code === "Escape") {
        event.preventDefault();
        setSettingsOpen((open) => {
          const next = !open;
          setResumeCount(next ? null : 3);
          return next;
        });
        return;
      }
      // 스페이스바: 행동력이 남은 다음 슬라임을 고른다. 아무도 남지
      // 않았으면 턴을 넘긴다. 자기 자신뿐이면 고른 채로 둔다.
      if (event.code === "Space") {
        if (settingsOpen) return;
        const current = stateRef.current;
        if (!current || current.phase !== "playing") return;
        event.preventDefault();
        // 버튼에 포커스가 남아 있으면 스페이스가 그 버튼까지 눌러
        // "턴 종료"가 같이 실행된다. 포커스를 먼저 놓는다.
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.tagName === "BUTTON") {
          active.blur();
        }
        const roster = squadActorIds(squad);
        const ready = roster.filter((id) => (current.actors[id]?.actionPoints ?? 0) > 0);
        if (ready.length === 0) {
          finishTurn();
          return;
        }
        const selected = selectedActorRef.current;
        setSelectedActor(
          selected ? (nextReadyActor(current, roster, selected) ?? selected) : ready[0]!,
        );
      }
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [settingsOpen, squad, finishTurn]);

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
            setResumeCount(open ? null : 3);
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
                  {/* 표정 없는 몸만. 얼굴은 캔버스에서만 그린다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="roster-slime"
                    src={facelessSlime(actor.typeId)}
                    alt={slimeTypes[actor.typeId].name}
                  />
                  <small>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="energy-icon" src="/ui/energy.png" alt="" aria-hidden />
                    {actor.actionPoints}/{maxActionPoints(actor.typeId)}
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
            />
          )}
        </div>


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
