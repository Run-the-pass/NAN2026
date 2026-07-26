"use client";

import * as Phaser from "phaser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TILE_SIZE,
  WORKSHOP_ROWS,
  command,
  displayTiles,
  executeEnvelope,
  initialState,
  isWalkable,
  movePlayer,
  pixelToTile,
  playerStartTile,
  slimeTypes,
  statTables,
  tick,
  tileCenter,
  validateEnvelope,
  type Action,
  type ActorId,
  type CauldronId,
  type GameState,
  type SlimeTypeId,
} from "../game/core";

type View = { sync: (state: GameState) => void };

const typeColors: Record<SlimeTypeId, number> = {
  nerd: 0x7d8bff,
  swift: 0x93e675,
  keen: 0xffd46b,
  worker: 0xe07b39,
};
const typeCssColors: Record<SlimeTypeId, string> = {
  nerd: "#7d8bff",
  swift: "#93e675",
  keen: "#ffd46b",
  worker: "#e07b39",
};
const allTypeIds = Object.keys(slimeTypes) as SlimeTypeId[];
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
const carriedIcons = { herb: "🌿", parchment: "📜", book: "📘" } as const;
const alertIcons: Record<string, string> = {
  NOT_HEARD: "🙉",
  TOO_COMPLEX: "🤯",
  QUEUE_FULL: "❗",
};
const actionNames: Record<Action, string> = {
  GET_HERB: "약초 가져오기",
  ADD_HERB: "약초 넣기",
  MIX: "젓기",
  GET_PARCHMENT: "양피지 가져오기",
  DIP_PARCHMENT: "양피지 담그기",
  TAKE_BOOK: "마도서 꺼내기",
  SUBMIT: "납품하기",
};
const targetNames: Record<string, string> = {
  "herb-box": "약초 상자",
  "parchment-box": "양피지 상자",
  "cauldron-01": "왼쪽 솥",
  "cauldron-02": "오른쪽 솥",
  "submission-table": "납품대",
};

// 문서의 실패 구분: 인식 실패 / 해석 실패 / (상태 불가와 접수는 최근
// 상황·슬라임 알림으로 표시)
type VoiceFeedback = {
  kind: "accepted" | "uninterpreted" | "unheard";
  transcript: string | null;
  commands: string[];
  detail: string;
};
const voiceKindLabels: Record<VoiceFeedback["kind"], string> = {
  accepted: "음성 명령 접수",
  uninterpreted: "문장은 들었지만 명령으로 해석하지 못함",
  unheard: "음성을 인식하지 못함",
};
const statRows = [
  ["🔨", "작업 속도", "workSpeed"],
  ["👟", "이동 속도", "moveSpeed"],
  ["👂", "청력", "hearing"],
  ["🎯", "집중력", "focus"],
] as const;

type Metrics = {
  voiceCommands: number;
  buttonCommands: number;
  voiceFailures: number;
  confidenceSum: number;
};

const emptyMetrics = (): Metrics => ({
  voiceCommands: 0,
  buttonCommands: 0,
  voiceFailures: 0,
  confidenceSum: 0,
});

