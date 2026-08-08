import { type SlimeTypeId } from "../game/core.js";

// 대사 한 줄. 말하는 슬라임과 할 말만 있으면 된다.
export type DialogueLine = { speaker: SlimeTypeId; text: string };

// 아르바이트 모드를 처음 열 때 나오는 인사. 규칙은 여기서 설명하지 않는다.
// 아직 해 보지 않은 것을 미리 늘어놓으면 하나도 남지 않는다. 조작은 첫 주문을
// 직접 해 보면서 app/tutorial.ts가 한 번에 하나씩 알려 준다.
export const openingLines: DialogueLine[] = [
  { speaker: "earth", text: "오늘부터 이 식당은 우리가 맡는대. 첫 아르바이트야." },
  { speaker: "earth", text: "첫 주문부터 같이 해보자 — 영업 시작!" },
];
