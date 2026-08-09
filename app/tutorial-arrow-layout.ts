import type { CSSProperties } from "react";
import type { DialogueFocus } from "./dialogue-script.js";
import type { TutorialCue } from "./tutorial.js";

type ArrowStyle = CSSProperties & Record<`--arrow-${"x" | "y"}`, string>;

// 튜토리얼 화살표 좌표·방향·흔들림은 이 파일의 숫자만 바꾸면 된다.
// 화면 가장자리에 붙는 UI만 여기에 둔다. 지도 위의 푸름이(earth)는 화면 비율에
// 따라 타일 크기가 달라져 %로는 못 맞춘다. Game.tsx가 실제 타일 좌표로 짚는다.
export const dialogueArrowLayout: Partial<Record<DialogueFocus, ArrowStyle>> = {
  orders: { top: "clamp(176px, 25vh, 204px)", left: "clamp(84px, 8vw, 104px)", rotate: "180deg", "--arrow-x": "0px", "--arrow-y": "-12px" },
  "next-order": { top: "clamp(94px, 15vh, 112px)", left: "clamp(224px, 21vw, 270px)", rotate: "180deg", "--arrow-x": "0px", "--arrow-y": "-12px" },
  inspector: { top: "38%", right: "calc(var(--game-info-rail) + 2%)", rotate: "-90deg", "--arrow-x": "12px", "--arrow-y": "0px" },
  clock: { top: "5%", right: "18%", rotate: "-90deg", "--arrow-x": "12px", "--arrow-y": "0px" },
};

export type TutorialArrowLayout = {
  side: "top" | "right" | "bottom" | "left" | "center";
  offsetCol: number;
  offsetRow: number;
  rotate: number;
  bobX: number;
  bobY: number;
};

const top = (offsetCol = 0, offsetRow = 0): TutorialArrowLayout => ({
  side: "top", offsetCol, offsetRow, rotate: 0, bobX: 0, bobY: 12,
});
const left = (offsetCol = 0, offsetRow = 0): TutorialArrowLayout => ({
  side: "left", offsetCol, offsetRow, rotate: -90, bobX: 12, bobY: 0,
});

export const tutorialArrowLayout: Record<TutorialCue["id"], TutorialArrowLayout> = {
  SELECT_EARTH: left(0, -1),
  MOVE_TO_CABBAGE: left(),
  PICK_CABBAGE: left(),
  MOVE_TO_CUTTING_BOARD: top(),
  PLACE_CABBAGE: top(),
  CHOP_CABBAGE: top(),
  TAKE_FINISHED_FOOD: top(),
  PUT_FOOD_ON_TABLE: { side: "bottom", offsetCol: 0, offsetRow: 0, rotate: 180, bobX: 0, bobY: -12 },
  TAKE_CLEAN_DISH: top(-1.35),
  PLATE_AT_TABLE: left(),
  TAKE_PLATED_FOOD: left(),
  SUBMIT_ORDER: top(),
};

// waitForTurn은 원래 안내 id 앞에 꼬리표를 붙여 새 안내를 만든다.
// END_TURN_은 화살표를 안 쓰고, USE_<슬라임>_은 그 슬라임을 짚으므로
// 푸름이를 고르라고 할 때와 같은 자리에 둔다. 여기서 못 걸러내면 자리를
// 못 찾은 화살표가 지도 왼쪽 위 구석에 그대로 붙는다.
export const arrowLayoutFor = (id: string) =>
  id.startsWith("USE_")
    ? left()
    : tutorialArrowLayout[id.replace(/^END_TURN_/, "")];
