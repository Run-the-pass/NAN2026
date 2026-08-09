"use client";

import { useState } from "react";
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
  resumeStageId,
  onPick,
  onBack,
}: {
  progress: StageProgress;
  resumeStageId: string | null;
  onPick: (stageId: string) => void;
  onBack: () => void;
}) {
  const [resumeOpen, setResumeOpen] = useState(false);
  return (
    <main className="stage-select">
      <header className="stage-select-bar">
        <button type="button" className="stage-select-back art-button" onClick={onBack}>
          ← 뒤로
        </button>
        <MusicSettings variant="game" />
      </header>
      <h1><span className="sr-only">모드 선택</span></h1>
      <div className="mode-plates">
        {gameModes.map((mode) => (
          <ModePlate
            key={mode.id}
            mode={mode}
            progress={progress}
            onPick={() => {
              if (mode.id !== "shift") return;
              if (resumeStageId) setResumeOpen(true);
              else onPick("0");
            }}
          />
        ))}
      </div>
      {resumeOpen && (
        <section className="resume-dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title">
          <div className="paper-window">
            <h2 className="paper-title" id="resume-title">하던 영업이 있어요</h2>
            <div className="paper-body">
              <p>저장된 스테이지부터 다시 시작합니다.</p>
              <div className="resume-actions">
                <button className="art-button" onClick={() => onPick(resumeStageId!)} autoFocus>이어하기</button>
                <button className="art-button" onClick={() => onPick("0")}>처음부터</button>
                <button className="art-button" onClick={() => setResumeOpen(false)}>취소</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
