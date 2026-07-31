"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const storageKey = "slime-restaurant-music";
const changeEvent = "slime-restaurant-music-change";
const defaults = { enabled: true, volume: 0.35 };
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

export function MusicSettings({
  variant,
  onOpenChange,
}: {
  variant: "home" | "game";
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") changeOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  });
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
        className={variant === "home" ? "home-menu-button settings-trigger" : "game-settings-trigger"}
        type="button"
        aria-expanded={open}
        aria-controls={`${variant}-music-settings`}
        onClick={() => changeOpen(!open)}
      >
        {variant === "home" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/home/setting.svg" width={964} height={574} alt="설정" />
        ) : (
          <><span aria-hidden>⚙️</span> 설정</>
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
            <strong id={`${variant}-music-settings-title`}>음악 설정</strong>
            <button type="button" onClick={() => changeOpen(false)} aria-label="설정 닫기">×</button>
          </header>
          <button
            className="music-toggle"
            type="button"
            aria-pressed={settings.enabled}
            onClick={() => saveSettings({ ...settings, enabled: !settings.enabled })}
          >
            음악 {settings.enabled ? "켜짐" : "꺼짐"}
          </button>
          <label>
            <span>음량 {Math.round(settings.volume * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(event) => saveSettings({ ...settings, volume: Number(event.target.value) })}
            />
          </label>
        </section>
      </div>
    </div>
  );
}
