"use client";

import * as Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  command,
  executeEnvelope,
  initialState,
  startRoundTwo,
  tick,
  validateEnvelope,
  type Action,
  type ActorId,
} from "../game/core";

const stationPosition: Record<Action, { x: number; y: number }> = {
  GET: { x: 480, y: 520 },
  CHOP: { x: 160, y: 300 },
  COOK: { x: 800, y: 300 },
  SERVE: { x: 480, y: 85 },
  PREPARE: { x: 160, y: 300 },
};

type View = { move: (actor: ActorId, action: Action) => void };

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
      () => setState((current) => tick(current)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

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
            move: (actor, action) => {
              this.tweens.add({
                targets: this.actors[actor],
                ...stationPosition[action],
                duration: 420,
                ease: "Sine.out",
              });
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
    view.current?.move(actor, action);
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
          for (const item of checked.value.commands) view.current?.move(item.actorId, item.action);
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
    sold: "판매 완료",
  }[state.mushroom];

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
        <span>🍄 {stage}</span>
        <span>말랑: {state.hungry ? "배고픔 ⚠" : state.mushroom}</span>
        <span>빨강: {state.mushroom === "stew" ? "서빙 가능" : "대기"}</span>
      </section>
      <div className="workspace">
        <section className="canvas-card">
          <div id="game-canvas" aria-label="탑다운 식당 게임 맵" />
          <p className="move-tip">WASD / 방향키로 노란 플레이어 이동</p>
        </section>
        <aside>
          <div className="order">
            <small>ORDER 01</small>
            <strong>버섯 스튜</strong>
            <span>{stage}</span>
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
            {state.round === 1 ? (
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
          {state.phase === "upgrade" && (
            <button className="upgrade" onClick={() => setState((current) => startRoundTwo(current))}>
              강화 선택 · 추상 명령 해금
            </button>
          )}
          {state.phase === "finished" && (
            <button className="restart" onClick={() => setState(initialState())}>처음부터 다시</button>
          )}
        </aside>
      </div>
    </main>
  );
}
