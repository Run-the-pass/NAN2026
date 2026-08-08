import { type ActorId, type SlimeTypeId, type StationId } from "../game/core.js";
import {
  acked,
  besideStation,
  carrying,
  carryingPlated,
  dirtyDishWaiting,
  every,
  foodExists,
  onCooktop,
  onFirstTurn,
  ordersFilled,
  outOfPoints,
  selecting,
  some,
  tableHolds,
  type Condition,
} from "./tutorial-conditions.js";

/**
 * 튜토리얼 대본. 이 파일만 고치면 흐름이 바뀐다. 조건은
 * app/tutorial-conditions.ts의 어휘만 쓰고, 이 파일에는 규칙을 적지 않는다.
 *
 * kind가 하는 일:
 *   task   차례대로 하나씩. `when`이 참이 될 때까지 그 자리에 머문다.
 *   notice `when`이 참인 동안 끼어들어 한 번 알린다. 눌러 넘기면 끝이고,
 *          진행을 막지 않는다. 아직 안 배운 것이 우연히 나왔을 때 쓴다.
 *
 * cast는 그 대목부터 무대에 서는 슬라임이다. 적지 않으면 앞 대목을 물려받는다.
 */
export type TutorialEntry = {
  id: string;
  kind: "task" | "notice";
  speaker: SlimeTypeId;
  text: string;
  when: Condition;
  // 지도에서 짚어 줄 설비.
  station?: StationId;
  // 눌러야 할 슬라임 버튼.
  actor?: ActorId;
  // 턴 종료 버튼을 짚는다.
  endTurn?: boolean;
  cast?: SlimeTypeId[];
};

const EARTH: ActorId = "earth-1";
const WATER: ActorId = "water-1";
const CABBAGE = "shredded-cabbage" as const;

// 손질을 시작했으면 앞 단계는 더 볼 필요가 없다. 이미 지나친 단계를 다시
// 시키지 않으려고 뒤 상태도 같이 본다.
const pastChopping: Condition = some(onCooktop("cabbage"), foodExists(CABBAGE));

export const tutorialScript: TutorialEntry[] = [
  {
    id: "EXPLAIN_AP",
    kind: "notice",
    speaker: "earth",
    text: "한 턴에 행동할 수 있는 횟수가 정해져 있어요. 다 썼으면 턴을 넘겨주세요.",
    when: every(outOfPoints(EARTH), onFirstTurn),
    endTurn: true,
  },
  {
    id: "USE_TABLE",
    kind: "notice",
    speaker: "water",
    text: "테이블에 올려두면 다른 슬라임에게 넘겨줄 수 있어요.",
    when: tableHolds,
    station: "table",
  },
  {
    id: "DISH_GUIDE",
    kind: "notice",
    speaker: "water",
    text: "서빙한 그릇은 더러운 채로 돌아와요. 퐁당이에게 설거지를 맡겨주세요.",
    when: dirtyDishWaiting,
    station: "dish-return",
  },

  {
    id: "SELECT_EARTH",
    kind: "task",
    speaker: "earth",
    text: "먼저 이 친구를 선택해보세요.",
    when: selecting(EARTH),
    actor: EARTH,
    cast: ["earth"],
  },
  {
    id: "MOVE_TO_CABBAGE",
    kind: "task",
    speaker: "earth",
    text: "갈 수 있는 칸이 표시돼요. 양배추 쪽으로 가볼까요?",
    when: some(besideStation(EARTH, "cabbage-box"), carrying(EARTH, "cabbage"), pastChopping),
    station: "cabbage-box",
  },
  {
    id: "PICK_CABBAGE",
    kind: "task",
    speaker: "earth",
    text: "재료나 도구 앞에서는 눌러서 일을 시킬 수 있어요.",
    when: some(carrying(EARTH, "cabbage"), pastChopping),
    station: "cabbage-box",
  },
  {
    id: "USE_CUTTING_BOARD",
    kind: "task",
    speaker: "earth",
    text: "이 친구는 재료 손질을 잘해요. 양배추를 도마에서 썰어볼까요?",
    when: foodExists(CABBAGE),
    station: "stove",
  },
  {
    id: "PLATE_FOOD",
    kind: "task",
    speaker: "water",
    text: "잘했어요! 음식은 그릇에 담아야 낼 수 있어요. 퐁당이가 깨끗한 그릇을 가져올 거예요.",
    when: carryingPlated(),
    station: "dish-rack",
    actor: WATER,
    cast: ["earth", "water"],
  },
  {
    id: "SUBMIT_ORDER",
    kind: "task",
    speaker: "water",
    text: "완성된 음식은 제출대에 가져가면 주문이 끝나요.",
    when: ordersFilled(1),
    station: "submission",
  },
  {
    id: "REVEAL_OTHERS",
    kind: "task",
    speaker: "fire",
    text: "첫 주문 완료! 불 슬라임은 불을 쓰고, 번개 슬라임은 한 턴에 한 번 더 움직여요.",
    when: acked("REVEAL_OTHERS"),
    cast: ["earth", "water", "fire", "lightning"],
  },
  {
    id: "NEXT_ORDER",
    kind: "task",
    speaker: "lightning",
    text: "옆에 작게 보이는 건 다음 주문이에요. 미리 준비해두면 턴을 아낄 수 있겠죠?",
    when: acked("NEXT_ORDER"),
  },
];
