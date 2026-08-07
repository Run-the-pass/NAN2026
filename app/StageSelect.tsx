"use client";

import { stageSlots, type StageSlot } from "../game/core";
import { slotState, type StageProgress } from "./progress";
import { MusicSettings } from "./Music";

// 칸 하나. 글자 라벨은 두지 않는다. 번호와 별만으로 읽힌다.
function SlotCard({
  slot,
  progress,
  onPick,
}: {
  slot: StageSlot;
  progress: StageProgress;
  onPick: (id: string) => void;
}) {
  const { cleared, stars, unlocked } = slotState(slot, progress);
  const name = slot.kind === "tutorial"
    ? "튜토리얼"
    : slot.kind === "endless"
      ? "무한 모드"
      : `스테이지 ${slot.label}`;
  const status = !slot.ready
    ? "준비 중"
    : !unlocked
      ? "잠김"
      : slot.ranked
        ? `별 ${stars} / 3`
        : cleared
          ? "완료"
          : "";
  return (
    <button
      type="button"
      className="stage-slot"
      data-kind={slot.kind}
      data-locked={unlocked ? undefined : ""}
      disabled={!unlocked}
      aria-label={`${name} ${status}`}
      onClick={() => onPick(slot.id)}
    >
      <b className="stage-slot-label" aria-hidden>
        {unlocked ? slot.label : "🔒"}
      </b>
      {slot.ranked && (
        <span className="stage-slot-stars" aria-hidden>
          {[0, 1, 2].map((index) => (
            <i key={index} data-on={unlocked && index < stars ? "" : undefined} />
          ))}
        </span>
      )}
      {slot.kind === "tutorial" && cleared && (
        <span className="stage-slot-mark" aria-hidden>✓</span>
      )}
    </button>
  );
}

export default function StageSelect({
  progress,
  onPick,
  onBack,
}: {
  progress: StageProgress;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <main className="stage-select">
      <header className="stage-select-bar">
        <button type="button" className="stage-select-back" onClick={onBack}>
          ← 뒤로
        </button>
        <MusicSettings variant="game" />
      </header>
      <h1>스테이지 선택</h1>
      <div className="stage-slots">
        {stageSlots.map((slot) => (
          <SlotCard key={slot.id} slot={slot} progress={progress} onPick={onPick} />
        ))}
      </div>
    </main>
  );
}
