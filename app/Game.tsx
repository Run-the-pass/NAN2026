"use client";

import * as Phaser from "phaser";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  KITCHEN_ROWS,
  initialState,
  initialEndlessState,
  interactActor,
  isBesideStation,
  moveActor,
  nextReadyActor,
  endTurn,
  pixelToTile,
  slimeTypes,
  tileCenter,
  actionCost,
  maxActionPoints,
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
  dishConfig,
  incineratorConfig,
  isBoxStation,
  isCooktop,
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
  facings,
  authoredFaceLayout,
  slimeDataUri,
  type Facing,
} from "./slime-art";
import Music, { MusicSettings } from "./Music";
import { gameMusicSource } from "./music-source";
import { GameSoundEffects } from "./SoundEffects";
import StageSelect from "./StageSelect";
import Dialogue from "./Dialogue";
import { actionPointLines, earthInfoLines, finalLines, openingLines, platedFoodLines, stageOpeningLines, tutorialCompleteLines, waterArrivalLines, type DialogueFocus } from "./dialogue-script";
import { activeActorIds, finishTutorial, onTutorialStage, platedIntroReady, prepareTutorialState, roundRank, tutorialAllowsStation, tutorialCue, tutorialDone, tutorialMoveOptions, waterIntroReady, type TutorialCue } from "./tutorial";
import { arrowLayoutFor, type TutorialArrowLayout } from "./tutorial-arrow-layout";
import { emptyProgress, readProgress, withResult, writeProgress, type ProgressData } from "./progress";

type View = {
  sync: (state: GameState) => void;
  pause: () => void;
  resume: () => void;
};

type UndoSnapshot = {
  state: GameState;
  selectedActor: ActorId | null;
  earthInfoComplete: boolean;
  actionPointInfoComplete: boolean;
  waterIntroComplete: boolean;
  platedIntroComplete: boolean;
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
const CURSOR_HAND = 'url("/ui/cursor-click.png") 6 0, pointer';
// 지금은 쓸 수 없는 설비. 금지 표시 대신 "?"를 붙인 화살표로 알린다.
const CURSOR_ASK = 'url("/ui/cursor-help.png") 2 0, help';

function coachArrowStyle(
  layout: TutorialArrowLayout | undefined,
  tiles: { col: number; row: number }[],
): CSSProperties {
  if (!layout || tiles.length === 0) return {};
  const cols = tiles.map(({ col }) => col);
  const rows = tiles.map(({ row }) => row);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  let col = (minCol + maxCol + 1) / 2;
  let row = (minRow + maxRow + 1) / 2;
  if (layout.side === "top") row = minRow - .75;
  if (layout.side === "right") col = maxCol + 1.75;
  if (layout.side === "bottom") row = maxRow + 1.75;
  if (layout.side === "left") col = minCol - .75;
  return {
    left: `${((col + layout.offsetCol) / MAP_WIDTH) * 100}%`,
    top: `${((row + layout.offsetRow) / MAP_HEIGHT) * 100}%`,
    rotate: `${layout.rotate}deg`,
    "--arrow-x": `${layout.bobX}px`,
    "--arrow-y": `${layout.bobY}px`,
  } as CSSProperties;
}

function FixedCoachArrow({
  layout,
  tiles,
}: {
  layout: TutorialArrowLayout | undefined;
  tiles: { col: number; row: number }[];
}) {
  // 부모의 key가 안내 단계가 바뀔 때만 이 컴포넌트를 새로 만든다.
  // 그 전에는 슬라임과 상태가 움직여도 처음 계산한 좌표를 그대로 쓴다.
  const [style] = useState(() => coachArrowStyle(layout, tiles));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="coach-map-arrow" src="/ui/tutorial-arrow.png" alt="" style={style} />
  );
}
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
  // 도마는 칼을 따로 떼어 두고 얹는다. 썰 때 칼만 움직여야 해서다.
  stove: "/food/board.png",
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
  "potato-box": "/food/potato.png",
  "carrot-box": "/food/carrot.png",
  "cabbage-box": "/food/cabbage.png",
  "banana-box": "/food/banana.png",
  "strawberry-box": "/food/strawberry.png",
  "mushroom-box": "/food/mushroom.png",
};

// 믹서기는 단계마다 전용 그림이 있다. 그림과 그림을 겹쳐 만들지 않는다.
// 네 장 모두 같은 자리·같은 배율로 다시 구워 두어 그림이 바뀔 때 기계가
// 흔들리지 않는다.
const blenderArt = {
  empty: "/stations/blender.png",
  "needs-water": "/stations/blender-fruit.png",
  ready: "/stations/blender-ready.png",
  done: "/stations/blender-full.png",
} as const;
// 도마 위에서 움직이는 칼. 도마와 칼은 같은 캔버스에 그려 온 그림이라
// 서로의 자리가 이미 맞다. 아래 값은 board.png(201×256) 좌표계다.
const KNIFE_ART = "/food/knife.png";
// 칼자루 끝. 여기를 축으로 날이 내려온다.
const KNIFE_PIVOT = { x: 0.925, y: 0.071 };
// 도마 그림 한가운데에서 칼자루 끝까지의 거리(도마 그림 픽셀).
const KNIFE_OFFSET = { x: 121.7, y: -108.7 };
// ingredient-box.png(179×185) 가운데 흰 원. 알파값에서 실제 원 범위를 재서
// 얻은 값이다. 내용물은 이 원 안에 앉는다.
const BOX_BADGE = { dx: 0, dy: -7, diameter: 59 };
// 그림마다 알맹이가 캔버스 한가운데에 있지 않다. 알파 범위의 가운데를 재서
// 그만큼 되민다. 값은 그림의 긴 변 대비 %라 인게임과 정보 패널이 같은
// 숫자를 쓴다.
const artAnchor: Record<string, { x: number; y: number }> = {
  "/food/doma.png": { x: 5.2, y: 1 },
  "/food/potato.png": { x: 3.3, y: 2.7 },
  "/stations/trash.png": { x: 0.2, y: -1.1 },
  "/stations/trash-full.png": { x: 0.2, y: -1.1 },
};

// 도마·믹서기는 조리대 위에 놓인 물건이다. 아래에 테이블을 깔고 그림을
// 위로 올려 얹힌 것처럼 보이게 한다. 칸을 넘어가도 되고, 앞뒤 순서는
// 슬라임과 같은 y 정렬 규칙을 따른다.
const stationArtStyle: Partial<
  Record<StationId, { onTable?: boolean; lift?: number; grow?: number }>
