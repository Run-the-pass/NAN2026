"use client";

import { useState } from "react";
import { defaultStages, gameModes, type GameMode } from "../game/core";
import { endlessUnlocked, shiftStars, stageUnlocked, type StageProgress } from "./progress";
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
  onPick: (stageId: string) => void;
  onBack: () => void;
}) {
  const [showStages, setShowStages] = useState(false);
  return (
    <main className="stage-select" data-screen={showStages ? "stages" : "modes"}>
      <header className="stage-select-bar">
        <button
          type="button"
          className="stage-select-back art-button"
          onClick={() => showStages ? setShowStages(false) : onBack()}
        >
          ← 뒤로
        </button>
        <MusicSettings variant="game" />
      </header>
      <h1><span className="sr-only">{showStages ? "스테이지 선택" : "모드 선택"}</span></h1>
      {showStages ? (
        <div className="stage-cards">
          {defaultStages().map((stage) => {
            const unlocked = stageUnlocked(progress, stage.id);
            return (
              <button
                type="button"
                className="stage-card"
                key={stage.id}
                data-tutorial={stage.id === "0" ? "" : undefined}
                data-locked={unlocked ? undefined : ""}
                disabled={!unlocked}
                aria-label={unlocked
                  ? stage.id === "0" ? "튜토리얼 스테이지 0" : `스테이지 ${stage.id}`
                  : `스테이지 ${stage.id} 잠김`}
                onClick={() => onPick(stage.id)}
              >
                {unlocked ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="stage-number" src={`/ui/stage-number-${stage.id}.png`} alt="" aria-hidden />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="stage-lock" src="/ui/stage-lock.png" alt="" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mode-plates">
          {gameModes.map((mode) => (
            <ModePlate
              key={mode.id}
              mode={mode}
              progress={progress}
              onPick={() => {
                if (mode.id === "shift") setShowStages(true);
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
