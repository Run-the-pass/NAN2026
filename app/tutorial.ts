import {
  KITCHEN_ROWS,
  currentStage,
  isBesideStation,
  isDish,
  squadActorIds,
  stationInstancesByType,
  type ActorId,
  type Carried,
  type GameState,
  type ItemId,
  type SlimeTypeId,
  type StationId,
  type StationInstanceId,
} from "../game/core.js";

// 1스테이지만 튜토리얼을 붙인다. 2·3스테이지는 새 요소가 나올 때 짧은 대사만
// 쓰고 강제 안내를 반복하지 않는다.
export const TUTORIAL_STAGE = "0";

export type TutorialCue = {
  id: string;
  speaker: SlimeTypeId;
  text: string;
  station?: StationId | StationInstanceId;
  actor?: ActorId;
  endTurn?: boolean;
};

const EARTH: ActorId = "earth-1";
const WATER: ActorId = "water-1";
const TUTORIAL_FOOD: ItemId = "shredded-cabbage";

const stationIdOf = (type: StationId) => stationInstancesByType[type][0]!.id;
const carriedItem = (carried: Carried) => isDish(carried) ? carried.content : carried;
const carries = (state: GameState, actorId: ActorId, item: ItemId) =>
  (state.actors[actorId]?.carrying ?? []).some((carried) => carriedItem(carried) === item);
const beside = (state: GameState, actorId: ActorId, type: StationId) => {
  const actor = state.actors[actorId];
  const station = stationInstancesByType[type][0];
  return Boolean(actor && station && isBesideStation(actor, station));
};
const actorWith = (state: GameState, predicate: (carried: Carried) => boolean) =>
  Object.entries(state.actors).find(([, actor]) => actor?.carrying.some(predicate))?.[0] ?? null;
const tableWith = (state: GameState, predicate: (carried: Carried) => boolean) =>
  Object.entries(state.tables).find(([, items]) => items?.some(predicate))?.[0] as StationInstanceId | undefined;
const emptyTable = (state: GameState) =>
  stationInstancesByType.table
    .filter(({ id }) => state.tables[id]?.length === 0)
    .sort((a, b) => {
      const score = ({ tiles }: typeof a) => {
        const distances = [EARTH, WATER].map((id) => {
          const actor = state.actors[id];
          return actor ? Math.abs(actor.col - tiles[0].col) + Math.abs(actor.row - tiles[0].row) : 0;
        });
        return Math.max(...distances) * 100 + distances[0] + distances[1];
      };
      return score(a) - score(b);
    })[0]?.id ?? stationIdOf("table");
const cooktopWithFood = (state: GameState) =>
  Object.entries(state.stoves).find(([, items]) => items?.includes(TUTORIAL_FOOD))?.[0] as StationInstanceId | undefined;
const cleanDish = (carried: Carried) => isDish(carried) && carried.status === "clean";
const filledTutorialDish = (carried: Carried) =>
  isDish(carried) && carried.status === "filled" && carried.content === TUTORIAL_FOOD;

// 썰은 양배추가 도마·손·테이블·그릇 어디에 있든 조리는 끝난 것이다.
const choppedExists = (state: GameState) =>
  Object.values(state.stoves).some((items) => items?.includes(TUTORIAL_FOOD)) ||
  Object.values(state.actors).some((actor) => actor?.carrying.some(
    (carried) => carriedItem(carried) === TUTORIAL_FOOD,
  )) ||
  Object.values(state.tables).some((items) => items?.some(
    (carried) => carriedItem(carried) === TUTORIAL_FOOD,
  )) ||
  state.filled > 0;

export const onTutorialStage = (state: GameState) =>
  currentStage(state).id === TUTORIAL_STAGE;

// 첫 튜토리얼에서 퐁당이는 소개되는 순간 그릇 상자 바로 앞에 나타난다.
// 일반 스테이지의 속성별 시작 위치는 건드리지 않는다.
export function prepareTutorialState(state: GameState): GameState {
  if (!onTutorialStage(state)) return state;
  const water = state.actors[WATER];
  const rack = stationInstancesByType["dish-rack"][0]?.tiles[0];
  if (!water || !rack) return state;
  const front = { col: rack.col, row: rack.row - 1 };
  if (KITCHEN_ROWS[front.row]?.[front.col] !== ".") return state;
  return {
    ...state,
    actors: { ...state.actors, [WATER]: { ...water, ...front } },
  };
}

// 첫 양배추 주문을 제출하면 조작 튜토리얼은 끝난다.
export const tutorialDone = (state: GameState) =>
  onTutorialStage(state) &&
  state.filled > 0;

export const finishTutorial = (state: GameState): GameState =>
  tutorialDone(state) ? { ...state, phase: "won" } : state;

// 땅 → 물 → 나머지 둘 순서로 공개한다.
export function revealedTypes(state: GameState): SlimeTypeId[] {
  if (!onTutorialStage(state) || tutorialDone(state)) return state.squad;
  if (choppedExists(state)) return state.squad.filter((id) => id === "earth" || id === "water");
  return state.squad.filter((id) => id === "earth");
}

