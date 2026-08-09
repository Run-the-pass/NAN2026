"use client";

import { useEffect, useState } from "react";
import { assetManifest } from "./asset-manifest";
import { play } from "./SoundEffects";

// 도장은 0.38초에 찍힌다. 다 받았더라도 찍히는 걸 보여 주고 잠깐 머문다.
const STAMP_MS = 380;
const STAMP_SFX = "09_stamp.mp3";
const MIN_MS = 2000;
// 로고가 커지며 사라지고 종이가 걷히는 데 걸리는 시간. globals.css의
// splash-out / splash-lift 길이와 같아야 홈 화면이 늦거나 일찍 뜨지 않는다.
const OUT_MS = 520;
// 느린 회선에서 그림 하나가 안 오면 첫 화면이 영영 안 열린다. 여기까지만
// 기다리고 넘어간다. 못 받은 것은 예전처럼 필요할 때 받는다.
const MAX_MS = 12000;

// 그림 하나를 받아 둔다. 실패해도 첫 화면을 막지 않는다.
const fetchImage = (src: string) =>
  new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });

export default function Splash() {
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, run: () => void) => {
      timers.push(setTimeout(() => { if (alive) run(); }, ms));
    };

    // 도장 소리는 그림 7 MB와 같은 줄에서 내려온다. 미리 받아 두지 않으면
    // 정작 찍히는 순간에 아직 안 와 있다. 다 받을 때까지 붙잡아 둔다.
    const warm = new Audio(`/sfx/${STAMP_SFX}`);
    warm.preload = "auto";
    // 도장이 종이에 닿는 순간에 맞춰 울린다. 첫 화면은 아직 아무것도 누른
    // 적이 없어 브라우저가 소리를 막을 수 있다. 막히면 조용히 넘어간다.
    later(STAMP_MS, () => play(STAMP_SFX, 1));

    const settled = Promise.all([
      ...assetManifest.map(fetchImage),
      // 글꼴이 늦게 오면 첫 화면 글자가 한 번 튄다. 같이 기다린다.
      document.fonts.ready,
    ]);
    const capped = new Promise((resolve) => setTimeout(resolve, MAX_MS));
    Promise.race([settled, capped]).then(() => {
      if (!alive) return;
      later(Math.max(0, MIN_MS - (Date.now() - startedAt)), () => {
        setLeaving(true);
        later(OUT_MS, () => setDone(true));
      });
    });
    return () => {
      alive = false;
      warm.src = "";
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  if (done) return null;
  return (
    <div className="splash" data-leaving={leaving ? "" : undefined} role="status" aria-label="불러오는 중">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="splash-logo" src="/team-logo.png" width={720} height={1080} alt="슬라임 노동조합" />
    </div>
  );
}
