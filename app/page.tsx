"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef } from "react";
import Music, { MusicSettings } from "./Music";

export default function Home() {
  const creditsRef = useRef<HTMLDialogElement>(null);

  return (
    <main className="home-screen">
      <Music src="/music/home.mp3" />
      <h1 className="sr-only">슬라임 레스토랑</h1>
      <MusicSettings variant="home" />

      <div className="home-stage">
        <img className="home-logo" src="/home/logo.svg" width={1594} height={986} alt="슬라임 레스토랑" />

        <nav className="home-menu" aria-label="메인 메뉴">
          <Link className="home-menu-button home-start" href="/game">
            <img src="/home/start.svg" width={1555} height={523} alt="시작하기" />
          </Link>
        </nav>
        <button
          type="button"
          className="home-menu-button home-credits"
          aria-haspopup="dialog"
          onClick={() => creditsRef.current?.showModal()}
        >
          <img src="/ui/credits-button-text.png" width={1690} height={731} alt="크레딧" />
        </button>
        <dialog
          ref={creditsRef}
          className="credits-dialog"
          aria-labelledby="credits-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <form method="dialog" className="credits-card">
            <button type="submit" className="credits-close" aria-label="크레딧 닫기">×</button>
            <h2 id="credits-title">크레딧</h2>
            <div className="credits-logo-paper">
              <img src="/team-logo.png" width={1024} height={1722} alt="슬라임 노동조합 로고" />
            </div>
            <h3>슬라임 노동조합</h3>
            <p className="credits-members">이정민 · 윤정호</p>
            <dl className="credits-tools">
              <div><dt>음악 제작</dt><dd>Suno</dd></div>
              <div><dt>효과음 제작</dt><dd>ElevenLabs</dd></div>
            </dl>
          </form>
        </dialog>
        <img className="home-desk" src="/home/potion-desk.svg" alt="" />
        <img className="home-cauldron-bubble cauldron-bubble-1" src="/home/cauldron-bubble.svg" alt="" />
        <img className="home-cauldron-bubble cauldron-bubble-2" src="/home/cauldron-bubble.svg" alt="" />
        <img className="home-cauldron-bubble cauldron-bubble-3" src="/home/cauldron-bubble.svg" alt="" />
        <img className="home-cauldron" src="/home/cauldron.svg" alt="" />
        <img className="home-slime" src="/home/green-slime.svg" alt="통통 튀는 초록 슬라임" />
      </div>
    </main>
  );
}
