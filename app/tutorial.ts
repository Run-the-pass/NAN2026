import {
  currentStage,
  squadActorIds,
  type ActorId,
  type GameState,
  type SlimeTypeId,
} from "../game/core.js";
import { type TutorialView } from "./tutorial-conditions.js";
import { tutorialScript, type TutorialEntry } from "./tutorial-script.js";

export { type TutorialView } from "./tutorial-conditions.js";
export { type TutorialEntry } from "./tutorial-script.js";

// 1스테이지에만 붙인다. 2·3스테이지는 새 요소가 나올 때 짧은 대사만 쓰고
// 강제 안내를 반복하지 않는다.
export const TUTORIAL_STAGE = "0";

export const onTutorialStage = (state: GameState) =>
  currentStage(state).id === TUTORIAL_STAGE;

/**
 * 튜토리얼 엔진. 대본을 해석하기만 하고 규칙은 갖고 있지 않다.
 *
 * 진행 상태를 따로 저장하지 않고 매번 게임 상태에서 다시 읽는다. 그래서
 * 플레이어가 안내보다 앞서 나가면 그 대목이 저절로 끝나고, 화면이 이벤트를
 * 한 번 놓쳐도 어긋나지 않는다. 되돌리기나 저장·복원도 따로 손댈 것이 없다.
 */
const tasks = tutorialScript.filter((entry) => entry.kind === "task");

/**
 * 지금 대목의 자리. 끝난 대목 중 가장 뒤를 찾아 그 다음으로 잡는다.
 * 진행은 되돌아가지 않는다 — 뒤 대목이 끝나 있으면 앞 대목은 이미 지나간
 * 것이므로, 조건이 잠깐 어긋났다고 앞으로 되돌리지 않는다.
 */
function cursorOf(state: GameState, view: TutorialView) {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (tasks[index]!.when(state, view)) return index + 1;
  }
  return 0;
}

export function tutorialCue(
  state: GameState,
  view: TutorialView,
): TutorialEntry | null {
  if (!onTutorialStage(state)) return null;
  // 알림이 먼저다. 아직 배우지 않은 것이 눈앞에 나왔다는 뜻이라 그 자리에서
  // 말해 주지 않으면 기회를 놓친다.
  const notice = tutorialScript.find(
    (entry) =>
      entry.kind === "notice" && !view.acked.has(entry.id) && entry.when(state, view),
  );
  if (notice) return notice;
  return tasks[cursorOf(state, view)] ?? null;
}

// 대본이 끝나면 튜토리얼도 끝난다.
export const tutorialDone = (state: GameState, view: TutorialView) =>
  tutorialCue(state, view) === null;

/**
 * 지금 무대에 선 슬라임. 대본이 대목마다 정한 배역을 따른다. 아직 소개하지
 * 않은 슬라임은 버튼에서도 지도에서도 빠진다.
 */
export function revealedTypes(state: GameState, view: TutorialView): SlimeTypeId[] {
  if (!onTutorialStage(state)) return state.squad;
  // 지금 대목까지의 배역을 훑어 마지막으로 정해진 것을 쓴다.
  let cast: SlimeTypeId[] | null = null;
  for (const entry of tasks.slice(0, cursorOf(state, view) + 1)) {
    if (entry.cast) cast = entry.cast;
  }
  return cast ? state.squad.filter((id) => cast.includes(id)) : state.squad;
}

// 지금 고르고 움직일 수 있는 슬라임.
export function activeActorIds(state: GameState, view: TutorialView): ActorId[] {
  const all = squadActorIds(state.squad);
  if (!onTutorialStage(state)) return all;
  const shown = revealedTypes(state, view);
  return all.filter((id) => shown.includes(state.actors[id]!.typeId));
}
