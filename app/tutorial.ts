import {
  KITCHEN_ROWS,
  currentStage,
  isBesideStation,
  isDish,
  squadActorIds,
  stageRank,
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
// 넘겨줄 자리는 슬라임이 지금 어디 있든 같아야 한다. 서 있는 위치로 재면
// 짚어 준 테이블로 걸어가는 동안 답이 바뀌어 하이라이트가 옮겨 다닌다.
// 푸름이는 도마에서, 퐁당이는 그릇 상자에서 오므로 그 두 곳을 기준으로 삼는다.
const HANDOFF_ENDS: StationId[] = ["stove", "dish-rack"];
const emptyTable = (state: GameState) =>
  stationInstancesByType.table
    .filter(({ id }) => state.tables[id]?.length === 0)
    .sort((a, b) => {
      const score = ({ tiles }: typeof a) => {
        const distances = HANDOFF_ENDS.map((type) => {
          const from = stationInstancesByType[type][0]!.tiles[0];
          return Math.abs(from.col - tiles[0].col) + Math.abs(from.row - tiles[0].row);
        });
        return Math.max(...distances) * 100 + distances[0] + distances[1];
      };
      // 점수가 같으면 왼쪽·위쪽을 고른다. 배열 순서로 갈리면 같은 값인데도
      // 멀리 있는 테이블이 뽑힌다.
      return (
        score(a) - score(b) ||
        a.tiles[0].col - b.tiles[0].col ||
        a.tiles[0].row - b.tiles[0].row
      );
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

export const waterIntroReady = (state: GameState) =>
  onTutorialStage(state) && choppedExists(state) && !tutorialDone(state);

export const platedIntroReady = (state: GameState) =>
  onTutorialStage(state) && Boolean(tableWith(state, filledTutorialDish));

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

// 튜토리얼은 첫 주문 하나로 끝난다. 별 기준을 그대로 재면 1개밖에 못 주므로
// 깨면 무조건 전부 준다.
export const roundRank = (state: GameState) =>
  state.phase !== "won" ? 0
    : onTutorialStage(state) ? currentStage(state).stars.length
      : stageRank(state);

// 땅 → 물 → 나머지 둘 순서로 공개한다.
export function revealedTypes(state: GameState): SlimeTypeId[] {
  if (!onTutorialStage(state)) return state.squad;
  if (tutorialDone(state) || choppedExists(state)) {
    return state.squad.filter((id) => id === "earth" || id === "water");
  }
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
  const ready = activeActorIds(state).find(
    (id) => id !== actorId && (state.actors[id]?.actionPoints ?? 0) > 0,
  );
  if (ready) {
    const next = state.actors[ready]!;
    return {
      id: `USE_${ready}_${cue.id}`,
      speaker: next.typeId,
      text: `${next.name}의 행동력이 남아 있어요. 움직이거나 Space로 쉬게 해주세요.`,
      actor: ready,
    };
  }
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
        text: "이제 퐁당이를 움직여 음식을 제출해주세요!",
        station: stationIdOf("submission"),
        actor: platedHolder,
      });
    }
    if (platedTable) {
      return waitForTurn(state, WATER, {
        id: "TAKE_PLATED_FOOD",
        speaker: "water",
        text: "퐁당이를 누르고, 썰은 양배추를 클릭하세요.",
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
        text: "퐁당이를 클릭하고, 그릇 상자를 눌러 그릇을 꺼내주세요. 물 슬라임 퐁당이는 그릇과 세척을 맡아요.",
        station: stationIdOf("dish-rack"),
        actor: WATER,
      });
    }
    if (looseHolder) {
      return waitForTurn(state, looseHolder, {
        id: "PUT_FOOD_ON_TABLE",
        speaker: state.actors[looseHolder]!.typeId,
        text: "푸름이는 썰은 양배추를 노란색 화살표가 가리키는 테이블에 올려주세요.",
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
      text: "푸름이를 클릭해보시겠어요?",
      actor: EARTH,
    };
  }
  if (earth.actionPoints === 0 && state.turnsLeft === turnLimit) {
    return {
      id: "EXPLAIN_AP",
      speaker: "earth",
      text: "슬라임은 행동력이 있고, 이동이나 상호 작용 시 소모돼요. 매 턴 시작 시 리셋되며 남은 행동력은 추가되지 않아요. 턴 종료를 눌러 다음 턴으로 넘어가주세요.",
      endTurn: true,
    };
  }
  if (!carries(state, EARTH, "cabbage") && !state.stoves[stationIdOf("stove")]?.length) {
    if (!beside(state, EARTH, "cabbage-box")) {
      return waitForTurn(state, EARTH, {
        id: "MOVE_TO_CABBAGE",
        speaker: "earth",
        text: "푸름이를 움직여서 양배추 재료 상자로 옮겨주세요.",
        station: stationIdOf("cabbage-box"),
      });
    }
    return waitForTurn(state, EARTH, {
      id: "PICK_CABBAGE",
      speaker: "earth",
      text: "이제 상자를 클릭해 양배추를 집어보세요.",
      station: stationIdOf("cabbage-box"),
    });
  }
  if (carries(state, EARTH, "cabbage")) {
    if (!beside(state, EARTH, "stove")) {
      return waitForTurn(state, EARTH, {
        id: "MOVE_TO_CUTTING_BOARD",
        speaker: "earth",
        text: "푸름이를 다시 도마로 옮겨주세요.",
        station: stationIdOf("stove"),
      });
    }
    return waitForTurn(state, EARTH, {
      id: "PLACE_CABBAGE",
      speaker: "earth",
      text: "도마를 클릭해 양배추를 내려놓으세요.",
      station: stationIdOf("stove"),
    });
  }
  return waitForTurn(state, EARTH, {
    id: "CHOP_CABBAGE",
    speaker: "earth",
    text: "도마를 다시 한 번 클릭해 양배추를 썰어보세요.",
    station: stationIdOf("stove"),
  });
}