> = {
  // 도마는 조리대 위에 놓인 판이라 칸을 다 채우면 오히려 크다.
  stove: { onTable: true, lift: 14, grow: 0.76 },
  // 믹서기는 칸을 조금 넘되 슬라임보다 커 보이지 않을 만큼만. 조리대에
  // 얹힌 것으로 보이려면 도마보다 더 올려야 한다.
  blender: { onTable: true, lift: 19, grow: 1.02 },
};
// 판이 시작할 때와 마감이 다가올 때 잠깐 띄우는 큰 문구.
const bannerImages = {
  start: "/text/business-start-title.png",
  closing: "/text/closing-soon-title.png",
} as const;
const BANNER_MS = 1600;
// 재료와 완성 음식 그림. 모든 아이템에 그림이 있어 이모지로 대신할 자리는
// 없다.
const foodImages: Record<ItemId, string> = {
  potato: "/food/potato.png",
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
  "roasted-potato": "/food/roasted-potato.png",
  salad: "/food/salad.png",
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

// 설비 패널에 뜨는 "가능한 작업". 짧은 이름만 늘어놓고, 자세한 규칙은 마우스를
// 올렸을 때만 말풍선으로 보여 준다. 위에 설명을 또 적으면 같은 말을 두 번 읽게
// 되고 패널이 길어져 아래가 잘린다.
const stationPanelInfo: Record<
  StationId,
  { steps: { art: string; text: string; tip: string }[] }
> = {
  "potato-box": {
    steps: [{ art: "/food/potato.png", text: "감자 받기", tip: `턴이 끝날 때마다 한 개씩 차고 최대 ${INGREDIENT_MAX}개입니다. 빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)` }],
  },
  "carrot-box": {
    steps: [{ art: "/food/carrot.png", text: "당근 받기", tip: `턴이 끝날 때마다 한 개씩 차고 최대 ${INGREDIENT_MAX}개입니다. 빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)` }],
  },
  "cabbage-box": {
    steps: [{ art: "/food/cabbage.png", text: "양배추 받기", tip: `턴이 끝날 때마다 한 개씩 차고 최대 ${INGREDIENT_MAX}개입니다. 빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)` }],
  },
  "banana-box": {
    steps: [{ art: "/food/banana.png", text: "바나나 받기", tip: "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)" }],
  },
  "strawberry-box": {
    steps: [{ art: "/food/strawberry.png", text: "딸기 받기", tip: "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)" }],
  },
  "mushroom-box": {
    steps: [{ art: "/food/mushroom.png", text: "버섯 받기", tip: "빈손이나 깨끗한 그릇으로 꺼냅니다. (행동력 1)" }],
  },
  oven: {
    steps: [
      { art: "/food/mushroom.png", text: "버섯", tip: "화로에 올릴 수 있는 재료입니다. 올리고 꺼내는 것은 누구나 합니다." },
      { art: "/stations/oven.png", text: "이글이가 굽기", tip: "이글이만 구울 수 있습니다. (행동력 1)" },
      { art: "/food/plate.png", text: "그릇에 담기", tip: "깨끗한 그릇을 들고 오면 다 구운 음식이 담깁니다." },
    ],
  },
  "dish-return": {
    steps: [
      { art: "/food/dirty-plate.png", text: "더러운 그릇 회수", tip: "제출한 그릇이 한 턴 뒤 더러운 채로 나옵니다. (행동력 1)" },
      { art: "/stations/washer.png", text: "세척대로", tip: "세척대에 맡겨 씻어야 다시 쓸 수 있습니다." },
    ],
  },
  fryer: {
    steps: [
      { art: "/food/potato.png", text: "감자·버섯", tip: "튀김기에 넣을 수 있는 재료입니다. 넣고 꺼내는 것은 누구나 합니다." },
      { art: "/stations/fryer.png", text: "번쩍이가 튀기기", tip: "번쩍이만 튀길 수 있습니다. (행동력 1)" },
      { art: "/food/plate.png", text: "그릇에 담기", tip: "깨끗한 그릇을 들고 오면 다 튀긴 음식이 담깁니다." },
    ],
  },
  blender: {
    steps: [
      { art: "/food/banana.png", text: "과일 넣기", tip: "과일을 먼저 넣어야 합니다. 한 번 넣은 과일은 다시 뺄 수 없습니다. (행동력 1)" },
      { art: "/ui/water.png", text: "퐁당이가 물 공급", tip: "과일이 든 뒤에만 채울 수 있습니다. 퐁당이만 합니다. (행동력 1)" },
      { art: "/stations/blender-full.png", text: "번쩍이가 가동", tip: "번쩍이만 돌릴 수 있습니다. 스무디는 그릇 없이 컵째 나갑니다. (행동력 1)" },
    ],
  },
  stove: {
    steps: [
      { art: "/food/potato.png", text: "감자·당근·양배추", tip: "도마에서 썰 수 있는 재료입니다. 올리고 꺼내는 것은 누구나 합니다." },
      { art: KNIFE_ART, text: "푸름이가 썰기", tip: `푸름이만 썰 수 있고 ${actionCost.chop}번 썰어야 다 됩니다.` },
      { art: "/food/plate.png", text: "그릇에 담기", tip: "깨끗한 그릇을 들고 오면 다 썬 재료가 담깁니다." },
    ],
  },
  submission: {
    steps: [
      { art: "/food/plate.png", text: "완성 음식", tip: "지금 주문에 있는 음식만 낼 수 있습니다." },
      { art: "/stations/submission.png", text: "제출", tip: "낸 그릇은 한 턴 뒤 반납대로 돌아옵니다. (행동력 1)" },
    ],
  },
  trash: {
    steps: [
      { art: "/stations/trash-full.png", text: "쓰레기 투입", tip: `최대 ${incineratorConfig.capacity}개까지 넣습니다. 빈 그릇은 버릴 수 없습니다. (행동력 1)` },
      { art: "/stations/trash.png", text: "이글이가 소각", tip: "이글이만 태워 비울 수 있습니다. (행동력 1)" },
    ],
  },
  "dish-rack": {
    steps: [{ art: "/food/plate.png", text: "깨끗한 그릇 받기", tip: `그릇은 최대 ${dishConfig.rackCapacity}개고 새로 생기지 않습니다. (행동력 1)` }],
  },
  washer: {
    steps: [
      { art: "/food/dirty-plate.png", text: "더러운 그릇 넣기", tip: "더러운 그릇을 맡깁니다. 누구나 넣을 수 있습니다. (행동력 1)" },
      { art: "/stations/washer-water.png", text: "퐁당이가 세척", tip: `퐁당이만 씻을 수 있고 ${actionCost.wash}번 씻어야 다 됩니다.` },
    ],
  },
  table: {
    steps: [
      { art: "/stations/table.png", text: "잠깐 올려 두기", tip: "재료나 그릇을 한 칸 보관합니다. (행동력 1)" },
      { art: "/food/plate.png", text: "다시 집기", tip: "다른 슬라임에게 물건을 넘길 때 씁니다. (행동력 1)" },
    ],
  },
};

// 슬라임 "특징"에 붙일 그림. 이모지 대신 게임에 쓰는 에셋을 그대로 쓴다.
const traitArt: Record<string, string> = {
  "water-supply": "/ui/water.png",
  wash: "/stations/washer.png",
  "cook-heat": "/stations/oven.png",
  burn: "/stations/trash.png",
  "double-move": "/ui/energy.png",
  power: "/stations/blender-full.png",
  chop: KNIFE_ART,
};

const slimePortrait = (typeId: SlimeTypeId) =>
  typeId === "water"
    ? "/slimes/water.svg"
    : authoredSlimeAssets[typeId] ?? slimeDataUri(typeId, "down");

// 정산 숫자는 0에서부터 올라간다. 한 번에 찍히면 정산을 본 느낌이 없다.
function CountUp({ value, delay = 0, ms = 620 }: { value: number; delay?: number; ms?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const ratio = Math.min(1, Math.max(0, (now - start) / ms));
      setShown(Math.round(value * ratio));
      if (ratio < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, delay, ms]);
  return <>{shown}</>;
}

// 남은 행동력을 칸으로 보여 준다. 턴제에서 슬라임을 가르는 유일한 수치다.
function ActionPoints({ actor }: { actor: { typeId: SlimeTypeId; actionPoints: number } }) {
  const max = maxActionPoints(actor.typeId);
  return (
    <ul className="slime-stats">
      <li>
        <span>행동력</span>
        {/* 쓴 만큼 번개가 어두워진다. 칸 개수를 세지 않아도 남은 양이 보인다. */}
        <span
          className="energy-row"
          role="img"
          aria-label={`남은 행동력 ${actor.actionPoints} / ${max}`}
        >
          {Array.from({ length: max }, (_, cell) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={cell}
              className="energy-icon"
              src={cell < actor.actionPoints ? "/ui/energy.png" : "/ui/energy-off.png"}
              alt=""
              aria-hidden
            />
          ))}
        </span>
      </li>
    </ul>
  );
}

// 알맹이가 캔버스 한가운데에 있지 않은 그림은 그만큼 되민다. artAnchor의
// 값이 긴 변 대비 %라, 칸을 꽉 쓰는 contain 그림에서는 그대로 %로 옮기면
// 된다.
function anchorStyle(art: string) {
  const off = artAnchor[art];
  if (!off) return undefined;
  return { transform: `translate(${off.x}%, ${off.y}%)` };
}

// 완성 음식은 빈 접시에 올려 보여 준다. 그릇 없이 내는 음식(스무디)은
// 접시를 깔지 않는다.
function OrderDish({ foodId }: { foodId: ItemId }) {
  const art = foodImages[foodId];
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

// 설비를 대표하는 아이콘. 상자류는 담긴 재료 그림을 쓰고, 나머지는 설비
// 그림을 그대로 쓴다. 인게임과 같은 그림이라 바로 알아본다.
// 세척대·제출대처럼 가로로 긴 그림은 동그라미 안에서 유난히 작아 보인다.
// 그런 그림만 여백을 줄여 크게 앉힌다.
const wideStationArt: StationId[] = ["washer", "submission"];
// 인게임에서는 칼을 따로 움직여야 해서 도마를 판만 그린다. 판만 있으면
// 무엇인지 알기 어려우니 아이콘으로는 칼이 놓인 원래 그림을 쓴다.
const stationIconArt: Partial<Record<StationId, string>> = {
  stove: "/food/doma.png",
};

function StationIcon({ id }: { id: StationId }) {
  const art = stationIconArt[id] ?? stationBadgeArt[id] ?? stationArt[id];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art}
      alt=""
      aria-hidden
      style={anchorStyle(art)}
      data-wide={wideStationArt.includes(id) ? "" : undefined}
    />
  );
}

// 이 요리를 어떻게 만드는지 한눈에 알리는 그림. 믹서기만 물이 같이 든다.
const methodArt = (station: StationId): string[] =>
  station === "blender"
    ? ["/ui/water.png", blenderArt.empty]
    : [stationIconArt[station] ?? stationArt[station]];

