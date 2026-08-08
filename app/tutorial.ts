import {
  currentStage,
  isBesideStation,
  isDish,
  squadActorIds,
  stationInstancesByType,
  type ActorId,
  type GameState,
  type SlimeTypeId,
  type StationId,
} from "../game/core.js";

// 1스테이지만 튜토리얼을 붙인다. 2·3스테이지는 새 요소가 나올 때 짧은 대사만
// 쓰고 강제 안내를 반복하지 않는다.
export const TUTORIAL_STAGE = "0";

// 튜토리얼이 시키는 한 가지. 한 번에 한 개념만 말하고, 짚어야 할 설비가 있으면
// 그 자리를 같이 알려 준다.
export type TutorialCue = {
  id: string;
  speaker: SlimeTypeId;
  text: string;
  station?: StationId;
  // 이 단계에서 눌러야 할 슬라임. 아래 버튼을 반짝이게 한다.
  actor?: ActorId;
  // 턴 종료 버튼을 짚어야 하는 단계.
  endTurn?: boolean;
};

const EARTH: ActorId = "earth-1";
const WATER: ActorId = "water-1";

const stationIdOf = (type: StationId) => stationInstancesByType[type][0]!.id;

const carries = (state: GameState, actorId: ActorId, item: string) =>
  (state.actors[actorId]?.carrying ?? []).some(
    (carried) => (isDish(carried) ? carried.content : carried) === item,
  );

// 썰은 양배추가 어디든 있으면(도마 위·손·그릇 안) 조리는 끝난 것이다.
const choppedExists = (state: GameState) =>
  Object.values(state.stoves).some((items) => items?.includes("shredded-cabbage")) ||
  Object.values(state.actors).some((actor) =>
    (actor?.carrying ?? []).some(
      (carried) => (isDish(carried) ? carried.content : carried) === "shredded-cabbage",
    ),
  ) ||
  state.filled > 0;

const holdsPlatedFood = (state: GameState) =>
  Object.values(state.actors).some((actor) =>
    (actor?.carrying ?? []).some((carried) => isDish(carried) && carried.content),
  );

const beside = (state: GameState, actorId: ActorId, type: StationId) => {
  const actor = state.actors[actorId];
  const station = stationInstancesByType[type][0];
  return Boolean(actor && station && isBesideStation(actor, station));
};

// 첫 주문을 끝내면 튜토리얼도 끝난다.
export const tutorialDone = (state: GameState) => state.filled > 0;

export const onTutorialStage = (state: GameState) =>
  currentStage(state).id === TUTORIAL_STAGE;

// 지금 보여 줄 슬라임. 처음에는 땅 슬라임 하나뿐이고, 음식이 완성되면 물
// 슬라임이 나오고, 첫 주문을 끝내면 전부 나온다.
export function revealedTypes(state: GameState): SlimeTypeId[] {
  if (tutorialDone(state)) return state.squad;
  if (choppedExists(state)) return state.squad.filter((id) => id === "earth" || id === "water");
  return state.squad.filter((id) => id === "earth");
}

// 지금 고르고 움직일 수 있는 슬라임. 튜토리얼 스테이지가 아니면 전부다.
export function activeActorIds(state: GameState): ActorId[] {
  const all = squadActorIds(state.squad);
  if (!onTutorialStage(state)) return all;
  const shown = revealedTypes(state);
  return all.filter((id) => shown.includes(state.actors[id]!.typeId));
}

/**
 * 지금 단계의 안내. 별도 상태 기계를 두지 않고 게임 상태에서 바로 읽는다.
 * 그래야 플레이어가 안내보다 앞서 나가도 그 단계가 저절로 끝나고, 화면이
 * 이벤트를 한 번 놓쳤다고 안내가 어긋나지 않는다.
 */
export function tutorialCue(
  state: GameState,
  selected: ActorId | null,
  turnLimit: number,
): TutorialCue | null {
  if (tutorialDone(state)) return null;
  const earth = state.actors[EARTH];
  if (!earth) return null;

  if (choppedExists(state)) {
    if (holdsPlatedFood(state)) {
      return {
        id: "SUBMIT_ORDER",
        speaker: "water",
        text: "완성된 음식은 제출대에 가져가면 주문이 끝나요.",
        station: "submission",
      };
    }
    return {
      id: "PLATE_FOOD",
      speaker: "water",
      text: "잘했어요! 음식은 그릇에 담아야 낼 수 있어요. 퐁당이가 깨끗한 그릇을 가져올 거예요.",
      station: "dish-rack",
      actor: WATER,
    };
  }

  if (selected !== EARTH) {
    return {
      id: "SELECT_EARTH",
      speaker: "earth",
      text: "먼저 이 친구를 선택해보세요.",
      actor: EARTH,
    };
  }

  // 행동력을 다 쓴 뒤에만 알려 준다. 쓰기도 전에 설명하면 무슨 말인지 모른다.
  if (earth.actionPoints === 0 && state.turnsLeft === turnLimit) {
    return {
      id: "EXPLAIN_AP",
      speaker: "earth",
      text: "한 턴에 행동할 수 있는 횟수가 정해져 있어요. 다 썼으면 턴을 넘겨주세요.",
      endTurn: true,
    };
  }

  if (!carries(state, EARTH, "cabbage") && !state.stoves[stationIdOf("stove")]?.length) {
    if (!beside(state, EARTH, "cabbage-box")) {
      return {
        id: "MOVE_TO_CABBAGE",
        speaker: "earth",
        text: "갈 수 있는 칸이 표시돼요. 양배추 쪽으로 가볼까요?",
        station: "cabbage-box",
      };
    }
    return {
      id: "PICK_CABBAGE",
      speaker: "earth",
      text: "재료나 도구 앞에서는 눌러서 일을 시킬 수 있어요.",
      station: "cabbage-box",
    };
  }

  return {
    id: "USE_CUTTING_BOARD",
    speaker: "earth",
    text: "이 친구는 재료 손질을 잘해요. 양배추를 도마에서 썰어볼까요?",
    station: "stove",
  };
}
