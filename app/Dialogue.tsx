"use client";

import { useCallback, useEffect, useState } from "react";
import { slimeTypes, type SlimeTypeId } from "../game/core";
import { dialogueParts, type DialogueFocus, type DialogueLine } from "./dialogue-script";
import { dialogueArrowLayout } from "./tutorial-arrow-layout";

// 한 글자씩 찍는 속도(ms). 다 찍히기 전에 누르면 남은 글자가 한 번에 나온다.
const LETTER_MS = 28;

export default function Dialogue({
  lines,
  portrait,
  onDone,
  onFocusChange,
  passive = false,
  narration = false,
}: {
  lines: DialogueLine[];
  portrait: (typeId: SlimeTypeId) => string;
  onDone?: () => void;
  onFocusChange?: (focus: DialogueFocus | undefined) => void;
  passive?: boolean;
  narration?: boolean;
}) {
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(0);
  const line = lines[at];
  const full = line?.text ?? "";
  const visible = passive ? full.length : shown;
  const done = visible >= full.length;

  useEffect(() => {
    onFocusChange?.(line?.focus);
  }, [line, onFocusChange]);

  useEffect(() => {
    if (passive) return;
    if (shown >= full.length) return;
    const timer = setTimeout(() => setShown((count) => count + 1), LETTER_MS);
    return () => clearTimeout(timer);
  }, [shown, full, passive]);

  // 한 번 누르면 남은 글자를 다 찍고, 다 찍혀 있으면 다음 줄로 넘어간다.
  const advance = useCallback(() => {
    if (passive) return;
    if (!done) return setShown(full.length);
    if (at + 1 >= lines.length) return onDone?.();
    setAt(at + 1);
    setShown(0);
  }, [passive, done, full, at, lines.length, onDone]);

  useEffect(() => {
    if (passive) return;
    const down = (event: KeyboardEvent) => {
      if (!["Space", "Enter", "NumpadEnter"].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      advance();
    };
    // 캡처 단계에서 받아 게임 조작(스페이스=다음 슬라임)까지 가지 않게 한다.
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [advance, passive]);

  if (!line) return null;
  const name = line.name ?? `${slimeTypes[line.speaker].name} 슬라임`;
  return (
    <div
      className="dialogue-screen"
      data-focus={line.focus}
      data-passive={passive ? "" : undefined}
      data-narration={narration ? "" : undefined}
      role={passive ? "status" : "dialog"}
      aria-live="polite"
      aria-label={`${name}: ${full}`}
      onClick={advance}
    >
      {!passive && onDone && (
        <button type="button" className="dialogue-skip art-button" onClick={(event) => { event.stopPropagation(); onDone(); }}>
          건너뛰기
        </button>
      )}
      {line.focus && dialogueArrowLayout[line.focus] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={`dialogue-arrow dialogue-arrow-${line.focus}`}
          src="/ui/tutorial-arrow.png"
          alt=""
          aria-hidden
          style={dialogueArrowLayout[line.focus]}
        />
      )}
      <div className="dialogue-bar">
        {!passive && !narration && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="dialogue-face" src={line.portrait ?? portrait(line.speaker)} alt="" aria-hidden />
        )}
        {!passive && !narration && line.companions?.length ? (
          <span className="dialogue-companions" aria-hidden>
            {line.companions.map((typeId) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={typeId} src={portrait(typeId)} alt="" />
            ))}
          </span>
        ) : null}
        {!passive && !narration && <b className="dialogue-name">{name}</b>}
        <p className="dialogue-text">
          {dialogueParts(full.slice(0, visible)).map((part, index) =>
            part.tone ? (
              <strong className={`dialogue-term dialogue-term-${part.tone}`} key={`${index}-${part.text}`}>
                {part.text}
              </strong>
            ) : part.text
          )}
          {!passive && done && <i className="dialogue-more" aria-hidden>▼</i>}
        </p>
      </div>
    </div>
  );
}