export function activeActorIds(state: GameState): ActorId[] {
  const shown = revealedTypes(state);
  return squadActorIds(state.squad).filter((id) => shown.includes(state.actors[id]!.typeId));
}

const waitForTurn = (
  state: GameState,
  actorId: ActorId,
  cue: TutorialCue,
): TutorialCue => {
  const actor = state.actors[actorId];
  if (!actor || actor.actionPoints > 0) return cue;
  return {
    id: `END_TURN_${cue.id}`,
    speaker: actor.typeId,
    text: "행동력을 다 썼어요. 턴 종료를 누르거나 Space를 눌러 다음 턴으로 넘어가세요.",
    endTurn: true,
  };
};

/** 게임 상태에서 다음 한 가지 안내를 바로 계산한다. */
export function tutorialCue(
  state: GameState,
  selected: ActorId | null,
  turnLimit: number,
): TutorialCue | null {
  if (!onTutorialStage(state) || tutorialDone(state)) return null;
  const earth = state.actors[EARTH];
  const water = state.actors[WATER];
  if (!earth || !water) return null;

  // 완성한 음식과 그릇을 테이블에서 합쳐 물 슬라임에게 전달한다.
  if (choppedExists(state)) {
    const platedHolder = actorWith(state, filledTutorialDish);
    const platedTable = tableWith(state, filledTutorialDish);
    const looseHolder = actorWith(state, (carried) => !isDish(carried) && carried === TUTORIAL_FOOD);
    const looseTable = tableWith(state, (carried) => !isDish(carried) && carried === TUTORIAL_FOOD);

    if (platedHolder) {
      return waitForTurn(state, platedHolder, {
        id: "SUBMIT_ORDER",
        speaker: "water",
        text: "완성된 음식은 제출대에 가져가면 주문이 끝나요.",
        station: stationIdOf("submission"),
        actor: platedHolder,
      });
    }
    if (platedTable) {
      return waitForTurn(state, WATER, {
        id: "TAKE_PLATED_FOOD",
        speaker: "water",
        text: "완성된 양배추 접시를 테이블에서 다시 집어주세요.",
        station: platedTable,
        actor: WATER,
      });
    }
    if (looseTable) {
      if (water.carrying.some(cleanDish)) {
        return waitForTurn(state, WATER, {
          id: "PLATE_AT_TABLE",
          speaker: "water",
          text: "퐁당이가 든 접시를 테이블의 양배추와 합쳐주세요.",
          station: looseTable,
          actor: WATER,
        });
      }
      return waitForTurn(state, WATER, {
        id: "TAKE_CLEAN_DISH",
        speaker: "water",
        text: "물 슬라임 퐁당이는 그릇과 세척 담당이에요. 바로 앞 그릇 상자에서 깨끗한 접시를 집어주세요.",
        station: stationIdOf("dish-rack"),
        actor: WATER,
      });
    }
    if (looseHolder) {
      return waitForTurn(state, looseHolder, {
        id: "PUT_FOOD_ON_TABLE",
        speaker: state.actors[looseHolder]!.typeId,
        text: "완성된 양배추를 빈 테이블에 놓아 퐁당이에게 넘겨주세요.",
        station: emptyTable(state),
        actor: looseHolder,
      });
    }
    const stove = cooktopWithFood(state);
    if (stove) {
      return waitForTurn(state, EARTH, {
        id: "TAKE_FINISHED_FOOD",
        speaker: "earth",
        text: "양배추 손질이 끝났어요. 도마에서 완성된 음식을 집어주세요.",
        station: stove,
        actor: EARTH,
      });
    }
  }

  if (selected !== EARTH) {
    return {
      id: "SELECT_EARTH",
      speaker: "earth",
      text: "지금 쉬고 있는 푸름이를 불렀어요. 먼저 이 친구를 선택해보세요.",
      actor: EARTH,
    };
  }
  if (earth.actionPoints === 0 && state.turnsLeft === turnLimit) {
    return {
      id: "EXPLAIN_AP",
      speaker: "earth",
      text: "슬라임은 한 턴에 행동할 수 있는 횟수가 정해져 있어요. 턴을 넘겨주세요.",
      endTurn: true,
    };
  }
  if (!carries(state, EARTH, "cabbage") && !state.stoves[stationIdOf("stove")]?.length) {
    if (!beside(state, EARTH, "cabbage-box")) {
      return waitForTurn(state, EARTH, {
        id: "MOVE_TO_CABBAGE",
        speaker: "earth",
        text: "갈 수 있는 칸이 표시돼요. 양배추 쪽으로 가볼까요?",
        station: stationIdOf("cabbage-box"),
      });
    }
    return waitForTurn(state, EARTH, {
      id: "PICK_CABBAGE",
      speaker: "earth",
      text: "재료나 도구 앞에서는 눌러서 일을 시킬 수 있어요.",
      station: stationIdOf("cabbage-box"),
    });
  }
  return waitForTurn(state, EARTH, {
    id: "USE_CUTTING_BOARD",
    speaker: "earth",
    text: "푸름이는 재료 손질을 잘해요. 양배추를 도마에서 썰어볼까요?",
    station: stationIdOf("stove"),
  });
}
