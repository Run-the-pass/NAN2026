"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("../Game"), {
  ssr: false,
  loading: () => <main className="loading">식당 영업 준비 중…</main>,
});

export default function GamePage() {
  return (
    <>
      <p className="landscape-gate" role="status">
        휴대폰을 가로로 돌려주세요.
      </p>
      <Game />
    </>
  );
}