// 주문 카드 한 장. 큰 칸에 완성 그림, 그 아래 재료, 그 아래 조리 방법이다.
function OrderCard({ order, next }: { order: Order; next?: boolean }) {
  const recipe = recipes[order.foodId];
  // 다음 주문은 무엇이 올지만 알리면 된다. 재료와 조리법까지 늘어놓으면 지금
  // 만들 것과 헷갈리므로, 궁금할 때만 마우스를 올려 주문서를 펼쳐 본다.
  if (next) {
    return (
      <article
        className="order-next"
        tabIndex={0}
        aria-label={`다음 주문 ${itemLabel(order.foodId)}`}
      >
        <small aria-hidden>NEXT</small>
        <OrderDish foodId={order.foodId} />
        <OrderCard order={order} />
      </article>
    );
  }
  return (
    <article className="order-card" aria-label={`${itemLabel(order.foodId)} 주문`}>
      <span className="order-plate">
        <OrderDish foodId={order.foodId} />
      </span>
      {recipe && (
        <>
          <span className="order-part order-part-item" aria-hidden>
            <i>
              {recipe.ingredients.map(({ itemId }) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={itemId}
                  src={foodImages[itemId]}
                  alt=""
                  style={anchorStyle(foodImages[itemId])}
                />
              ))}
            </i>
            <b>{recipe.ingredients.map(({ itemId }) => itemLabel(itemId)).join(" + ")}</b>
          </span>
          <span className="order-part order-method" aria-hidden>
            <i>
              {methodArt(recipe.station).map((art) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={art} src={art} alt="" style={anchorStyle(art)} />
              ))}
            </i>
            <b>{stationLabels[recipe.station]}</b>
          </span>
        </>
      )}
    </article>
  );
}

