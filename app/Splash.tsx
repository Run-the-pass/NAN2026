"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { assetManifest } from "./asset-manifest";
import { play } from "./SoundEffects";

const STAMP_SFX = "09_stamp.mp3";
// 입력 뒤 도장이 찍히는 걸 보여 주고 잠깐 머문다.
const MIN_MS = 2000;
// 로고가 커지며 사라지고 종이가 걷히는 데 걸리는 시간. globals.css의
// splash-out / splash-lift 길이와 같아야 홈 화면이 늦거나 일찍 뜨지 않는다.
const OUT_MS = 520;
// 느린 회선에서 그림 하나가 안 오면 첫 화면이 영영 안 열린다. 여기까지만
// 기다리고 넘어간다. 못 받은 것은 예전처럼 필요할 때 받는다.
const MAX_MS = 12000;
const SPLASH_END_EVENT = "slime-restaurant-splash-end";
const SPLASH_SEEN = "slime-restaurant-splash-seen";
const subscribeSeen = () => () => {};
const hasSeenSplash = () => {
  try {
    return sessionStorage.getItem(SPLASH_SEEN) === "1";
  } catch {
    return false;
  }
};

// 그림 하나를 받아 둔다. 실패해도 첫 화면을 막지 않는다.
const fetchImage = (src: string) =>
  new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => void image.decode().catch(() => {}).finally(resolve);
    image.onerror = () => resolve();
    image.src = src;
  });

export default function Splash() {
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const seen = useSyncExternalStore(subscribeSeen, hasSeenSplash, () => false);
  const startedAt = useRef(0);

  useEffect(() => {
    if (seen) return;
    let alive = true;

    // 도장 소리는 그림 7 MB와 같은 줄에서 내려온다. 미리 받아 두지 않으면
    // 정작 찍히는 순간에 아직 안 와 있다. 다 받을 때까지 붙잡아 둔다.
    const warm = new Audio(`/sfx/${STAMP_SFX}`);
    warm.preload = "auto";
    const settled = Promise.all([
      ...assetManifest.map(fetchImage),
      // 글꼴이 늦게 오면 첫 화면 글자가 한 번 튄다. 같이 기다린다.
      document.fonts.ready,
      // 동적 import인 Phaser와 배치 코드도 로고 뒤에서 받는다.
      import("./Game").then(() => undefined),
    ]);
    let cap: ReturnType<typeof setTimeout>;
    const capped = new Promise((resolve) => { cap = setTimeout(resolve, MAX_MS); });
    Promise.race([settled, capped]).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
      clearTimeout(cap!);
      warm.src = "";
    };
  }, [seen]);

  useEffect(() => {
    if (seen && !done) window.dispatchEvent(new Event(SPLASH_END_EVENT));
  }, [seen, done]);

  useEffect(() => {
    if (!started || !ready) return;
    let doneTimer: ReturnType<typeof setTimeout>;
    const leaveTimer = setTimeout(() => {
      setLeaving(true);
      doneTimer = setTimeout(() => {
        try {
          sessionStorage.setItem(SPLASH_SEEN, "1");
        } catch {}
        setDone(true);
        window.dispatchEvent(new Event(SPLASH_END_EVENT));
      }, OUT_MS);
    }, Math.max(0, MIN_MS - (Date.now() - startedAt.current)));
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer!);
    };
  }, [started, ready]);

  const start = () => {
    if (started) return;
    startedAt.current = Date.now();
    play(STAMP_SFX, 1);
    setStarted(true);
  };

  if (seen || done) return null;
  return (
    <button
      type="button"
      className="splash"
      data-started={started ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      aria-label={started ? "불러오는 중" : "화면을 눌러 시작"}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        start();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="splash-logo" src="/team-logo.png" width={720} height={1080} alt="슬라임 노동조합" />
      <span className="splash-start">화면을 눌러 시작</span>
    </button>
  );
}
