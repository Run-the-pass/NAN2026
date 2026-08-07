import { type SlimeTypeId } from "../game/core.js";

// 대사 한 줄. 말하는 슬라임과 할 말만 있으면 된다.
export type DialogueLine = { speaker: SlimeTypeId; text: string };

// 아르바이트 모드를 처음 열 때 나오는 인사. 규칙을 한 번씩 짚어 주고
// 마지막 줄에서 영업 시작 문구로 넘어간다. 대사는 여기만 고치면 된다.
export const openingLines: DialogueLine[] = [
  { speaker: "earth", text: "오늘부터 이 식당은 우리가 맡는대. 첫 아르바이트야." },
  { speaker: "water", text: "손님 주문을 정해진 턴 안에 내면 되는 거지?" },
  { speaker: "fire", text: "상자에서 재료를 꺼내고, 조리하고, 그릇에 담아 제출대로. 그게 전부야." },
  { speaker: "lightning", text: "난 한 턴에 두 번 움직여. 나르는 건 나한테 맡겨." },
  { speaker: "earth", text: "좋아. 그럼 오늘도 잘 부탁해 — 영업 시작!" },
];
