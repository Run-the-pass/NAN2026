"use client";

import * as Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  choices,
  chooseUpgrade,
  command,
  endRound,
  executeEnvelope,
  initialState,
  tick,
  validateEnvelope,
  type Action,
  type ActorState,
  type ActorId,
} from "../game/core";

type View = { sync: (actors: Record<ActorId, ActorState>) => void };

export default function Game() {
  const [state, setState] = useState(() => initialState());
  const [mic, setMic] = useState("마이크 준비");
  const stateRef = useRef(state);
  const view = useRef<View | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setState((current) => tick(current, 50)),
      50,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    view.current?.sync(state.actors);
  }, [state.actors]);

  useEffect(() => {
    let game: Phaser.Game | undefined;
    {
      class Kitchen extends Phaser.Scene {
        actors!: Record<ActorId, Phaser.GameObjects.Container>;

        create() {
          this.cameras.main.setBackgroundColor("#18251f");
          this.add.rectangle(480, 300, 900, 540, 0x283d35).setStrokeStyle(4, 0x89a887);
          this.add.rectangle(480, 300, 360, 390, 0x3f5b4f);
          const box = (x: number, y: number, w: number, h: number, color: number, label: string) => {
            this.add.rectangle(x, y, w, h, color).setStrokeStyle(3, 0xffffff, 0.45);
            this.add.text(x, y, label, {
              color: "#ffffff",
              fontFamily: "sans-serif",
              fontSize: "18px",
              fontStyle: "bold",
              align: "center",
            }).setOrigin(0.5);
          };
          box(480, 62, 380, 70, 0x6b4f3a, "고객석 · 주문: 버섯 스튜");
          box(480, 145, 360, 52, 0xc68b43, "패스 / 완성 요리");
          box(145, 300, 190, 100, 0x537a6d, "손질대\nCHOP");
          box(815, 300, 190, 100, 0xa64b3c, "냄비\nCOOK");
          box(480, 525, 240, 72, 0x8a6847, "버섯 상자\nGET");
          box(145, 470, 190, 70, 0x355b72, "설거지대\n(장식)");
          box(815, 470, 190, 70, 0x725135, "보관대\n(장식)");
          this.actors = {
            "slime-01": this.actor(360, 380, 0x63d47c, "말랑\n주방"),
            "slime-02": this.actor(600, 210, 0xef5b55, "빨강\n서빙"),
          };
          const player = this.actor(480, 370, 0xf4cb4c, "플레이어");
          const keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<string, Phaser.Input.Keyboard.Key>;
          this.events.on("update", () => {
            const speed = 3;
            if (keys.A.isDown || keys.LEFT.isDown) player.x -= speed;
            if (keys.D.isDown || keys.RIGHT.isDown) player.x += speed;
            if (keys.W.isDown || keys.UP.isDown) player.y -= speed;
            if (keys.S.isDown || keys.DOWN.isDown) player.y += speed;
            player.x = Phaser.Math.Clamp(player.x, 300, 660);
            player.y = Phaser.Math.Clamp(player.y, 190, 470);
          });
          view.current = {
            sync: (actors) => {
              for (const actorId of ["slime-01", "slime-02"] as ActorId[]) {
                this.actors[actorId].setPosition(
                  actors[actorId].x,
                  actors[actorId].y,
                );
              }
            },
          };
        }

        actor(x: number, y: number, color: number, label: string) {
          const body = this.add.rectangle(0, 0, 84, 62, color).setStrokeStyle(3, 0xffffff);
          const text = this.add.text(0, 0, label, {
            color: "#111b17",
            fontFamily: "sans-serif",
            fontSize: "16px",
            fontStyle: "bold",
            align: "center",
          }).setOrigin(0.5);
          return this.add.container(x, y, [body, text]).setDepth(5);
        }
      }
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: "game-canvas",
        width: 960,
        height: 600,
        backgroundColor: "#18251f",
        scene: Kitchen,
        render: { antialias: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
    }
    return () => game?.destroy(true);
  }, []);

  function run(actor: ActorId, action: Action) {
    const envelope = command(actor, action);
    const checked = validateEnvelope(
      envelope,
      stateRef.current.round,
      stateRef.current.upgraded,
    );
    if (!checked.ok) {
      setState((current) => ({ ...current, lastEvent: checked.reason }));
      return;
    }
    setState((current) => executeEnvelope(current, checked.value));
  }

  async function toggleMic() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const next = new MediaRecorder(stream);
      recorder.current = next;
      next.ondataavailable = (event) => chunks.current.push(event.data);
      next.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setMic("Gemini 해석 중…");
        const form = new FormData();
        form.append("audio", new Blob(chunks.current, { type: next.mimeType }), "command.webm");
        form.append("round", String(stateRef.current.round));
        form.append("upgraded", String(stateRef.current.upgraded));
        try {
          const response = await fetch("/api/command", { method: "POST", body: form });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.reason || "명령 해석 실패");
          const checked = validateEnvelope(payload, stateRef.current.round, stateRef.current.upgraded);
          if (!checked.ok) throw new Error(checked.reason);
          setState((current) => executeEnvelope(current, checked.value));
          setMic(`인식 완료 · 신뢰도 ${Math.round(checked.value.confidence * 100)}%`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "명령 해석 실패";
          setMic(reason);
          setState((current) => ({ ...current, lastEvent: reason }));
        }
      };
      next.start();
      setMic("듣는 중… 다시 누르면 전송");
    } catch {
      setMic("마이크 권한이 필요합니다.");
    }
  }

  const stage = {
    stock: "버섯 대기",
    held: "버섯 운반",
    chopped: "손질 완료",
    stew: "스튜 완성",
  }[state.mushroom];
  const actorName: Record<ActorId, string> = {
    "slime-01": "말랑",
    "slime-02": "빨강",
  };

  return (
    <main className="game-shell">
      <header>
        <div>
          <p className="eyebrow">VOICE-LED RESTAURANT</p>
          <h1>SLIME SHIFT</h1>
        </div>
        <div className="round-badge">{state.round} / 2 ROUND</div>
      </header>
      <section className="hud" aria-label="게임 상태">
        <strong>⏱ {state.timeLeft}초</strong>
        <span>💰 {state.score}</span>
        <span>🧾 대기 주문 {state.ordersPending}건</span>
        <span>✅ 이번 라운드 판매 {state.roundSales}건</span>
        <span>🔔 다음 주문 {Math.ceil(state.nextOrderInMs / 1000)}초</span>
      </section>
      <div className="workspace">
        <section className="canvas-card">
          <div id="game-canvas" aria-label="탑다운 식당 게임 맵" />
          <p className="move-tip">WASD / 방향키로 노란 플레이어 이동</p>
        </section>
        <aside>
          <div className="order">
            <small>ORDER QUEUE · 총 {state.ordersReceived}건 접수</small>
            <strong>버섯 스튜 × {state.ordersPending}</strong>
            <span>재료: {stage} · 판매: {state.roundSales}건</span>
            <span>다음 주문까지 {Math.ceil(state.nextOrderInMs / 1000)}초</span>
          </div>
          <div className="slime-statuses" aria-label="슬라임 작업 큐">
            {(Object.keys(state.actors) as ActorId[]).map((actorId) => {
              const slime = state.actors[actorId];
              return (
                <article key={actorId}>
                  <strong>{actorName[actorId]} · {slime.status}</strong>
                  <span>현재: {slime.current?.action ?? "없음"}</span>
                  <span>
                    대기 큐: {slime.queue.length
                      ? slime.queue.map(({ action }) => action).join(" → ")
                      : "비어 있음"}
                  </span>
                </article>
              );
            })}
          </div>
          <div className="event" role="status" aria-live="polite">
            <small>최근 상황</small>
            <strong>{state.lastEvent}</strong>
          </div>
          <button className="mic" onClick={toggleMic} disabled={state.phase !== "playing"}>
            🎙 {recorder.current?.state === "recording" ? "녹음 중지" : "음성 명령"}
          </button>
          <p className="mic-state">{mic}</p>
          <div className="debug">
            <small>키 없이 시연 · 명령 JSON</small>
            {!state.upgraded ? (
              <>
                <button onClick={() => run("slime-01", "GET")}>말랑 · GET</button>
                <button onClick={() => run("slime-01", "CHOP")}>말랑 · CHOP</button>
              </>
            ) : (
              <button onClick={() => run("slime-01", "PREPARE")}>말랑 · PREPARE</button>
            )}
            <button onClick={() => run("slime-01", "COOK")}>말랑 · COOK</button>
            <button onClick={() => run("slime-02", "SERVE")}>빨강 · SERVE</button>
          </div>
          {state.phase === "playing" && (
            <button className="round-end" onClick={() => setState((current) => endRound(current))}>
              라운드 마감 · 시연용
            </button>
          )}
          {state.phase === "finished" && (
            <button className="restart" onClick={() => setState(initialState())}>처음부터 다시</button>
          )}
        </aside>
      </div>
      {state.phase === "choice" && (
        <section className="choice-overlay" role="dialog" aria-modal="true" aria-labelledby="choice-title">
          <div className="choice-panel">
            <p className="eyebrow">ROUND CLEAR</p>
            <h2 id="choice-title">성장 하나를 선택하세요</h2>
            <div className="choice-grid">
              {choices.map((choice) => (
                <article className="choice-card" key={choice.id} style={{ "--choice": choice.color } as CSSProperties}>
                  <div className="choice-icon" aria-hidden="true" />
                  <h3>{choice.title}</h3>
                  <p>{choice.description}</p>
                  <strong>{choice.effect}</strong>
                  <button autoFocus={choice.id === "mallang-mastery"} onClick={() => setState((current) => chooseUpgrade(current, choice.id))}>
                    {choice.title} 선택
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