function StatGauges({ levels }: { levels: Record<string, number> }) {
  return (
    <ul className="slime-stats">
      {statRows.map(([icon, label, key]) => (
        <li key={key}>
          <span aria-hidden>{icon}</span>
          <span>{label}</span>
          <span
            className="stat-gauge"
            role="img"
            aria-label={`${label} 레벨 ${levels[key]} / 5`}
          >
            {[0, 1, 2, 3, 4].map((cell) => (
              <i key={cell} data-on={cell < levels[key] ? "" : undefined} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Game() {
  const [squad, setSquad] = useState<SlimeTypeId[] | null>(null);
  // 첫 직원은 1마리로 시작한다. 코어는 1~3마리를 지원하지만 선택
  // 화면은 한 마리만 고르게 한다.
  const [picked, setPicked] = useState<SlimeTypeId>("keen");
  const [state, setState] = useState<GameState | null>(null);
  const [selectedActor, setSelectedActor] = useState<ActorId>("keen");
  const [selectedCauldron, setSelectedCauldron] = useState<CauldronId | "auto">(
    "auto",
  );
  const [mic, setMic] = useState("마이크 준비");
  const [voice, setVoice] = useState<VoiceFeedback | null>(null);
  const [saved, setSaved] = useState("");
  const [hoveredActor, setHoveredActor] = useState<ActorId | null>(null);
  const stateRef = useRef(state);
  const view = useRef<View | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const voiceFrame = useRef(0);
  const listening = useRef(false);
  const voiceBusy = useRef(false);
  const metrics = useRef<Metrics>(emptyMetrics());
  const savedRef = useRef(false);
  const roundSeed = useRef(0);
  // 청력 판정에 쓰는 플레이어 위치. Phaser가 매 프레임 갱신한다.
  const playerPos = useRef(tileCenter(playerStartTile));

  const stopMic = useCallback((message?: string) => {
    listening.current = false;
    cancelAnimationFrame(voiceFrame.current);
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    micStream.current?.getTracks().forEach((track) => track.stop());
    void audioContext.current?.close();
    recorder.current = null;
    micStream.current = null;
    audioContext.current = null;
    voiceBusy.current = false;
    if (message) setMic(message);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state?.phase && state.phase !== "playing") {
      stopMic("라운드 종료 · 음성 인식 꺼짐");
    }
  }, [state?.phase, stopMic]);

  useEffect(() => () => stopMic(), [stopMic]);

  useEffect(() => {
    if (!squad) return;
    // 탭이 백그라운드로 가면 인터벌이 스로틀되므로 고정 50ms 대신
    // 실제 경과 시간을 델타로 넘겨 게임 시간이 벽시계와 함께 흐르게 한다.
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setState((current) => (current ? tick(current, delta) : current));
    }, 50);
    return () => window.clearInterval(timer);
  }, [squad]);

  useEffect(() => {
    if (state) view.current?.sync(state);
  }, [state]);

  // 한 판이 끝나면 요약 지표를 한 번만 저장한다.
  useEffect(() => {
    if (!state || state.phase === "playing" || savedRef.current) return;
    savedRef.current = true;
    const counts = metrics.current;
    setSaved("기록 저장 중…");
    fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seed: roundSeed.current,
        result: state.phase,
        booksSubmitted: state.submitted,
        goal: state.goal,
        elapsedMs: 180_000 - state.timeLeftMs,
        voiceCommands: counts.voiceCommands,
        buttonCommands: counts.buttonCommands,
        voiceFailures: counts.voiceFailures,
        avgConfidence: counts.voiceCommands
          ? counts.confidenceSum / counts.voiceCommands
          : null,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error || "기록 저장 실패");
        }
        setSaved("플레이 기록을 저장했습니다.");
      })
      .catch((error: unknown) => {
        setSaved(error instanceof Error ? error.message : "기록 저장 실패");
      });
  }, [state]);

  useEffect(() => {
    if (!squad) return;
    const roster = squad;
    class Workshop extends Phaser.Scene {
      slimes!: Partial<
        Record<
          ActorId,
          {
            body: Phaser.GameObjects.Container;
            carried: Phaser.GameObjects.Text;
            range: Phaser.GameObjects.Arc;
          }
        >
      >;
      pots!: Record<CauldronId, Phaser.GameObjects.Text>;

      create() {
        this.cameras.main.setBackgroundColor("#171527");
        const colors: Record<string, number> = {
          ".": 0x332f48,
          "#": 0x171527,
          B: 0x4f74c2,
          T: 0x8a8a8a,
          H: 0x2f8f4e,
          P: 0x7a3fa8,
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
        // 참고 이미지처럼 두 솥을 노랑·주황으로 구분한다.
        const potColors: Record<CauldronId, number> = {
          "cauldron-01": 0xe8a520,
          "cauldron-02": 0xd96f2e,
        };
        for (const id of ["cauldron-01", "cauldron-02"] as CauldronId[]) {
          const { x, y } = tileCenter(displayTiles[id]);
          this.add
            .rectangle(x, y, TILE_SIZE, TILE_SIZE, potColors[id])
            .setStrokeStyle(1, 0xc6a6ff, 0.48);
        }
        const label = (
          tile: { col: number; row: number },
          icon: string,
          text: string,
          offsetX = 0,
        ) => {
          const { x, y } = tileCenter(tile);
          this.add
            .text(x + offsetX, y - 7, icon, { fontSize: "26px" })
            .setOrigin(0.5)
            .setDepth(2);
          this.add
            .text(x + offsetX, y + 20, text, {
              color: "#f8efff",
              fontFamily: "sans-serif",
              fontSize: "11px",
              fontStyle: "bold",
              align: "center",
            })
            .setOrigin(0.5)
            .setDepth(2);
        };
        label(displayTiles.herb, "🌿", "약초 상자", 26);
        label(displayTiles.parchment, "📜", "양피지 상자", -26);
        label(displayTiles.submission, "📚", "납품대");

        this.pots = {
          "cauldron-01": this.add
            .text(0, 0, "", { fontSize: "22px", align: "center" })
            .setOrigin(0.5)
            .setDepth(3),
          "cauldron-02": this.add
            .text(0, 0, "", { fontSize: "22px", align: "center" })
            .setOrigin(0.5)
            .setDepth(3),
        };
        for (const id of ["cauldron-01", "cauldron-02"] as CauldronId[]) {
          const position = tileCenter(displayTiles[id]);
          this.pots[id].setPosition(position.x, position.y);
        }

        this.slimes = {};
        const current = stateRef.current;
        for (const actorId of roster) {
          const actor = current?.actors[actorId];
          if (!actor) continue;
          const body = this.add
            .ellipse(0, 0, 48, 42, typeColors[actorId])
            .setStrokeStyle(3, 0xffffff);
          const name = this.add
            .text(0, -34, actor.name, {
              color: "#f8efff",
              fontFamily: "sans-serif",
              fontSize: "12px",
              fontStyle: "bold",
            })
            .setOrigin(0.5);
          const container = this.add
            .container(actor.x, actor.y, [body, name])
            .setDepth(5)
            .setInteractive(
              new Phaser.Geom.Rectangle(-24, -21, 48, 42),
              Phaser.Geom.Rectangle.Contains,
            )
            .on("pointerover", () => setHoveredActor(actorId))
            .on("pointerout", () =>
              setHoveredActor((prev) => (prev === actorId ? null : prev)),
            );
          const carried = this.add
            .text(actor.x, actor.y - 52, "", { fontSize: "24px" })
            .setOrigin(0.5)
            .setDepth(8);
          // 청력 범위. 이 원 밖에서 부른 명령은 NOT_HEARD가 된다.
          const range = this.add
            .circle(
              actor.x,
              actor.y,
              statTables.hearingRangeTiles[actor.statLevels.hearing] *
                TILE_SIZE,
            )
            .setStrokeStyle(1.5, typeColors[actorId], 0.28)
            .setDepth(1);
          this.slimes[actorId] = { body: container, carried, range };
        }
        // 슬라임이 움직여 커서 밑에서 벗어나도 pointerout이 뜨도록 매 프레임
        // 히트 테스트를 갱신한다.
        this.input.setPollAlways();

        // 참고 이미지의 중앙 붉은 타원 = 플레이어.
        const start = tileCenter(playerStartTile);
        const playerBody = this.add
          .ellipse(0, 0, 42, 52, 0xd7263d)
          .setStrokeStyle(3, 0xffffff);
        const playerLabel = this.add
          .text(0, -38, "플레이어", {
            color: "#ffd7dd",
            fontFamily: "sans-serif",
            fontSize: "11px",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        const player = this.add
          .container(start.x, start.y, [playerBody, playerLabel])
          .setDepth(6);
        playerPos.current = { x: start.x, y: start.y };
        const keys = this.input.keyboard?.addKeys(
          "W,A,S,D,UP,DOWN,LEFT,RIGHT",
        ) as Record<string, Phaser.Input.Keyboard.Key>;
        const canStand = (x: number, y: number) =>
          [-16, 16].every((offsetX) =>
            [-16, 16].every((offsetY) =>
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
          playerPos.current = { x: player.x, y: player.y };
        });

        view.current = {
          sync: (current) => {
            for (const actorId of roster) {
              const actor = current.actors[actorId];
              const sprite = this.slimes[actorId];
              if (!actor || !sprite) continue;
              sprite.body.setPosition(actor.x, actor.y);
              sprite.range.setPosition(actor.x, actor.y);
              const icon = actor.alert
                ? alertIcons[actor.alert]
                : actor.carrying
                  ? carriedIcons[actor.carrying]
                  : "";
              sprite.carried
                .setText(icon ?? "")
                .setPosition(actor.x, actor.y - 52);
            }
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
        if (stateRef.current) view.current.sync(stateRef.current);
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
  }, [squad]);

  function startRound(list: SlimeTypeId[]) {
    const next = initialState(2026, list);
    metrics.current = emptyMetrics();
    savedRef.current = false;
    roundSeed.current = next.seed;
    setSaved("");
    setMic("마이크 준비");
    setVoice(null);
    setSelectedActor(list[0]);
    setSelectedCauldron("auto");
    setHoveredActor(null);
    setState(next);
    setSquad(list);
    void startListening(list);
  }

  function run(action: Action) {
    const envelope = command(
      selectedActor,
      action,
      selectedCauldron === "auto" ? undefined : selectedCauldron,
    );
    const checked = validateEnvelope(envelope);
    if (!checked.ok) {
      setState((current) =>
        current ? { ...current, lastEvent: checked.reason } : current,
      );
      return;
    }
    metrics.current.buttonCommands += 1;
    setState((current) =>
      current
        ? executeEnvelope(
            movePlayer(current, playerPos.current.x, playerPos.current.y),
            checked.value,
          )
        : current,
    );
  }

  async function submitVoice(blob: Blob, list: SlimeTypeId[]) {
    setMic("Gemini 해석 중…");
    const form = new FormData();
    form.append("audio", blob, "command.webm");
    form.append("actors", list.join(","));
    try {
      const response = await fetch("/api/command", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        reason?: string;
        transcript?: string | null;
      };
      const transcript =
        typeof payload.transcript === "string" ? payload.transcript : null;
      if (!response.ok) {
        const reason = payload.reason || "명령 해석 실패";
        metrics.current.voiceFailures += 1;
        setMic(`${reason} · 계속 듣는 중`);
        setVoice({
          // 문장이 있으면 해석 실패, 없으면 인식 실패로 구분한다.
          kind: transcript ? "uninterpreted" : "unheard",
          transcript,
          commands: [],
          detail: reason,
        });
        setState((current) =>
          current ? { ...current, lastEvent: reason } : current,
        );
        return;
      }
      const checked = validateEnvelope(payload);
      if (!checked.ok) {
        metrics.current.voiceFailures += 1;
        setMic(`${checked.reason} · 계속 듣는 중`);
        setVoice({
          kind: "uninterpreted",
          transcript,
          commands: [],
          detail: checked.reason,
        });
        setState((current) =>
          current ? { ...current, lastEvent: checked.reason } : current,
        );
        return;
      }
      metrics.current.voiceCommands += 1;
      metrics.current.confidenceSum += checked.value.confidence;
      setVoice({
        kind: "accepted",
        transcript,
        commands: checked.value.commands.map((item) => {
          const name = slimeTypes[item.actorId].name;
          const target = item.targetId
            ? targetNames[item.targetId]
            : "가까운 솥 자동";
          return `${name} · ${actionNames[item.action]} → ${target}`;
        }),
        detail: `신뢰도 ${Math.round(checked.value.confidence * 100)}% · 실행 가능 여부는 최근 상황에서 확인`,
      });
      setState((current) =>
        current
          ? executeEnvelope(
              movePlayer(current, playerPos.current.x, playerPos.current.y),
              checked.value,
            )
          : current,
      );
      setMic(
        `인식 완료 · 신뢰도 ${Math.round(checked.value.confidence * 100)}% · 계속 듣는 중`,
      );
    } catch {
      const reason = "음성 서버에 연결하지 못했습니다.";
      metrics.current.voiceFailures += 1;
      setMic(`${reason} · 계속 듣는 중`);
      setVoice({
        kind: "unheard",
        transcript: null,
        commands: [],
        detail: reason,
      });
      setState((current) =>
        current ? { ...current, lastEvent: reason } : current,
      );
    }
  }

  async function startListening(list: SlimeTypeId[]) {
    if (listening.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      micStream.current = stream;
      audioContext.current = context;
      listening.current = true;
      setMic("상시 음성 인식 중 · 말씀하세요");

      let lastVoiceAt = 0;
      let startedAt = 0;
      const watchVoice = () => {
        if (!listening.current) return;
        analyser.getByteTimeDomainData(samples);
        const level = Math.sqrt(
          samples.reduce((sum, sample) => {
            const value = (sample - 128) / 128;
            return sum + value * value;
          }, 0) / samples.length,
        );
        const now = performance.now();
        const active = recorder.current?.state === "recording";

        if (!active && !voiceBusy.current && level > 0.035) {
          const chunks: Blob[] = [];
          const next = new MediaRecorder(stream);
          recorder.current = next;
          startedAt = now;
          lastVoiceAt = now;
          next.ondataavailable = (event) => chunks.push(event.data);
          next.onstop = () => {
            const blob = new Blob(chunks, { type: next.mimeType });
            void submitVoice(blob, list).finally(() => {
              voiceBusy.current = false;
            });
          };
          next.start();
          setMic("말씀을 듣는 중…");
        } else if (active) {
          if (level > 0.02) lastVoiceAt = now;
          if (now - lastVoiceAt > 800 || now - startedAt > 8_000) {
            voiceBusy.current = true;
            recorder.current?.stop();
          }
        }

        voiceFrame.current = requestAnimationFrame(watchVoice);
      };
      watchVoice();
    } catch {
      stopMic("마이크 권한이 필요합니다. 버튼을 눌러 다시 시도하세요.");
    }
  }

  // 슬라임 선택 화면
  if (!squad || !state) {
    return (
      <main className="game-shell">
        <header>
          <div>
            <p className="eyebrow">VOICE-LED ARCANE WORKSHOP</p>
            <h1>터진다! 슬라임 공방</h1>
          </div>
          <div className="round-badge">3 MIN FUN TEST</div>
        </header>
        <section className="select-screen" aria-label="슬라임 선택">
          <p className="select-guide">
            공방의 첫 직원 슬라임을 1마리 고르세요. 음성으로 이름을 불러
            지휘하고, 청력이 낮은 슬라임에게는 가까이 가서 말해야 합니다.
            목표는 3분 안에 마도서 8권 납품입니다.
          </p>
          <div className="select-grid">
            {allTypeIds.map((typeId) => {
              const kind = slimeTypes[typeId];
              const active = picked === typeId;
              return (
                <button
                  key={typeId}
                  className="slime-select-card"
                  data-active={active ? "" : undefined}
                  aria-pressed={active}
                  onClick={() => setPicked(typeId)}
                >
                  <span
                    className="slime-portrait"
                    style={{ background: typeCssColors[typeId] }}
                    aria-hidden
                  >
                    <i />
                    <i />
                  </span>
                  <strong>{kind.name} 슬라임</strong>
                  <small>{kind.trait}</small>
                  <StatGauges levels={kind.statLevels} />
                </button>
              );
            })}
          </div>
          <footer className="select-footer">
            <span>첫 직원: {slimeTypes[picked].name} 슬라임</span>
            <button className="select-start" onClick={() => startRound([picked])}>
              공방 가동 시작
            </button>
          </footer>
        </section>
      </main>
    );
  }

  const hovered = hoveredActor ? state.actors[hoveredActor] : null;
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

      <div className="workspace">
        <aside className="side-badges" aria-label="시간과 골드">
          <div className="badge">
            <small>남은 시간</small>
            <strong>⏱ {state.timeLeft}초</strong>
          </div>
          <div className="badge">
            <small>획득 골드</small>
            <strong>💰 {state.gold}G</strong>
            <span>📚 납품 {state.submitted} / {state.goal}</span>
          </div>
        </aside>

        <section className="canvas-card">
          <div id="game-canvas" aria-label="탑다운 마법 공방 게임 맵" />
          <p className="move-tip">
            WASD / 방향키로 플레이어 이동 · 청력 원 밖 명령은 들리지 않음
          </p>
          {hovered && (
            <aside
              className="slime-card"
              data-below={hovered.y < 300 ? "" : undefined}
              style={{
                left: `${Math.min(84, Math.max(16, (hovered.x / 960) * 100))}%`,
                top: `${(hovered.y / 600) * 100}%`,
              }}
            >
              <header>
                <span
                  className="slime-portrait"
                  style={{ background: typeCssColors[hovered.typeId] }}
                  aria-hidden
                >
                  <i />
                  <i />
                </span>
                <div>
                  <strong>{hovered.name}</strong>
                  <small>{slimeTypes[hovered.typeId].trait}</small>
                </div>
              </header>
              <StatGauges levels={hovered.statLevels} />
              <footer>
                <small>받은 버프</small>
                {hovered.buffs.length ? (
                  <div className="slime-buffs">
                    {hovered.buffs.map((buff) => (
                      <span key={buff}>{buff}</span>
                    ))}
                  </div>
                ) : (
                  <span className="slime-buffs-empty">없음</span>
                )}
              </footer>
            </aside>
          )}
        </section>

        <aside>
          <div className="recipe" aria-label="레시피와 목표">
            <small>📖 마도서 레시피</small>
            <ol>
              <li>🌿 약초 상자에서 약초 가져오기</li>
              <li>🫕 빈 솥에 약초 넣고 젓기 → ⏱ 5초</li>
              <li>📜 양피지 가져와 솥에 담그기 → ⏱ 5초</li>
              <li>📘 완성된 마도서 꺼내기</li>
              <li>📚 납품대에 납품하면 +100G</li>
            </ol>
            <strong>🎯 3분 안에 8권 납품하면 승리</strong>
          </div>

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
            {squad.map((actorId) => {
              const actor = state.actors[actorId];
              if (!actor) return null;
              return (
                <article key={actorId}>
                  <strong style={{ color: typeCssColors[actorId] }}>
                    {actor.name} · {actor.status}
                    {actor.alert ? ` ${alertIcons[actor.alert]}` : ""}
                  </strong>
                  <span>
                    현재: {actor.current
                      ? `${actor.current.action}${
                          actor.current.targetId &&
                          actor.current.targetId in potNames
                            ? ` · ${potNames[actor.current.targetId as CauldronId]}`
                            : ""
                        }`
                      : "없음"}
                  </span>
                  <span>
                    소지: {actor.carrying ? carriedNames[actor.carrying] : "없음"}
                    {" · 큐 "}
                    {actor.queue.length}/{statTables.focusCapacity[actor.statLevels.focus]}
                  </span>
                  <span>
                    대기: {actor.queue.length
                      ? actor.queue.map(({ action }) => action).join(" → ")
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

          <button
            className="mic"
            onClick={() => void startListening(squad)}
            disabled={state.phase !== "playing" || listening.current}
          >
            🎙 {listening.current ? "상시 음성 인식 중" : "음성 인식 켜기"}
          </button>
          <p className="mic-state">{mic}</p>

          {voice && (
            <div
              className="voice-feedback"
              data-kind={voice.kind}
              role="status"
              aria-label="마지막 음성 명령 해석"
            >
              <small>{voiceKindLabels[voice.kind]}</small>
              {voice.transcript && <q>{voice.transcript}</q>}
              {voice.commands.map((line) => (
                <span key={line}>{line}</span>
              ))}
              <em>{voice.detail}</em>
            </div>
          )}

          <details className="debug-wrap">
            <summary>🛠 키 없이 시연 · 디버그 버튼</summary>
            <div className="debug">
            <label>
              지시할 슬라임
              <select
                value={selectedActor}
                onChange={(event) =>
                  setSelectedActor(event.target.value as ActorId)
                }
              >
                {squad.map((actorId) => (
                  <option key={actorId} value={actorId}>
                    {slimeTypes[actorId].name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              작업할 솥
              <select
                value={selectedCauldron}
                onChange={(event) =>
                  setSelectedCauldron(event.target.value as CauldronId | "auto")
                }
              >
                <option value="auto">가까운 솥 자동</option>
                <option value="cauldron-01">왼쪽 솥</option>
                <option value="cauldron-02">오른쪽 솥</option>
              </select>
            </label>
            <button onClick={() => run("GET_HERB")}>1. 약초 가져오기</button>
            <button onClick={() => run("ADD_HERB")}>2. 약초 넣기</button>
            <button onClick={() => run("MIX")}>3. 젓기</button>
            <button onClick={() => run("GET_PARCHMENT")}>4. 양피지 가져오기</button>
            <button onClick={() => run("DIP_PARCHMENT")}>5. 양피지 담그기</button>
            <button onClick={() => run("TAKE_BOOK")}>6. 마도서 꺼내기</button>
            <button onClick={() => run("SUBMIT")}>7. 납품하기</button>
            </div>
          </details>
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
            <p className="mic-state">
              💰 {state.gold}G · 📚 {state.submitted}/{state.goal}
            </p>
            <p className="mic-state">{saved}</p>
            <div className="result-actions">
              <button autoFocus onClick={() => startRound(squad)}>
                같은 스쿼드로 다시
              </button>
              <button
                onClick={() => {
                  setSquad(null);
                  setState(null);
                }}
              >
                슬라임 다시 선택
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
