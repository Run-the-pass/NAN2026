"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("../Game"), {
  ssr: false,
  loading: () => <main className="loading">식당 영업 준비 중…</main>,
});

export default function GamePage() {
  return <Game />;
}
