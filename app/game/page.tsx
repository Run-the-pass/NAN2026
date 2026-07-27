"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const Game = dynamic(() => import("../Game"), {
  ssr: false,
  loading: () => <main className="loading">공방 가동 준비 중…</main>,
});

export default function GamePage() {
  return (
    <>
      <Link className="game-home-link" href="/">
        ← 홈
      </Link>
      <Game />
    </>
  );
}
