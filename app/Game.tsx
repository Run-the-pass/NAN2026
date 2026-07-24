"use client";

import * as Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  TILE_SIZE,
  WORKSHOP_ROWS,
  command,
  displayTiles,
  executeEnvelope,
  initialState,
  isWalkable,
  pixelToTile,
  tileCenter,
  tick,
  validateEnvelope,
  type Action,
  type CauldronId,
  type GameState,
  type TargetId,
} from "../game/core";

type View = { sync: (state: GameState) => void };

const potNames: Record<CauldronId, string> = {
  "cauldron-01": "왼쪽 솥",
  "cauldron-02": "오른쪽 솥",
};
const statusNames = {
  EMPTY: "비어 있음",
  HERB_LOADED: "약초 투입",
  MIXING: "마력액 조합 중",
  READY_FOR_PARCHMENT: "양피지 대기",
  INSCRIBING: "마도서 각인 중",
  BOOK_READY: "마도서 완성",
} as const;
const carriedNames = {
  herb: "약초",
  parchment: "양피지",
  book: "마도서",
} as const;

export default function Game() {
  const [state, setState] = useState(() => initialState());
  const [selectedCauldron, setSelectedCauldron] =
    useState<CauldronId>("cauldron-01");
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
    view.current?.sync(state);
  }, [state]);

  useEffect(() => {
    class Workshop extends Phaser.Scene {
      slime!: Phaser.GameObjects.Container;
      carried!: Phaser.GameObjects.Text;
      pots!: Record<CauldronId, Phaser.GameObjects.Text>;

      create() {
        this.cameras.main.setBackgroundColor("#171527");
        const colors: Record<string, number> = {
          ".": 0x332f48,
          "#": 0x171527,
          T: 0x74513d,
          H: 0x315f47,
          P: 0x765f48,
          C: 0x514369,
        };
        WORKSHOP_ROWS.forEach((row, rowIndex) => {
          [...row].forEach((tile, colIndex) => {
            const { x, y } = tileCenter({ col: colIndex, row: rowIndex });
            this.add
              .rectangle(x, y, TILE_SIZE, TILE_SIZE, colors[tile])
              .setStrokeStyle(1, 0xc6a6ff, tile === "." ? 0.18 : 0.48);
          });
        });
        const label = (
          tile: { col: number; row: number },
          icon: string,
          text: string,
        ) => {
          const { x, y } = tileCenter(tile);
          this.add
            .text(x, y - 7, icon, { fontSize: "30px" })
            .setOrigin(0.5)
            .setDepth(2);
          this.add
            .text(x, y + 22, text, {
              color: "#f8efff",
              fontFamily: "sans-serif",
              fontSize: "11px",
              fontStyle: "bold",
              align: "center",
            })
            .setOrigin(0.5)
            .setDepth(2);
        };
        label(displayTiles.herb, "🌿", "약초 상자");
        label(displayTiles.parchment, "📜", "양피지 상자");
        label(displayTiles.submission, "📚", "납품대");

        this.pots = {
          "cauldron-01": this.add
            .text(0, 0, "", { fontSize: "24px", align: "center" })
            .setOrigin(0.5)
            .setDepth(3),
          "cauldron-02": this.add
            .text(0, 0, "", { fontSize: "24px", align: "center" })
            .setOrigin(0.5)
            .setDepth(3),
        };
        for (const id of ["cauldron-01", "cauldron-02"] as CauldronId[]) {
          const position = tileCenter(displayTiles[id]);
          this.pots[id].setPosition(position.x, position.y);
        }

        const start = tileCenter({ col: 8, row: 8 });
        this.slime = this.actor(start.x, start.y, 0x93e675, "말랑");
        this.carried = this.add
          .text(start.x, start.y - 42, "", { fontSize: "26px" })
          .setOrigin(0.5)
          .setDepth(8);

        const playerStart = tileCenter({ col: 7, row: 8 });
        const player = this.actor(
          playerStart.x,
          playerStart.y,
          0xffcc59,
          "플레이어",
        );
        const keys = this.input.keyboard?.addKeys(
          "W,A,S,D,UP,DOWN,LEFT,RIGHT",
        ) as Record<string, Phaser.Input.Keyboard.Key>;
        const canStand = (x: number, y: number) =>
          [-18, 18].every((offsetX) =>
            [-18, 18].every((offsetY) =>
              isWalkable(pixelToTile(x + offsetX, y + offsetY)),
            ),
          );
        this.events.on("update", (_time: number, delta: number) => {
          let dx =
            Number(keys.D.isDown || keys.RIGHT.isDown) -
            Number(keys.A.isDown || keys.LEFT.isDown);
          let dy =
            Number(keys.S.isDown || keys.DOWN.isDown) -
            Number(keys.W.isDown || keys.UP.isDown);
          if (dx && dy) {
            dx /= Math.SQRT2;
            dy /= Math.SQRT2;
          }
          const distance = (180 * Math.min(delta, 32)) / 1000;
          if (canStand(player.x + dx * distance, player.y)) {
            player.x += dx * distance;
          }
          if (canStand(player.x, player.y + dy * distance)) {
            player.y += dy * distance;
          }
        });

        view.current = {
          sync: (current) => {
            const slime = current.actors["slime-01"];
            this.slime.setPosition(slime.x, slime.y);
            const icon = { herb: "🌿", parchment: "📜", book: "📘" }[
              slime.carrying ?? ""
            ];
            this.carried
              .setText(icon ?? "")
              .setPosition(slime.x, slime.y - 42);
            for (const id of [
              "cauldron-01",
              "cauldron-02",
            ] as CauldronId[]) {
              const pot = current.cauldrons[id];
              const icon = pot.status === "BOOK_READY" ? "📘" : "🫕";
              const timer = pot.timerMs
                ? `\n${(pot.timerMs / 1000).toFixed(1)}초`
                : "";
              this.pots[id].setText(`${icon}${timer}`);
            }
          },
        };
        view.current.sync(stateRef.current);
      }

      actor(x: number, y: number, color: number, label: string) {
        const body = this.add
          .rectangle(0, 0, 46, 40, color)
          .setStrokeStyle(3, 0xffffff);
        const text = this.add
          .text(0, 0, label, {
            color: "#171527",
            fontFamily: "sans-serif",
            fontSize: "12px",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        return this.add.container(x, y, [body, text]).setDepth(5);
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-canvas",
      width: 960,
      height: 600,
      backgroundColor: "#171527",
      scene: Workshop,
      render: { antialias: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    return () => {
      view.current = null;
      game.destroy(true);
    };
  }, []);

  function run(action: Action, targetId?: TargetId) {
    const envelope = command(action, targetId);
    const checked = validateEnvelope(envelope);
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
        form.append(
          "audio",
          new Blob(chunks.current, { type: next.mimeType }),
          "command.webm",
        );
        try {
          const response = await fetch("/api/command", {
            method: "POST",
            body: form,
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.reason || "명령 해석 실패");
          }
          const checked = validateEnvelope(payload);
          if (!checked.ok) throw new Error(checked.reason);
          setState((current) => executeEnvelope(current, checked.value));
          setMic(
            `인식 완료 · 신뢰도 ${Math.round(checked.value.confidence * 100)}%`,
          );
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "명령 해석 실패";
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

  const slime = state.actors["slime-01"];
  const result =
    state.phase === "won"
      ? "성공! 마도서 8권을 납품했습니다."
      : "시간 종료. 다시 공방을 가동해 보세요.";

  return (
    <main className="game-shell">
      <header>
        <div>
          <p className="eyebrow">VOICE-LED ARCANE WORKSHOP</p>
          <h1>터진다! 슬라임 공방</h1>
        </div>
        <div className="round-badge">3 MIN FUN TEST</div>
      </header>

      <section className="hud" aria-label="게임 상태">
        <strong>⏱ {state.timeLeft}초</strong>
        <span>📚 납품 {state.submitted} / {state.goal}</span>
        <span>🟢 말랑 {slime.status}</span>
        <span>🙌 소지 {slime.carrying ? carriedNames[slime.carrying] : "없음"}</span>
      </section>

      <div className="workspace">
        <section className="canvas-card">
          <div id="game-canvas" aria-label="탑다운 마법 공방 게임 맵" />
          <p className="move-tip">WASD / 방향키로 노란 플레이어 이동</p>
        </section>

        <aside>
          <div className="cauldrons" aria-label="솥 상태">
            <small>CAULDRONS</small>
            {(["cauldron-01", "cauldron-02"] as CauldronId[]).map((id) => {
              const pot = state.cauldrons[id];
              return (
                <article key={id}>
                  <strong>{potNames[id]}</strong>
                  <span>{statusNames[pot.status]}</span>
                  <b>{pot.timerMs ? `${(pot.timerMs / 1000).toFixed(1)}초` : "—"}</b>
                </article>
              );
            })}
          </div>

          <div className="slime-statuses" aria-label="슬라임 작업 큐">
            <article>
              <strong>말랑 · {slime.status}</strong>
              <span>현재: {slime.current?.action ?? "없음"}</span>
              <span>소지: {slime.carrying ? carriedNames[slime.carrying] : "없음"}</span>
              <span>
                대기 큐: {slime.queue.length
                  ? slime.queue.map(({ action }) => action).join(" → ")
                  : "비어 있음"}
              </span>
            </article>
          </div>

          <div className="event" role="status" aria-live="polite">
            <small>최근 상황</small>
            <strong>{state.lastEvent}</strong>
          </div>

          <button
            className="mic"
            onClick={toggleMic}
            disabled={state.phase !== "playing"}
          >
            🎙 {recorder.current?.state === "recording" ? "녹음 중지" : "음성 명령"}
          </button>
          <p className="mic-state">{mic}</p>

          <div className="debug">
            <small>키 없이 시연 · 명령 JSON</small>
            <label>
              작업할 솥
              <select
                value={selectedCauldron}
                onChange={(event) =>
                  setSelectedCauldron(event.target.value as CauldronId)
                }
              >
                <option value="cauldron-01">왼쪽 솥</option>
                <option value="cauldron-02">오른쪽 솥</option>
              </select>
            </label>
            <button onClick={() => run("GET_HERB")}>1. 약초 가져오기</button>
            <button onClick={() => run("ADD_HERB", selectedCauldron)}>2. 약초 넣기</button>
            <button onClick={() => run("MIX", selectedCauldron)}>3. 젓기</button>
            <button onClick={() => run("GET_PARCHMENT")}>4. 양피지 가져오기</button>
            <button onClick={() => run("DIP_PARCHMENT", selectedCauldron)}>5. 양피지 담그기</button>
            <button onClick={() => run("TAKE_BOOK", selectedCauldron)}>6. 마도서 꺼내기</button>
            <button onClick={() => run("SUBMIT")}>7. 납품하기</button>
          </div>
        </aside>
      </div>

      {state.phase !== "playing" && (
        <section
          className="result-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <div>
            <p className="eyebrow">{state.phase === "won" ? "SUCCESS" : "TIME UP"}</p>
            <h2 id="result-title">{result}</h2>
            <button
              autoFocus
              onClick={() => {
                setState(initialState());
                setMic("마이크 준비");
              }}
            >
              처음부터 다시
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
