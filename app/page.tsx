/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Music, { MusicSettings } from "./Music";

export default function Home() {
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
