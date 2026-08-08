import { type SlimeTypeId } from "../game/core.js";

export type DialogueFocus = "orders" | "earth" | "inspector" | "next-order";
export type DialogueLine = {
  speaker: SlimeTypeId;
  text: string;
  name?: string;
  focus?: DialogueFocus;
  portrait?: string;
};

const MANAGER_PORTRAIT = "/home/green-slime.svg";

// 아르바이트 모드를 처음 열 때 나오는 인사. 규칙은 여기서 설명하지 않는다.
// 아직 해 보지 않은 것을 미리 늘어놓으면 하나도 남지 않는다. 조작은 첫 주문을
// 직접 해 보면서 app/tutorial.ts가 한 번에 하나씩 알려 준다.
export const openingLines: DialogueLine[] = [
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "안녕하세요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "저는 점장 슬라임이에요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "슬라임 레스토랑에 아르바이트 지원해 주셔서 너무나도 감사해요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "어디 보자, 맡아주실 업무가… 매장 관리직이시네요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "오늘은 첫날이니까, 제가 차근차근 알려드릴게요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "오, 마침 주문이 들어왔어요! 한번 봐볼까요?", focus: "orders" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "이건 썰린 양배추네요! 양배추를 썰면 될 것 같아요.", focus: "orders" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "옆에 작게 보이는 주문은 다음에 들어올 주문이에요. 미리 준비하면 턴을 아낄 수 있어요.", focus: "next-order" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "지금 쉬고 있는 푸름이를 불렀어요!", focus: "earth" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "푸름이를 클릭해보시겠어요?", focus: "earth" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "장비나 친구를 클릭하면 오른쪽 상세 정보 창에서 할 수 있는 일을 확인할 수 있어요.", focus: "inspector" },
];

// 첫 양배추 주문을 내면 튜토리얼을 분명히 끝낸다.
export const tutorialCompleteLines: DialogueLine[] = [
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "잘했어요! 첫 주문을 완성했네요. 이제 정식 영업을 시작해볼까요?" },
];

export const stageOpeningLine = (stageId: string): DialogueLine => ({
  speaker: "earth",
  name: "점장 슬라임",
  portrait: MANAGER_PORTRAIT,
  text: stageId === "1"
    ? "썬 당근과 양배추를 한 접시에 담으면 샐러드예요."
    : stageId === "2"
      ? "새 조리 도구가 나왔어요. 주문표를 확인하세요."
      : "마지막 스테이지예요. 힘내세요!",
});
