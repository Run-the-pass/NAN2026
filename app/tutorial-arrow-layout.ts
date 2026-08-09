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
  clock: { top: "clamp(96px, 14vh, 104px)", right: "clamp(68px, 6vw, 82px)", rotate: "180deg", "--arrow-x": "0px", "--arrow-y": "-12px" },
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
const bottom = (offsetCol = 0, offsetRow = 0): TutorialArrowLayout => ({
  side: "bottom", offsetCol, offsetRow, rotate: 180, bobX: 0, bobY: -12,
});

export const tutorialArrowLayout: Record<TutorialCue["id"], TutorialArrowLayout> = {
  SELECT_EARTH: left(0, -0.2),
  MOVE_TO_CABBAGE: left(),
  PICK_CABBAGE: left(),
  MOVE_TO_CUTTING_BOARD: top(),
  PLACE_CABBAGE: top(),
  CHOP_CABBAGE: top(),
  TAKE_FINISHED_FOOD: top(),
  PUT_FOOD_ON_TABLE: bottom(0, 0),
  TAKE_CLEAN_DISH: bottom(0, -0.2),
  // 테이블 오른쪽은 퐁당이의 자연스러운 접근 칸이다. 아래쪽에서 한 칸가량
  // 왼쪽으로 빼 두면 어느 단계에서도 슬라임 몸을 덮지 않는다.
  PLATE_AT_TABLE: bottom(),
  TAKE_PLATED_FOOD: bottom(),
  SUBMIT_ORDER: top(0, -0.8),
};

// END_TURN_은 지도 대신 턴 종료 버튼을 짚는다. 원래 목표 배치를 돌려줘도
// Game.tsx가 endTurn 안내의 지도 화살표를 그리지 않는다.
export const arrowLayoutFor = (id: string) =>
  tutorialArrowLayout[id.replace(/^END_TURN_/, "")];
