"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => <main className="loading">주방 준비 중…</main>,
});

export default function Home() {
  return <Game />;
}
