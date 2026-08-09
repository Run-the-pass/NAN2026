"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const storageKey = "slime-restaurant-music";
const changeEvent = "slime-restaurant-music-change";
// 음악과 효과음을 따로 끄고 조절한다. 한 벌로 저장해 이벤트도 하나만 쓴다.
const defaults = { enabled: true, volume: 0.35, sfxEnabled: true, sfxVolume: 0.35 };
const defaultJson = JSON.stringify(defaults);
type Settings = typeof defaults;

function readSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: Settings) {
  localStorage.setItem(storageKey, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: settings }));
}

export default function Music({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const apply = (settings = readSettings()) => {
      audio.volume = Math.min(1, Math.max(0, settings.volume));
      if (settings.enabled) void audio.play().catch(() => undefined);
      else audio.pause();
    };
    const changed = (event: Event) =>
      apply((event as CustomEvent<Settings>).detail);
    const resume = () => apply();

    audio.load();
    apply();
    window.addEventListener(changeEvent, changed);
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener(changeEvent, changed);
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      audio.pause();
    };
  }, [src]);

  return <audio ref={audioRef} src={src} loop preload="auto" hidden />;
}

// 왼쪽 스피커 아이콘이 켜기·끄기를 겸하고 오른쪽에 음량 슬라이더가 온다.
function SoundRow({
  label,
  on,
  volume,
  onToggle,
  onVolume,
}: {
  label: string;
  on: boolean;
  volume: number;
  onToggle: () => void;
  onVolume: (volume: number) => void;
}) {
  return (
    <div className="sound-row" data-off={on ? undefined : ""}>
      <button
        className="sound-toggle"
        type="button"
        aria-pressed={on}
        aria-label={`${label} ${on ? "끄기" : "켜기"}`}
        onClick={onToggle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={on ? "/ui/sound-on.png" : "/ui/sound-off.png"} alt="" />
      </button>
      <label>
        <span>{label} {Math.round(volume * 100)}%</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          disabled={!on}
          aria-label={`${label} 음량`}
          onChange={(event) => onVolume(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

export function MusicSettings({
  variant,
  open: controlledOpen,
  onOpenChange,
}: {
  variant: "home" | "game";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const changeOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  useEffect(() => {
    if (!open || controlledOpen !== undefined) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInternalOpen(false);
        onOpenChange?.(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, controlledOpen, onOpenChange]);
  const stored = useSyncExternalStore(
    (notify) => {
      window.addEventListener(changeEvent, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(changeEvent, notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => localStorage.getItem(storageKey) ?? defaultJson,
    () => defaultJson,
  );
  let settings = defaults;
  try { settings = { ...defaults, ...JSON.parse(stored) }; } catch { settings = defaults; }

  return (
    <div className={`music-settings music-settings-${variant}`}>
      <button
        className={variant === "home" ? "home-menu-button settings-trigger" : "game-settings-trigger art-button"}
        type="button"
        aria-expanded={open}
        aria-controls={`${variant}-music-settings`}
        onClick={() => changeOpen(!open)}
      >
        {variant === "home" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/home/setting.svg" width={964} height={574} alt="설정" />
        ) : (
          // 게임 안 설정은 톱니까지 그려진 정사각 버튼 그림 하나로 끝난다.
          <span className="sr-only">설정</span>
        )}
      </button>
      <div
        className="settings-overlay"
        data-open={open ? "" : undefined}
        aria-hidden={!open}
        inert={!open}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) changeOpen(false);
        }}
      >
        <section
          id={`${variant}-music-settings`}
          className="settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${variant}-music-settings-title`}
        >
          <header>
            <strong id={`${variant}-music-settings-title`}>소리 설정</strong>
            <button
              type="button"
              className="settings-close"
              onClick={() => changeOpen(false)}
              aria-label="소리 설정 닫기"
            >
              ×
            </button>
          </header>
          <SoundRow
            label="음악"
            on={settings.enabled}
            volume={settings.volume}
            onToggle={() => saveSettings({ ...settings, enabled: !settings.enabled })}
            onVolume={(volume) => saveSettings({ ...settings, volume })}
          />
          <SoundRow
            label="효과음"
            on={settings.sfxEnabled}
            volume={settings.sfxVolume}
            onToggle={() => saveSettings({ ...settings, sfxEnabled: !settings.sfxEnabled })}
            onVolume={(sfxVolume) => saveSettings({ ...settings, sfxVolume })}
          />
          {variant === "game" && (
            <Link className="settings-home-link art-button" href="/">
              홈 화면으로
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
