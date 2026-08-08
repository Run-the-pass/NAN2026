"use client";

import { useCallback, useEffect, useState } from "react";
import { slimeTypes, type SlimeTypeId } from "../game/core";
import { type DialogueLine } from "./dialogue-script";

// 한 글자씩 찍는 속도(ms). 다 찍히기 전에 누르면 남은 글자가 한 번에 나온다.
const LETTER_MS = 28;

export default function Dialogue({
  lines,
  portrait,
  onDone,
}: {
  lines: DialogueLine[];
  portrait: (typeId: SlimeTypeId) => string;
  onDone: () => void;
}) {
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(0);
  const line = lines[at];
  const full = line?.text ?? "";
  const done = shown >= full.length;

  useEffect(() => {
    if (shown >= full.length) return;
    const timer = setTimeout(() => setShown((count) => count + 1), LETTER_MS);
    return () => clearTimeout(timer);
  }, [shown, full]);

  // 한 번 누르면 남은 글자를 다 찍고, 다 찍혀 있으면 다음 줄로 넘어간다.
  const advance = useCallback(() => {
    if (!done) return setShown(full.length);
    if (at + 1 >= lines.length) return onDone();
    setAt(at + 1);
    setShown(0);
  }, [done, full, at, lines.length, onDone]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!["Space", "Enter", "NumpadEnter"].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      advance();
    };
    // 캡처 단계에서 받아 게임 조작(스페이스=다음 슬라임)까지 가지 않게 한다.
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [advance]);

  if (!line) return null;
  const name = `${slimeTypes[line.speaker].name} 슬라임`;
  return (
    <div
      className="dialogue-screen"
      role="dialog"
      aria-live="polite"
      aria-label={`${name}: ${full}`}
      onClick={advance}
    >
      <button type="button" className="dialogue-skip" onClick={(event) => { event.stopPropagation(); onDone(); }}>
        건너뛰기
      </button>
      <div className="dialogue-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="dialogue-face" src={portrait(line.speaker)} alt="" aria-hidden />
        <b className="dialogue-name">{name}</b>
        <p className="dialogue-text">
          {full.slice(0, shown)}
          {done && <i className="dialogue-more" aria-hidden>▼</i>}
        </p>
      </div>
    </div>
  );
}
