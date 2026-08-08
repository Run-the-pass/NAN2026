"use client";

import { gameModes, type GameMode } from "../game/core";
import { endlessUnlocked, shiftStars, type StageProgress } from "./progress";
import { MusicSettings } from "./Music";

// 모드 하나. 나무 판 그림이 버튼 전체이고 글자는 그 위에 얹는다.
function ModePlate({
  mode,
  progress,
  onPick,
}: {
  mode: GameMode;
  progress: StageProgress;
  onPick: (id: GameMode["id"]) => void;
}) {
  const stars = shiftStars(progress);
  const open = mode.ready && (mode.id === "shift" || endlessUnlocked(progress));
  const note =
    mode.id === "shift"
      ? `별 ${stars.have} / ${stars.max}`
      : open
        ? "준비 중"
        : "아르바이트를 끝내면 열립니다";
  return (
    <button
      type="button"
      className="mode-plate"
      data-mode={mode.id}
      data-locked={open ? undefined : ""}
      disabled={!open}
      aria-label={`${mode.name} ${note}`}
      onClick={() => onPick(mode.id)}
    >
      <b>{mode.name}</b>
      <small>{note}</small>
    </button>
  );
}

export default function StageSelect({
  progress,
  onPick,
  onBack,
}: {
  progress: StageProgress;
  onPick: (id: GameMode["id"]) => void;
  onBack: () => void;
}) {
  return (
    <main className="stage-select">
      <header className="stage-select-bar">
        <button type="button" className="stage-select-back" onClick={onBack}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ui/back.png" alt="" aria-hidden />
          뒤로
        </button>
        <MusicSettings variant="game" />
      </header>
      <h1>모드 선택</h1>
      <div className="mode-plates">
        {gameModes.map((mode) => (
          <ModePlate key={mode.id} mode={mode} progress={progress} onPick={onPick} />
        ))}
      </div>
    </main>
  );
}