function OrderCards({ state }: { state: GameState }) {
  const orders = activeOrders(state);
  const upcoming = upcomingOrders(state);
  // 카드에는 무엇을 만들지만 둔다. 번호·개수·이름은 그림이 이미 말해 주고
  // 있어 글자로 또 적으면 읽을 것만 늘어난다.
  return (
    <section className="order-cards" aria-label="진행 중인 주문">
      {[0, 1].map((index) => {
        const order = orders[index];
        if (!order) return <span className="order-card order-card-empty" aria-hidden key={index} />;
        return <OrderCard order={order} key={order.id} />;
      })}
      {upcoming.map((order) => (
        <OrderCard order={order} next key={order.id} />
      ))}
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
    return { label: "반납된 그릇", have: state.dishReturns[id]!.length, max: dishConfig.returnCapacity };
  }
  if (type === "washer") {
    return { label: "세척 중인 그릇", have: state.washers[id]!.dishes.length, max: dishConfig.washerCapacity };
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

// 지금 이 설비에 올라와 있는 것. 테이블·조리대·세척대처럼 물건을 하나
// 얹어 두는 설비만 값이 나온다.
function stationHolding(state: GameState, id: StationInstanceId): Carried | null {
  const type = stationType(id);
  if (type === "table") return state.tables[id]![0] ?? null;
  if (isCooktop(type)) return state.stoves[id]![0] ?? null;
  if (type === "washer") return state.washers[id]!.dishes[0] ?? null;
  if (type === "blender") {
    const blender = state.blenders[id]!;
    return blender.food ?? blender.fruit;
  }
  if (type === "dish-return") return state.dishReturns[id]![0] ?? null;
  return null;
}

// 올려 둔 물건은 글자가 아니라 그림으로 보여 준다.
function CarriedArt({ carried }: { carried: Carried }) {
  const art = carriedArt(carried);
  return (
    <span className="carried-art" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {art.bg && <img src={art.bg} alt="" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {art.fg && <img src={art.fg} alt="" style={art.bg ? undefined : anchorStyle(art.fg)} />}
    </span>
  );
}

function StationHolding({ state, id }: { state: GameState; id: StationInstanceId }) {
  const held = stationHolding(state, id);
  if (!held) return null;
  return (
    <div className="station-holding">
      <b>올려 둔 것</b>
      <CarriedArt carried={held} />
      <small>{carriedLabel(held)}</small>
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
}: {
  state: GameState;
  target: InspectorTarget;
}) {
  if (target.kind === "actor") {
    const actor = state.actors[target.id];
    if (!actor) return null;
    const type = slimeTypes[actor.typeId];
    return (
      <aside className="game-inspector" data-type={actor.typeId} aria-label={`${actor.name} 정보`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="inspector-portrait" src={slimePortrait(actor.typeId)} alt="" />
        <h2>{actor.name}</h2>
        <p className="inspector-copy">{type.trait}</p>
        <ActionPoints actor={actor} />
        <h3>특징</h3>
        <div className="inspector-badges">
          {type.traits.map((one) => (
            // 자세한 설명은 마우스를 올리거나 키보드로 짚었을 때만 보여
            // 준다. 패널이 길어지면 정작 봐야 할 행동력과 재고가 밀린다.
            <span key={one.id} className="has-tip" data-tip={one.detail} tabIndex={0}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={traitArt[one.id]} alt="" aria-hidden style={anchorStyle(traitArt[one.id])} />
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
      <span className="inspector-station-icon" aria-hidden>
        <StationIcon id={type} />
      </span>
      <h2>{stationLabels[type]}</h2>
      <StationStock state={state} id={target.id} />
      <StationHolding state={state} id={target.id} />
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
        {/* 자세한 규칙은 마우스를 올리거나 키보드로 짚었을 때만 말풍선으로
            보여 준다. 항상 펼쳐 두면 패널이 길어져 아래가 잘린다. */}
        {info.steps.map((step) => (
          <span key={step.text} className="has-tip" data-tip={step.tip} tabIndex={0}>
            <i aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.art} alt="" style={anchorStyle(step.art)} />
            </i>
            <b>{step.text}</b>
          </span>
        ))}
      </div>
      <small className="inspector-hint">옆 칸에 선 슬라임을 고르고 설비를 클릭하면 사용합니다.</small>
    </aside>
  );
}

export default function Game() {
  const router = useRouter();
  const [squad, setSquad] = useState<SlimeTypeId[] | null>(null);
  const [progress, setProgress] = useState<ProgressData>(emptyProgress());
  const [stageId, setStageId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  // 턴제는 한 마리씩 조작한다. 선택은 늘 0마리 아니면 1마리다.
  const [selectedActor, setSelectedActor] = useState<ActorId | null>(null);
  const [inspected, setInspected] = useState<InspectorTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [banner, setBanner] = useState<keyof typeof bannerImages | null>(null);
  // 아르바이트를 시작할 때 한 번 나오는 인사. 이게 떠 있는 동안은 조작을 막는다.
  const [intro, setIntro] = useState(false);
  const [earthInfo, setEarthInfo] = useState(false);
  const [earthInfoComplete, setEarthInfoComplete] = useState(false);
  const [actionPointInfo, setActionPointInfo] = useState(false);
  const [actionPointInfoComplete, setActionPointInfoComplete] = useState(false);
  const [waterIntro, setWaterIntro] = useState(false);
  const [waterIntroComplete, setWaterIntroComplete] = useState(false);
  const [platedIntro, setPlatedIntro] = useState(false);
  const [platedIntroComplete, setPlatedIntroComplete] = useState(false);
  const [tutorialOutro, setTutorialOutro] = useState(false);
  const [tutorialComplete, setTutorialComplete] = useState(false);
  const [stageIntro, setStageIntro] = useState(false);
  const [finalOutro, setFinalOutro] = useState(false);
  const [finalComplete, setFinalComplete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // 대사 중에는 장면을 멈추지 않는다. 멈추면 뒤에 보여야 할 주방이 검게
  // 남는다. 조작은 대사 화면이 덮고 있어 어차피 닿지 않는다.
  const paused = settingsOpen;

  const stateRef = useRef(state);
  const selectedActorRef = useRef(selectedActor);
  const undoUiRef = useRef({
    earthInfoComplete,
    actionPointInfoComplete,
    waterIntroComplete,
    platedIntroComplete,
  });
  // 행동력을 다 쓴 슬라임도 상세 정보를 볼 수 있어야 한다. 수동으로 고른
  // 경우만 자동 넘김을 한 번 멈추고, 실제 행동 소진 뒤 자동 넘김은 유지한다.
  const manuallySelectedSpentActor = useRef<ActorId | null>(null);
  // 캔버스가 이름표를 띄울지 판단하는 데 쓴다.
  const inspectedRef = useRef(inspected);
  // 튜토리얼이 지금 짚는 설비. 캔버스가 그 자리에 표시를 그린다.
  const coachRef = useRef<StationId | StationInstanceId | null>(null);
  const tutorialCueRef = useRef<TutorialCue | null>(null);
  // 도입 대사가 짚는 슬라임. Phaser의 어두운 막보다 앞으로 올린다.
  const dialogueActorRef = useRef<ActorId | null>(null);
  // 화살표를 지도 위 실제 타일에 붙이려면 렌더에서도 알아야 해서 ref와 함께 둔다.
  const [dialogueActor, setDialogueActor] = useState<ActorId | null>(null);
  const view = useRef<View | null>(null);
  const metrics = useRef<Metrics>(emptyMetrics());
  const savedRef = useRef(false);
  const roundSeed = useRef(0);
  const closingBannerShown = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    selectedActorRef.current = selectedActor;
  }, [selectedActor]);

  useEffect(() => {
    undoUiRef.current = {
      earthInfoComplete,
      actionPointInfoComplete,
      waterIntroComplete,
      platedIntroComplete,
    };
  }, [earthInfoComplete, actionPointInfoComplete, waterIntroComplete, platedIntroComplete]);

  const chooseActor = useCallback((actorId: ActorId) => {
    setSelectedActor((current) => {
      const next = current === actorId ? null : actorId;
      selectedActorRef.current = next;
      manuallySelectedSpentActor.current =
        next && (stateRef.current?.actors[next]?.actionPoints ?? 0) === 0 ? next : null;
      return next;
    });
  }, []);

  const performActorAction = useCallback((
    actorId: ActorId,
    action: (current: GameState) => GameState,
  ) => {
    const before = stateRef.current;
    if (!before || before.phase !== "playing") return;
    const after = action(before);
    if ((after.actors[actorId]?.acts ?? 0) > (before.actors[actorId]?.acts ?? 0)) {
      setUndoSnapshot({
        state: structuredClone(before),
        selectedActor: selectedActorRef.current,
        ...undoUiRef.current,
      });
    }
    stateRef.current = after;
    setState(after);
  }, []);

  useEffect(() => {
    inspectedRef.current = inspected;
    view.current?.sync(stateRef.current!);
  }, [inspected]);

  // 튜토리얼이 지금 짚어야 할 자리. 지도에 표시를 그려야 해서 ref로도 둔다.
  const cue =
    state && state.phase === "playing" && !intro && !earthInfo && !actionPointInfo && !waterIntro &&
      !platedIntro && !tutorialOutro && onTutorialStage(state) &&
      (selectedActor !== "earth-1" || earthInfoComplete) &&
      (!waterIntroReady(state) || waterIntroComplete) &&
      (!platedIntroReady(state) || platedIntroComplete)
      ? tutorialCue(state, selectedActor, currentStage(state).turnLimit)
      : null;
  // 대사가 조작을 막고 있는 동안에는 턴도 멈춰야 한다. 대사 플래그는 상태가
  // 바뀐 다음 렌더에야 켜지므로, 대사를 띄우는 조건을 상태에서 그대로 다시
  // 잰다. 자동 넘김 쪽에 조건을 따로 적어 두면 대사가 늘 때마다 하나씩 빠져
  // 대사 뒤에서 턴이 넘어간다.
  const narrationHolds = Boolean(
    state && onTutorialStage(state) && (
      (selectedActor === "earth-1" && !earthInfoComplete) ||
      (!actionPointInfoComplete &&
        state.actors["earth-1"]?.actionPoints === 0 &&
        state.turnsLeft === currentStage(state).turnLimit) ||
      (waterIntroReady(state) && !waterIntroComplete) ||
      (platedIntroReady(state) && !platedIntroComplete)
    ),
  );
  const cueStation = cue?.station ?? null;
  useEffect(() => {
    coachRef.current = cueStation;
    tutorialCueRef.current = cue;
    if (stateRef.current) view.current?.sync(stateRef.current);
  }, [cue, cueStation]);

  useEffect(() => {
    if (!state || !tutorialDone(state) || tutorialComplete) return;
    setTutorialOutro(true);
    if (state.phase === "playing") setState(finishTutorial(state));
  }, [state, tutorialComplete]);

  useEffect(() => {
    if (!state || !onTutorialStage(state) || selectedActor !== "earth-1" || earthInfoComplete) return;
    setEarthInfo(true);
  }, [state, selectedActor, earthInfoComplete]);

  useEffect(() => {
    if (
      !state || !onTutorialStage(state) || actionPointInfoComplete ||
      state.actors["earth-1"]?.actionPoints !== 0 ||
      state.turnsLeft !== currentStage(state).turnLimit
    ) return;
    setActionPointInfo(true);
  }, [state, actionPointInfoComplete]);

  useEffect(() => {
    if (!state || !waterIntroReady(state) || waterIntroComplete) return;
    setWaterIntro(true);
  }, [state, waterIntroComplete]);

  useEffect(() => {
    if (!state || !platedIntroReady(state) || platedIntroComplete) return;
    setPlatedIntro(true);
  }, [state, platedIntroComplete]);

  useEffect(() => {
    if (!state || state.mode === "endless" || state.phase !== "won" || !isLastStage(state) || finalComplete) return;
    setFinalOutro(true);
  }, [state, finalComplete]);

  const showDialogueFocus = useCallback((focus: DialogueFocus | undefined) => {
    dialogueActorRef.current = focus === "earth" ? "earth-1" : null;
    setDialogueActor(dialogueActorRef.current);
    setInspected(focus === "inspector" ? { kind: "actor", id: "earth-1" } : null);
    if (stateRef.current) view.current?.sync(stateRef.current);
  }, []);

  useEffect(() => {
    setInspected((current) => selectedActor
      ? { kind: "actor", id: selectedActor }
      : current?.kind === "actor" ? null : current);
  }, [selectedActor]);

  // 판이 시작되면 "영업 시작", 남은 턴이 얼마 없으면 "마감 임박"을 한 번씩 띄운다.
  const startedStageId =
    state?.phase === "playing" ? currentStage(state).id : null;
  const closingSoon = state?.phase === "playing" && state.turnsLeft <= RUSH_TURNS_LEFT;
  const blockingNarration = intro || earthInfo || actionPointInfo || waterIntro ||
    platedIntro || tutorialOutro || stageIntro || finalOutro;
  useEffect(() => {
    closingBannerShown.current = false;
  }, [startedStageId]);
  // 인사가 끝난 뒤에 "영업 시작"을 띄운다. 대사 위에 겹쳐 뜨면 둘 다 묻힌다.
  useEffect(() => {
    if (startedStageId && !intro && !stageIntro) setBanner("start");
  }, [startedStageId, intro, stageIntro]);
  useEffect(() => {
    if (!closingSoon || closingBannerShown.current || banner || blockingNarration) return;
    closingBannerShown.current = true;
    setBanner("closing");
  }, [closingSoon, banner, blockingNarration]);
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
    if (state.mode === "shift") {
      // 최고 별만 남긴다. 못 깬 판도 0으로 적어야 다음 칸이 열리지 않는다.
      setProgress((current) => {
        const stars = withResult(
          current.stars,
          currentStage(state).id,
          roundRank(state),
        );
        const kept = { stars };
        writeProgress(kept);
        return kept;
      });
    }
    const counts = metrics.current;
    if (state.mode === "shift" && process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true") {
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
      }).catch(() => {});
    }
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
            idleMark: Phaser.GameObjects.Image;
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
      // 믹서기만 단계에 따라 그림이 통째로 바뀌어 따로 들고 있는다.
      blenders!: Partial<Record<StationInstanceId, {
        art: Phaser.GameObjects.Image;
        show: (key: string) => void;
      }>>;
      blenderHints!: Partial<Record<StationInstanceId, Phaser.GameObjects.Image>>;
      // 설비에 올라와 있는 재료·그릇 그림. 도마·화로·튀김기·테이블이 쓴다.
      holdings!: Partial<Record<StationInstanceId, {
        bg: Phaser.GameObjects.Image;
        fg: Phaser.GameObjects.Image;
        room: number;
      }>>;
      // 도마 위의 칼. 썰 때만 내려찍는다.
      knives!: Partial<Record<StationInstanceId, Phaser.GameObjects.Image>>;
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
      tutorialShade!: Phaser.GameObjects.Graphics;
      shownStageIndex!: number;

      // 그림을 정해진 칸 안에 넣는다. 긴 쪽을 기준으로 줄여 비율은
      // 그대로 둔다. 늘리거나 눌러 담지 않는다.
      fitInto(image: Phaser.GameObjects.Image, width: number, height = width) {
        return image.setScale(
          Math.min(width / image.width, height / image.height),
        );
      }

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

      // 도마질. 칼자루를 축으로 날을 들었다 내려찍고 제자리로 돌아온다.
      chop(id: StationInstanceId) {
        const knife = this.knives[id];
        if (!knife) return;
        this.tweens.killTweensOf(knife);
        knife.setAngle(0);
        this.tweens.chain({
          targets: knife,
          tweens: [
            { angle: -34, duration: 130, ease: "Quad.easeOut" },
            { angle: 6, duration: 90, ease: "Quad.easeIn" },
            { angle: 0, duration: 140, ease: "Sine.easeOut" },
          ],
        });
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
          sprite.body.setDepth(dialogueActorRef.current === actorId ? 9001 : y);
          sprite.selected.setPosition(x, y + 14).setDepth(y - 1);
          sprite.nameTag.setPosition(x, y + 26).setDepth(1000);
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
          ...Object.values(blenderArt),
          ...Object.values(foodImages),
          KNIFE_ART,
          DIRTY_PLATE_ART,
          "/stations/trash-full.png",
          "/ui/question.png",
          "/ui/water.png",
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
        this.tutorialShade = this.add.graphics().setDepth(9000).setVisible(false);
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
        this.holdings = {};
        this.knives = {};
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
          // 그림 한가운데가 아니라 알맹이 한가운데를 칸에 맞춘다. artAnchor는
          // 긴 변 대비 %라 그림을 칸에 맞춘 배율과 함께 곱한다.
          const nudge = (image: Phaser.GameObjects.Image, key: string) => {
            const off = artAnchor[key];
            if (!off) return image;
            const span = Math.max(image.width, image.height) / 100;
            return image.setPosition(
              image.x + off.x * span * image.scaleX,
              image.y + off.y * span * image.scaleY,
            );
          };
          if (style.onTable) {
            const under = this.add
              .image(x, y, "/stations/table.png")
              .setScale(Math.min(width / 230, height / 226))
              .setDepth(y);
            nudge(under, "/stations/table.png");
          }
          const art = this.add
            .image(x, y - lift, stationArt[type])
            .setDepth(y + (style.onTable ? 2 : 1));
          fit(art);
          nudge(art, stationArt[type]);
          if (type === "blender") {
            // 단계마다 전용 그림으로 통째로 갈아 끼운다. 네 장이 같은 자리·
            // 같은 크기라 갈아 끼워도 기계가 움직이지 않는다.
            this.blenders[id] = {
              art,
              show: (key: string) => {
                if (art.texture.key === key) return;
                art.setTexture(key);
                fit(art);
              },
            };
            // 물이 필요할 때 띄우는 안내 아이콘. 물방울 그림 비율 그대로.
            const hint = this.add
              .image(x + TILE_SIZE / 2 - 6, y - lift - 10, "/ui/water.png")
              .setOrigin(0.5)
              .setDepth(y + 3)
              .setVisible(false);
            this.fitInto(hint, 16, 20);
            this.blenderHints[id] = hint;
          }
          if (type === "stove") {
            // 칼은 도마에서 떼어 낸 조각이라 도마 그림 좌표로 자리를 잡는다.
            // 칼자루 끝을 축으로 두어 날만 내려오게 한다.
            const knife = this.add
              .image(
                art.x + KNIFE_OFFSET.x * art.scaleX,
                art.y + KNIFE_OFFSET.y * art.scaleY,
                KNIFE_ART,
              )
              .setOrigin(KNIFE_PIVOT.x, KNIFE_PIVOT.y)
              .setScale(art.scaleX)
              .setDepth(y + 2.5);
            this.knives[id] = knife;
          }
          // 재료·완성품·그릇을 올려 두는 설비는 올라온 것을 그림으로 보여
          // 준다. 그릇은 접시 위에 음식을 얹어 두 장으로 그린다.
          if (isCooktop(type) || type === "table" || type === "washer") {
            // 기구 그림이 칸 한가운데에서 밀려 있으면 올려 둔 것도 같이
            // 밀려야 기구 위에 놓인 것처럼 보인다.
            const room = TILE_SIZE * (type === "table" ? 0.66 : 0.42);
            const spot = { x: art.x, y: art.y - (isCooktop(type) ? 2 : 0) };
            this.holdings[id] = {
              bg: this.add.image(spot.x, spot.y, DIRTY_PLATE_ART).setDepth(y + 2.2).setVisible(false),
              fg: this.add.image(spot.x, spot.y, DIRTY_PLATE_ART).setDepth(y + 2.3).setVisible(false),
              room,
            };
          }
          const itemArt = stationBadgeArt[type];
          if (itemArt) {
            // 상자 그림 가운데 흰 원 자리에 내용물을 얹는다. 원 지름과 위치를
            // 그림 배율에 맞춰 재므로 어떤 재료 그림이든 원 안에 들어간다.
            const k = art.scaleX;
            const badge = this.add
              .image(art.x + BOX_BADGE.dx * k, art.y + BOX_BADGE.dy * k, itemArt)
              .setDepth(y + 2);
            this.fitInto(badge, BOX_BADGE.diameter * k * 0.82);
            // 감자처럼 알맹이가 캔버스 한가운데에 없는 그림은 되민다.
            nudge(badge, itemArt);
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
            .setDepth(1000)
            .setVisible(false);
          this.add
            .zone(x, y, width, height)
            .setDepth(4)
            .setInteractive()
            // 쓸 수 있으면 손, 옆에 서 있는데 안 되면 "?", 그 밖에는 기본
            // 화살표. 상호작용 테두리 색과 같은 판정을 쓴다.
            .on("pointerover", () => {
              const ok = this.usable[id];
              this.input.setDefaultCursor(
                ok === undefined ? CURSOR_ARROW : ok ? CURSOR_HAND : CURSOR_ASK,
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
                const actorId = selectedActorRef.current;
                const current = stateRef.current;
                if (current && !tutorialAllowsStation(current, tutorialCueRef.current, actorId, id)) {
                  return;
                }
                setInspected({ kind: "station", id });
                if (!actorId) return;
                // 선택한 슬라임이 있으면 거리와 무관하게 상호작용 시도다.
                // 멀면 코어의 기존 거절 이유를 띄우고 선택은 유지한다.
                metrics.current.buttonCommands += 1;
                performActorAction(actorId, (value) => interactActor(value, actorId, id));
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
        this.shownStageIndex = current?.stageIndex ?? 0;
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
                chooseActor(actorId);
              },
            );
          // 손에 든 것 표시 칸. 한 번에 하나만 들지만 배열로 두면 표시
          // 코드가 그대로다.
          // 그림마다 가로세로가 달라 칸에 맞춰 줄이기만 한다. 늘려 담으면
          // 버섯이나 딸기가 길쭉해진다.
          const carried = Array.from({ length: 1 }, () => ({
            bg: this.add.image(spot.x, spot.y, stationBadgeArt["dish-rack"]!).setOrigin(0.5).setVisible(false),
            fg: this.add.image(spot.x, spot.y, stationBadgeArt["dish-rack"]!).setOrigin(0.5).setVisible(false),
          }));
          const selected = this.add
            .circle(spot.x, spot.y + 14, 30)
            .setStrokeStyle(3, typeColors[actor.typeId], 0.95)
            .setFillStyle(typeColors[actor.typeId], 0.12)
            .setDepth(spot.y - 1)
            .setVisible(false);
          // "아직 시킬 일이 남았다"는 표시. 고른 슬라임에는 띄우지 않는다.
          const idleMark = this.add
            .image(spot.x + 18, spot.y - 30, "/ui/question.png")
            .setOrigin(0.5)
            .setAlpha(0.9)
            .setDepth(spot.y + 3)
            .setVisible(false);
          this.fitInto(idleMark, 14, 20);
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
            facing: actor.facing,
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
        // 바닥을 클릭했을 때. 이동 가능 표시가 뜬 칸이면 그리로 가고,
        // 아니면 선택을 푼다.
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!fromCanvas(pointer) || !pointer.leftButtonDown()) return;
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          const tile = pixelToTile(point.x, point.y);
          const current = stateRef.current;
          const actorId = selectedActorRef.current;
          const guided = current && actorId
            ? tutorialMoveOptions(current, actorId, tutorialCueRef.current)
            : [];
          if (
            current &&
            actorId &&
            guided.some(
              (target) => target.col === tile.col && target.row === tile.row,
            )
          ) {
            metrics.current.buttonCommands += 1;
            performActorAction(actorId, (value) => moveActor(value, actorId, tile));
            return;
          }
          if (current && actorId && onTutorialStage(current) && tutorialCueRef.current) {
            return;
          }
          setSelectedActor(null);
          setInspected(null);
        });

        // 하이라이트는 테이블 상판보다 앞, 상판 위 기구·음식보다 뒤에 둔다.
        // 칸 줄(y)마다 따로 둬 아래쪽 슬라임의 y 정렬은 그대로 지킨다.
        const marks = new Map<number, Phaser.GameObjects.Graphics>();
        const markAt = (y: number) => {
          const found = marks.get(y);
          if (found) return found;
          const made = this.add.graphics().setDepth(y + 1.5);
          marks.set(y, made);
          return made;
        };
        // 튜토리얼이 짚는 자리. 깜박여서 눈에 먼저 들어오게 한다.
        const coachMarks = this.add.graphics().setDepth(710);
        this.tweens.add({
          targets: coachMarks,
          alpha: { from: 1, to: 0.25 },
          duration: 620,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });

        view.current = {
          sync: (current) => {
            const shown = inspectedRef.current;
            const focusedActor = dialogueActorRef.current;
            const stageChanged = current.stageIndex !== this.shownStageIndex;
            this.shownStageIndex = current.stageIndex;
            this.tutorialShade.clear().setVisible(Boolean(focusedActor));
            if (focusedActor) {
              this.tutorialShade
                .fillStyle(0x120a05, 0.66)
                .fillRect(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
            }
            // 튜토리얼이 아직 소개하지 않은 슬라임은 지도에서도 감춘다.
            const revealed = activeActorIds(current);
            for (const actorId of roster) {
              const actor = current.actors[actorId];
              const sprite = this.slimes[actorId];
              if (!actor || !sprite) continue;
              const visible = revealed.includes(actorId);
              sprite.body.setVisible(visible);
              if (!visible) {
                sprite.carried.forEach((slot) => {
                  slot.bg.setVisible(false);
                  slot.fg.setVisible(false);
                });
                sprite.selected.setVisible(false);
                sprite.idleMark.setVisible(false);
                sprite.nameTag.setVisible(false);
                continue;
              }
              const spot = tileCenter(actor);
              const restoring = stageChanged || actor.acts < sprite.acts;
              if (actor.facing !== sprite.facing) {
                sprite.facing = actor.facing;
                this.paintSlime(actorId);
              }
              if (restoring) {
                sprite.walking?.stop();
                sprite.motion.stop();
                sprite.visual.setAngle(0).setY(0);
                sprite.motion = this.breathe(sprite.visual, sprite.scale);
                sprite.body.setPosition(spot.x, spot.y);
                sprite.last = { x: spot.x, y: spot.y };
                sprite.acts = actor.acts;
              }
              // 행동은 즉시 끝나므로 한 번 행동할 때마다 모션을 잠깐 재생하고
              // 숨쉬기로 돌아간다. acts가 늘어난 것이 행동했다는 신호다.
              if (actor.acts > sprite.acts) {
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
              if (!restoring && (sprite.last.x !== spot.x || sprite.last.y !== spot.y)) {
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
                if (art?.bg) this.fitInto(slot.bg.setTexture(art.bg), 24);
                slot.fg.setVisible(Boolean(art?.fg));
                if (art?.fg) this.fitInto(slot.fg.setTexture(art.fg), art.bg ? 17 : 22);
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
            for (const layer of marks.values()) layer.clear();
            coachMarks.clear();
            const coached = coachRef.current
              ? stationInstances.find(
                  (one) => one.id === coachRef.current || one.type === coachRef.current,
                )
              : undefined;
            if (coached) {
              const first = tileCenter(coached.tiles[0]!);
              const last = tileCenter(coached.tiles[coached.tiles.length - 1]!);
              const width = Math.abs(last.x - first.x) + TILE_SIZE + 6;
              const height = Math.abs(last.y - first.y) + TILE_SIZE + 6;
              const x = (first.x + last.x) / 2 - width / 2;
              const y = (first.y + last.y) / 2 - height / 2;
              coachMarks
                .fillStyle(0xffd46b, 0.22)
                .fillRoundedRect(x, y, width, height, 10)
                .lineStyle(6, 0xffd46b, 1)
                .strokeRoundedRect(x, y, width, height, 10)
                .lineStyle(3, 0x4a2a12, 0.9)
                .strokeRoundedRect(x - 4, y - 4, width + 8, height + 8, 12);
            }
            const selected = selectedActorRef.current;
            // 지금 고른 슬라임이 쓸 수 있는 설비. 코어를 한 번 돌려 보고
            // 거절당하는지로 판단해서, 화면이 규칙을 따로 흉내내지 않는다.
            this.usable = {};
            if (selected) {
              const actor = current.actors[selected];
              const moveColor = actor ? typeColors[actor.typeId] : 0xffe9b8;
              // 번개 슬라임은 행동력이 2라 두 칸까지 닿는다. 한 칸 더 가는
              // 자리는 조금 옅게 그려 몇 칸짜리인지 눈으로 알게 한다.
              for (const tile of tutorialMoveOptions(current, selected, tutorialCueRef.current)) {
                const { x, y } = tileCenter(tile);
                const far = tile.cost > actionCost.move;
                markAt(y)
                  .fillStyle(moveColor, far ? 0.12 : 0.22)
                  .fillRect(x - 24, y - 24, 48, 48)
                  .lineStyle(2, moveColor, far ? 0.5 : 0.85)
                  .strokeRect(x - 24, y - 24, 48, 48);
              }
              for (const station of actor && actor.actionPoints > 0 ? stationInstances : []) {
                if (!actor || !isBesideStation(actor, station)) continue;
                if (!tutorialAllowsStation(current, tutorialCueRef.current, selected, station.id)) continue;
                const after = interactActor(current, selected, station.id);
                const ok = (after.refusal?.seq ?? -1) === (current.refusal?.seq ?? -1);
                this.usable[station.id] = ok;
                const first = tileCenter(station.tiles[0]);
                const last = tileCenter(station.tiles[station.tiles.length - 1]);
                const x = (first.x + last.x) / 2;
                const y = (first.y + last.y) / 2;
                const width = Math.abs(last.x - first.x) + TILE_SIZE - 8;
                const height = Math.abs(last.y - first.y) + TILE_SIZE - 8;
                // 여러 칸을 차지하는 기구는 제일 아래 칸을 기준으로 삼는다.
                markAt(Math.max(first.y, last.y))
                  .lineStyle(3, ok ? 0x8ed07a : 0xd75f4c, 0.95)
                  .strokeRect(x - width / 2, y - height / 2, width, height)
                  .lineStyle(1, 0x1c0f07, 0.5)
                  .strokeRect(x - width / 2 - 2, y - height / 2 - 2, width + 4, height + 4);
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
                : isCooktop(type)
                  ? workstation!.progress > 0
                    ? `${workStatusLabels.WORKING} ${workstation!.progress}/${actionCost.chop}`
                    // 비어 있다는 말은 그림만 봐도 안다. 완성했을 때만 알린다.
                    : workstation!.status === "COMPLETE"
                      ? workStatusLabels.COMPLETE
                      : ""
                  : type === "washer"
                    ? washer!.progress > 0
                      ? `세척 ${washer!.progress}/${actionCost.wash}`
                      : washer!.dishes.some((dish) => dish.status === "clean")
                        ? "세척 완료"
                        : washer!.dishes.length
                          ? "세척 대기"
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
                    : type === "dish-return"
                      ? ([current.dishReturns[id]!.length, dishConfig.returnCapacity] as const)
                      : type === "washer"
                        ? ([washer!.dishes.length, dishConfig.washerCapacity] as const)
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
                // 빈 병 → 과일 → 과일과 물 → 스무디. 단계마다 전용 그림이다.
                const stage = blenderStage(blender);
                view.show(blenderArt[stage]);
                // 과일만 들어간 믹서기는 물이 필요하다는 것을 아이콘으로 알린다.
                this.blenderHints[id]!.setVisible(stage === "needs-water");
              }
              // 설비에 올라온 물건. 튀김기에 넣은 감자도, 테이블에 둔 그릇도
              // 글자가 아니라 그림으로 보인다.
              const holding = this.holdings[id];
              if (holding) {
                const held =
                  type === "table"
                    ? current.tables[id]![0]
                    : type === "washer"
                      ? current.washers[id]!.dishes[0]
                      : current.stoves[id]![0];
                const art = held ? carriedArt(held) : null;
                holding.bg.setVisible(Boolean(art?.bg));
                if (art?.bg) this.fitInto(holding.bg.setTexture(art.bg), holding.room);
                holding.fg.setVisible(Boolean(art?.fg));
                if (art?.fg) this.fitInto(
                  holding.fg.setTexture(art.fg),
                  art.bg ? holding.room * 0.64 : holding.room,
                );
              }
            }
            // 설비에서 무슨 일이 일어났는지 파티클로 한 번 보여 준다.
            // 상태를 저장하지 않고 바뀐 것만 골라 터뜨린다.
            for (const station of stationInstances) {
              const { id, type, tiles } = station;
              const seen = this.stationMarks[id];
              const now =
                isCooktop(type)
                  ? `${current.stoves[id]!.join()}/${current.workstations[id]!.status}/${current.workstations[id]!.progress}`
                  : type === "blender"
                    ? blenderStage(current.blenders[id]!)
                    : type === "washer"
                      ? current.washers[id]!.dishes.map((dish) => dish.status).join() || "-"
                      : type === "trash"
                        ? `${current.incinerators[id]!.count}`
                        : type === "submission"
                          ? `${current.filled}`
                          : "";
              this.stationMarks[id] = now;
              if (seen === undefined || seen === now || !now) continue;
              const spot = tileCenter(tiles[0]);
              const y = spot.y - (this.stationLift[id] ?? 0);
              if (isCooktop(type)) {
                // 도마는 칼이 실제로 내려찍는다. 썰고 있을 때만이다.
                const status = current.workstations[id]!.status;
                if (type === "stove" && (status === "WORKING" || status === "COMPLETE")) {
                  this.chop(id);
                }
                if (current.workstations[id]!.status === "COMPLETE") {
                  this.burst(spot.x, y, 0xfff0b8, 12);
                }
              } else if (type === "blender") {
                const stage = blenderStage(current.blenders[id]!);
                if (stage === "ready") this.burst(spot.x, y, 0x7fd4ff, 10);
                if (stage === "done") this.burst(spot.x, y, 0xff8fc4, 16, 130);
              } else if (
                type === "washer" &&
                current.washers[id]!.dishes.some((dish) => dish.status === "clean")
              ) {
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
  }, [squad, chooseActor, performActorAction]);

  // 저장된 별은 브라우저에만 있어 첫 렌더 뒤에 읽는다.
  useEffect(() => {
    setProgress(readProgress());
  }, []);

  // 캔버스 글자는 웹폰트를 알아서 받아 오지 못한다. 구글 폰트는 글자 묶음별로
  // 파일이 갈려 있어, DOM에 안 쓰인 글자("땅" 같은)만 다른 글꼴로 튀어 보인다.
  // 캔버스에 그릴 글자를 미리 한 번 받아 둔다.
  useEffect(() => {
    const words = [
      ...Object.values(stationLabels),
      ...allTypeIds.map((typeId) => slimeTypes[typeId].name),
      ...Object.values(workStatusLabels),
      "1234567890호개세척완료대기중",
    ].join("");
    document.fonts?.load(`12px Jua`, words).catch(() => {});
  }, []);

  function startRound(list: SlimeTypeId[], id: string = stageId ?? "0") {
    const index = Math.max(0, stageIndexOf(id));
    const next = id === "endless"
      ? initialEndlessState(2026, list)
      : prepareTutorialState(initialState(2026, list, defaultStages(), index));
    setStageId(id);
    metrics.current = emptyMetrics();
    savedRef.current = false;
    roundSeed.current = next.seed;
    setUndoSnapshot(null);
    manuallySelectedSpentActor.current = null;
    setSelectedActor(null);
    setInspected(null);
    setSettingsOpen(false);
    setEarthInfo(false);
    setEarthInfoComplete(id !== "0");
    setActionPointInfo(false);
    setActionPointInfoComplete(id !== "0");
    setWaterIntro(false);
    setWaterIntroComplete(id !== "0");
    setPlatedIntro(false);
    setPlatedIntroComplete(id !== "0");
    setTutorialOutro(false);
    setStageIntro(false);
    setFinalOutro(false);
    setFinalComplete(false);
    setTutorialComplete(id !== "0");
    setState(next);
    setSquad(list);
  }

  const finishTurn = useCallback(() => {
    manuallySelectedSpentActor.current = null;
    setState((value) => {
      if (!value) return value;
      const next = endTurn(value);
      stateRef.current = next;
      // 튜토리얼은 대사가 지목한 슬라임을 이어서 고르고, 일반 판은 첫 번째로
      // 행동할 수 있는 슬라임을 고른다.
      const guided = onTutorialStage(next)
        ? tutorialCue(next, null, currentStage(next).turnLimit)?.actor
        : null;
      const first = [...(guided ? [guided] : []), ...activeActorIds(next)].find(
        (id) => (next.actors[id]?.actionPoints ?? 0) > 0,
      );
      setSelectedActor(first ?? null);
      return next;
    });
  }, []);

  const undoLastAction = useCallback(() => {
    if (
      !undoSnapshot || stateRef.current?.phase !== "playing" ||
      settingsOpen || blockingNarration
    ) return;
    const restored = undoSnapshot;
    setUndoSnapshot(null);
    stateRef.current = restored.state;
    selectedActorRef.current = restored.selectedActor;
    manuallySelectedSpentActor.current =
      restored.selectedActor &&
      (restored.state.actors[restored.selectedActor]?.actionPoints ?? 0) === 0
        ? restored.selectedActor
        : null;
    setEarthInfo(false);
    setActionPointInfo(false);
    setWaterIntro(false);
    setPlatedIntro(false);
    setEarthInfoComplete(restored.earthInfoComplete);
    setActionPointInfoComplete(restored.actionPointInfoComplete);
    setWaterIntroComplete(restored.waterIntroComplete);
    setPlatedIntroComplete(restored.platedIntroComplete);
    setSelectedActor(restored.selectedActor);
    setInspected(restored.selectedActor ? { kind: "actor", id: restored.selectedActor } : null);
    setToast(null);
    setState(restored.state);
  }, [undoSnapshot, settingsOpen, blockingNarration]);

  useEffect(() => {
    if (state && state.phase !== "playing") setUndoSnapshot(null);
  }, [state]);

  // 방금 행동력을 다 쓴 슬라임에서 다음 마리로 넘긴다. 모두 지치거나 쉬기로
  // 했으면 튜토리얼과 일반 게임 모두 다음 턴을 자동으로 시작한다.
  useEffect(() => {
    if (!state || state.phase !== "playing" || !squad || !selectedActor) return;
    if (tutorialDone(state)) return;
    // 소개 대사가 떠 있는 동안에는 선택도 턴도 넘기지 않는다.
    if (narrationHolds) return;
    const left = state.actors[selectedActor]?.actionPoints ?? 0;
    if (left > 0) return;
    if (manuallySelectedSpentActor.current === selectedActor) return;
    const next = nextReadyActor(
      state,
      activeActorIds(state),
      selectedActor,
    );
    if (next) setSelectedActor(next);
    else finishTurn();
  }, [state, selectedActor, squad, finishTurn, narrationHolds]);

  useEffect(() => {
    if (!squad) return;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName);
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return;
      if (event.code === "Escape") {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }
      if (event.code === "KeyZ") {
        event.preventDefault();
        undoLastAction();
        return;
      }
      // 스페이스바는 화면의 턴 종료 버튼과 같은 동작만 한다.
      if (event.code === "Space") {
        if (settingsOpen || blockingNarration) return;
        const current = stateRef.current;
        if (!current || current.phase !== "playing") return;
        const currentCue = tutorialCueRef.current;
        if (currentCue && !currentCue.endTurn) return;
        event.preventDefault();
        // 버튼에 포커스가 남아 있으면 스페이스가 그 버튼까지 눌러
        // "턴 종료"가 같이 실행된다. 포커스를 먼저 놓는다.
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.tagName === "BUTTON") {
          active.blur();
        }
        finishTurn();
      }
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [settingsOpen, squad, finishTurn, undoLastAction, blockingNarration]);

  // 판을 고르기 전에는 선택 화면을 보여 준다.
  if (!squad || !state) {
    return (
      <>
        <Music src="/music/home.mp3" />
        <StageSelect
          progress={progress.stars}
          // 열린 스테이지를 직접 골라 시작하고, 승리하면 다음 판으로 이어 간다.
          onPick={(id) => {
            setIntro(id === "0");
            startRound(allTypeIds, id);
            if (id !== "0" && id !== "endless") setStageIntro(true);
          }}
          onBack={() => router.push("/")}
        />
      </>
    );
  }

  const result =
    state.mode === "endless"
      ? `무한 모드 종료! 최종 점수 ${state.filled}점`
      : state.phase === "lost"
      ? "영업 종료. 주문을 다 채우지 못했습니다."
      : currentStage(state).id === "0"
        ? "튜토리얼 클리어!"
        : `${currentStage(state).id} 스테이지 클리어!`;
  // 튜토리얼 중에는 아직 소개하지 않은 슬라임을 버튼에서도 지도에서도 뺀다.
  // 한 번에 하나씩 알려 주기 위해서다.
  const roster = activeActorIds(state);
  // 아직 행동력이 남은 슬라임. 턴 종료 버튼이 이걸 알려 준다.
  const readyCount = roster.filter(
    (actorId) => (state.actors[actorId]?.actionPoints ?? 0) > 0,
  ).length;
  const canUndo = Boolean(
    undoSnapshot && state.phase === "playing" && !settingsOpen && !blockingNarration,
  );
  const rank = roundRank(state);
  const turnAngle = Math.max(0, 360 * (1 - state.turnsLeft / currentStage(state).turnLimit));
  const coachedStation = cue?.station
    ? stationInstances.find((one) => one.id === cue.station || one.type === cue.station)
    : null;
  const coachTiles = coachedStation?.tiles ?? (cue?.actor && state.actors[cue.actor] ? [state.actors[cue.actor]!] : []);

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
          onRetry={() => startRound(squad, currentStage(state).id)}
          onOpenChange={(open) => {
            setSettingsOpen(open);
          }}
        />

        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="stage-banner"
            key={banner}
            src={bannerImages[banner]}
            alt={banner === "start" ? "영업 시작" : "마감 임박"}
          />
        )}

        {intro && (
          <Dialogue
            key="tutorial-opening"
            lines={openingLines}
            portrait={slimePortrait}
            onFocusChange={showDialogueFocus}
            onDone={() => {
              showDialogueFocus(undefined);
              setIntro(false);
            }}
          />
        )}

        {earthInfo && (
          <Dialogue
            key="tutorial-earth-info"
            lines={earthInfoLines}
            portrait={slimePortrait}
            onFocusChange={showDialogueFocus}
            onDone={() => {
              showDialogueFocus(undefined);
              setEarthInfo(false);
              setEarthInfoComplete(true);
            }}
          />
        )}

        {actionPointInfo && (
          <Dialogue
            key="tutorial-action-points"
            lines={actionPointLines}
            portrait={slimePortrait}
            narration
            onFocusChange={showDialogueFocus}
            onDone={() => {
              showDialogueFocus(undefined);
              setActionPointInfo(false);
              setActionPointInfoComplete(true);
              finishTurn();
            }}
          />
        )}

        {waterIntro && (
          <Dialogue
            key="tutorial-water-arrival"
            lines={waterArrivalLines}
            portrait={slimePortrait}
            onDone={() => {
              setWaterIntro(false);
              setWaterIntroComplete(true);
              finishTurn();
            }}
          />
        )}

        {platedIntro && (
          <Dialogue
            key="tutorial-plated-food"
            lines={platedFoodLines}
            portrait={slimePortrait}
            onDone={() => {
              setPlatedIntro(false);
              setPlatedIntroComplete(true);
            }}
          />
        )}

        {tutorialOutro && (
          <Dialogue
            key="tutorial-complete"
            lines={tutorialCompleteLines}
            portrait={slimePortrait}
            onFocusChange={showDialogueFocus}
            onDone={() => {
              showDialogueFocus(undefined);
              setTutorialOutro(false);
              setTutorialComplete(true);
            }}
          />
        )}

        {stageIntro && (
          <Dialogue
            key={`stage-${currentStage(state).id}`}
            lines={stageOpeningLines(currentStage(state).id)}
            portrait={slimePortrait}
            onFocusChange={showDialogueFocus}
            onDone={() => {
              showDialogueFocus(undefined);
              setStageIntro(false);
            }}
          />
        )}

        {finalOutro && (
          <Dialogue
            key="final-outro"
            lines={finalLines}
            portrait={slimePortrait}
            onDone={() => {
              setFinalOutro(false);
              setFinalComplete(true);
            }}
          />
        )}

        <OrderCards state={state} />

        <div className="hud-top" aria-label="라운드 정보">
          <span
            className="hud-chip"
            data-warn={state.turnsLeft <= RUSH_TURNS_LEFT ? "" : undefined}
            style={{ "--turn-elapsed": `${turnAngle}deg` } as CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="turn-wood" src="/ui/turn-wood.png" alt="" aria-hidden />
            <span className="hud-chip-copy">남은 턴 <b>{state.turnsLeft}</b></span>
            <span className="turn-clock" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ui/turn-clock.svg" alt="" />
              <i className="turn-clock-face" />
            </span>
          </span>
        </div>

        {toast && (
          <p className="action-toast" role="status" aria-live="polite">
            {toast}
          </p>
        )}

        {cue && (
          <Dialogue
            key={cue.id}
            lines={[{ speaker: cue.speaker, text: cue.text }]}
            portrait={slimePortrait}
            passive
          />
        )}

        {/* 대사가 푸름이를 짚을 때. 타일 크기는 화면 비율마다 달라지므로
            안내 화살표와 같은 좌표계를 써야 슬라임 위에 안 뜬다. */}
        {dialogueActor && state.actors[dialogueActor] && (
          <span className="coach-map coach-map-over-dialogue" aria-hidden>
            <i className="coach-map-stage">
              <FixedCoachArrow
                key={dialogueActor}
                layout={arrowLayoutFor("SELECT_EARTH")}
                tiles={[state.actors[dialogueActor]!]}
              />
            </i>
          </span>
        )}

        {/* 자리를 못 찾으면 아예 그리지 않는다. 빈 style로 그리면 화살표가
            지도 왼쪽 위 구석에 붙는다. */}
        {cue && coachTiles.length > 0 && !cue.endTurn && arrowLayoutFor(cue.id) && (
          <span className="coach-map" aria-hidden>
            <i className="coach-map-stage">
              <FixedCoachArrow
                key={cue.id}
                layout={arrowLayoutFor(cue.id)}
                tiles={coachTiles}
              />
            </i>
          </span>
        )}

        <div className="hud-bottom">
          <div className="turn-bar" aria-label="슬라임 행동력">
            {roster.map((actorId) => {
              const actor = state.actors[actorId];
              if (!actor) return null;
              return (
                <button
                  type="button"
                  className="roster-button"
                  key={actorId}
                  data-type={actor.typeId}
                  data-coach={actionPointInfo || cue?.actor === actorId ? "" : undefined}
                  data-spent={actor.actionPoints === 0 ? "" : undefined}
                  aria-label={`${actor.name} 선택, 남은 행동력 ${actor.actionPoints}`}
                  aria-pressed={selectedActor === actorId}
                  onClick={() => chooseActor(actorId)}
                >
                  {/* 슬라임 몸이 버튼 배경이다. 얼굴 그대로 두고 위에는
                      남은 에너지만 얹는다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="roster-slime"
                    src={slimePortrait(actor.typeId)}
                    alt=""
                    aria-hidden
                  />
                  <span className="energy-row">
                    {Array.from({ length: maxActionPoints(actor.typeId) }, (_, cell) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={cell}
                        className="energy-icon"
                        src={cell < actor.actionPoints ? "/ui/energy.png" : "/ui/energy-off.png"}
                        alt=""
                        aria-hidden
                      />
                    ))}
                  </span>
                  <b className="roster-name">{actor.name}</b>
                </button>
              );
            })}
            <button
              type="button"
              className="turn-undo turn-control art-button"
              disabled={!canUndo}
              onClick={undoLastAction}
              aria-label="마지막 행동 되돌리기, Z"
            >
              <b>되돌리기</b>
              <small>[Z]</small>
            </button>
            <button
              type="button"
              className="turn-end turn-control art-button"
              data-coach={cue?.endTurn ? "" : undefined}
              onClick={() => {
                if (cue && !cue.endTurn) {
                  return;
                }
                finishTurn();
              }}
              aria-label={`턴 종료, 행동력이 남은 슬라임 ${readyCount}마리`}
            >
              <b>턴 종료</b>
              <small>[Space]</small>
            </button>
          </div>

        </div>

        <div className="info-rail" role="complementary" aria-label="선택 정보 영역">
          {inspected && (
            <GameInspector state={state} target={inspected} />
          )}
        </div>


      </div>

      {state.phase !== "playing" && !tutorialOutro && !finalOutro &&
        !(state.mode === "shift" && state.phase === "won" && isLastStage(state) && !finalComplete) && (
        <section
          className="result-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          {/* 나무 액자 그림이 창 전체다. 제목은 위 리본, 나머지는 종이 안에 온다. */}
          <div className="paper-window">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={`result-title-art paper-title${state.phase === "lost" ? " result-title-art-game-over" : " result-title-art-business-end"}`}
              src={state.phase === "lost" ? "/text/game-over-title.png" : "/text/business-end-title.png"}
              alt={state.phase === "lost" ? "게임 오버" : "영업 종료"}
            />
            <div className="paper-body">
            <h2 id="result-title">
              {state.mode === "endless" ? (
                result
              ) : state.phase === "won" ? (
                <>
                  <span className="sr-only">{result}</span>
                  {currentStage(state).id === "0" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="result-clear-tutorial" src="/ui/tutorial-clear.png" alt="" aria-hidden />
                  ) : (
                    <span className="result-clear-stage" aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/ui/stage-number-${currentStage(state).id}.png`} alt="" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/ui/stage-clear-title.png" alt="" />
                    </span>
                  )}
                </>
              ) : result}
            </h2>
            {/* 별은 하나씩 차례로 찍힌다. 받은 개수만 밝다. */}
            {state.mode !== "endless" && (
              <p className="stage-rank" aria-label={`스테이지 랭크 별 ${rank}개`}>
                {[0, 1, 2].map((index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={index}
                    src={index < rank ? "/ui/star-yellow.png" : "/ui/star-gray.png"}
                    alt=""
                    aria-hidden
                    data-on={index < rank ? "" : undefined}
                    style={{ animationDelay: `${400 + index * 260}ms` }}
                  />
                ))}
              </p>
            )}
            {/* 정산: 채운 주문과 남은 턴을 보여 준다. */}
            <dl className="settle">
              <div>
                <dt>{state.mode === "endless" ? "최종 점수" : "주문 성공"}</dt>
                <dd />
                <dd><CountUp value={state.filled} />{state.mode === "endless" ? "점" : "번"}</dd>
              </div>
              <div>
                <dt>남은 턴</dt>
                <dd />
                <dd><CountUp value={state.turnsLeft} delay={420} />턴</dd>
              </div>
            </dl>
            <div className="result-actions">
              {state.phase === "won" && !isLastStage(state) && (
                <button
                  className="art-button result-art-button"
                  onClick={() => {
                    const next = nextStage(state);
                    savedRef.current = false;
                    setUndoSnapshot(null);
                    setSelectedActor(null);
                    selectedActorRef.current = null;
                    stateRef.current = next;
                    setState(next);
                    setStageIntro(true);
                                  }}
                >
                  다음 스테이지
                </button>
              )}
              <button
                className="art-button result-art-button"
                onClick={() => startRound(squad, currentStage(state).id)}
              >
                재도전
              </button>
              <button
                className="art-button result-art-button"
                onClick={() => {
                  setSquad(null);
                  setState(null);
                  setStageId(null);
                }}
              >
                나가기
              </button>
            </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
