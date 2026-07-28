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
  movePlayer,
  nextPlayerAction,
  pixelToTile,
  playerAct,
  playerStartTile,
  redirectCarried,
  slimeTypes,
  statTables,
  taskTiles,
  tick,
  tileCenter,
  validateEnvelope,
  voiceRadiusPx,
  STORAGE_MAX,
  SUMMON_MAX,
  allItems,
  allStations,
  isValidRoute,
  itemLabel,
  stationLabels,
  type ActorId,
  type GameState,
  type ItemId,
  type SlimeTypeId,
  type StationId,
} from "../game/core";
import { nextHint } from "../game/hint";
import { matchCarriedPhrase, matchPhrase } from "../game/phrase";
import {
  facingFromDelta,
  facings,
  slimeDataUri,
  type Facing,
} from "./slime-art";

type View = { sync: (state: GameState) => void };

// Web Speech API는 표준 d.ts에 없어 쓰는 만큼만 좁게 선언한다.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (event: SpeechRecognitionEventLike) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

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
// 캔버스 내부 해상도 배율. 카메라 zoom도 같은 값을 써서 보이는
// 영역은 그대로 두고 픽셀만 촘촘하게 만든다.
const RENDER_SCALE = 3;
// 텍스처는 world 58x45로 그린다. 확대에 견디도록 넉넉히 구워 둔다.
const SLIME_TEXTURE = { width: 348, height: 270 };
const SLIME_SCALE = 58 / SLIME_TEXTURE.width;
// 젓기만 손에 드는 것이 없어 따로 보여 줘야 한다.
type Motion = "idle" | "walk" | "stir" | "pick";
const itemIcons: Record<ItemId, string> = {
  "red-herb": "🍁",
  "blue-herb": "🌿",
  "red-potion": "🧪",
  "blue-potion": "🫙",
  "red-scroll": "📕",
  "blue-scroll": "📘",
};
const alertIcons: Record<string, string> = {
  NOT_HEARD: "🙉",
  TOO_COMPLEX: "🤯",
  QUEUE_FULL: "❗",
  SOURCE_EMPTY: "🫙",
  TARGET_FULL: "🚫",
  INVALID_ROUTE: "❓",
};
// 설비 타일 색. 소환진은 자원 색, 가공은 보라, 출구는 회색 계열.
const stationColors: Record<StationId, number> = {
  "summon-red": 0xb2432f,
  "summon-blue": 0x2f5fb2,
  brewer: 0x6b4aa0,
  table: 0x8a6a2f,
  submission: 0x3f7f4a,
  trash: 0x585264,
};
const stationIcons: Record<StationId, string> = {
  "summon-red": "🔴",
  "summon-blue": "🔵",
  brewer: "⚗️",
  table: "📜",
  submission: "📬",
  trash: "🗑",
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
  const [selectedItem, setSelectedItem] = useState<ItemId>("red-herb");
  const [selectedTarget, setSelectedTarget] = useState<StationId>("brewer");
  const [mic, setMic] = useState("마이크 준비");
  const [voice, setVoice] = useState<VoiceFeedback | null>(null);

  const [saved, setSaved] = useState("");
  const [hoveredActor, setHoveredActor] = useState<ActorId | null>(null);
  const stateRef = useRef(state);
  const view = useRef<View | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const listening = useRef<SpeechRecognitionLike | null>(null);
  const micHeld = useRef(false);
  const recognizedText = useRef("");
  // 발화 중 가장 컸던 목소리. 소리 원 반지름을 정하는 값이다.
  const loudness = useRef(0);
  const meter = useRef<{ stop: () => void } | null>(null);
  // 지금 내는 소리 크기. Phaser가 소리 원을 그릴 때 읽는다.
  const voiceLevel = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const metrics = useRef<Metrics>(emptyMetrics());
  const savedRef = useRef(false);
  const roundSeed = useRef(0);
  // 청력 판정에 쓰는 플레이어 위치. Phaser가 매 프레임 갱신한다.
  const playerPos = useRef(tileCenter(playerStartTile));
  const phase = state?.phase;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!phase || phase === "playing") return;
    micHeld.current = false;
    listening.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
    meter.current?.stop();
  }, [phase]);

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
        booksSubmitted: state.filled,
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
            art: Phaser.GameObjects.Image;
            carried: Phaser.GameObjects.Text;
            range: Phaser.GameObjects.Arc;
            facing: Facing;
            last: { x: number; y: number };
            mode: Motion;
            blinking: boolean;
            motion: Phaser.Tweens.Tween;
          }
        >
      >;
      stations!: Record<StationId, Phaser.GameObjects.Text>;

      // 가만히 있을 때: 원본 SVG의 숨쉬기를 tween으로 옮긴 것.
      breathe(art: Phaser.GameObjects.Image) {
        art.setScale(SLIME_SCALE);
        return this.tweens.add({
          targets: art,
          scaleX: SLIME_SCALE * 0.985,
          scaleY: SLIME_SCALE * 1.035,
          y: -2,
          duration: 1600,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // 걸을 때: 더 짧고 크게 통통 튄다.
      walk(art: Phaser.GameObjects.Image) {
        art.setScale(SLIME_SCALE);
        return this.tweens.add({
          targets: art,
          scaleX: SLIME_SCALE * 1.06,
          scaleY: SLIME_SCALE * 0.9,
          y: 3,
          duration: 240,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // 젓기: 팔이 없으니 몸을 좌우로 기울여 젓는다.
      stir(art: Phaser.GameObjects.Image) {
        art.setScale(SLIME_SCALE).setAngle(-12);
        return this.tweens.add({
          targets: art,
          angle: 12,
          duration: 260,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // 집기·놓기: 푹 눌렸다 펴지는 한 동작.
      pick(art: Phaser.GameObjects.Image) {
        art.setScale(SLIME_SCALE);
        return this.tweens.add({
          targets: art,
          scaleX: SLIME_SCALE * 1.12,
          scaleY: SLIME_SCALE * 0.8,
          y: 6,
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: "Quad.easeOut",
        });
      }

      startMotion(art: Phaser.GameObjects.Image, mode: Motion) {
        if (mode === "walk") return this.walk(art);
        if (mode === "stir") return this.stir(art);
        if (mode === "pick") return this.pick(art);
        return this.breathe(art);
      }

      // 방향과 깜빡임 상태를 하나의 텍스처 키로 합쳐 적용한다.
      paintSlime(actorId: ActorId) {
        const sprite = this.slimes[actorId];
        if (!sprite) return;
        const blink = sprite.blinking && sprite.facing !== "up" ? "-blink" : "";
        sprite.art.setTexture(`slime-${actorId}-${sprite.facing}${blink}`);
      }

      preload() {
        for (const actorId of roster) {
          for (const facing of facings) {
            for (const blink of [false, true]) {
              this.load.svg(
                `slime-${actorId}-${facing}${blink ? "-blink" : ""}`,
                slimeDataUri(actorId, facing, { blink }),
                SLIME_TEXTURE,
              );
            }
          }
        }
      }

      create() {
        this.cameras.main
          .setBackgroundColor("#171527")
          .setZoom(RENDER_SCALE)
          .centerOn(480, 300);
        // 홈 화면(bg.png + #2f1500 오버레이)과 같은 나무 공방 톤.
        // 바닥은 어두운 판자, 벽은 밝은 판자, 그 위에 마법 기운을 얹는다.
        const planks = this.add.graphics().setDepth(0);
        WORKSHOP_ROWS.forEach((row, rowIndex) => {
          [...row].forEach((tile, colIndex) => {
            const { x, y } = tileCenter({ col: colIndex, row: rowIndex });
            const left = x - TILE_SIZE / 2;
            const top = y - TILE_SIZE / 2;
            const wall = tile === "#";
            // 판자마다 결이 조금씩 다르게 보이도록 행마다 색을 흔든다.
            const shade = (rowIndex * 7 + colIndex * 13) % 3;
            planks.fillStyle(
              wall
                ? [0xa9713a, 0xb0773e, 0xa26c36][shade]
                : [0x402514, 0x452917, 0x3b2112][shade],
              1,
            );
            planks.fillRect(left, top, TILE_SIZE, TILE_SIZE);
            if (wall) {
              // 벽은 세로 널, 바닥은 가로 판자로 결을 반대로 준다.
              planks.fillStyle(0x7d4f26, 0.85);
              planks.fillRect(left + TILE_SIZE - 4, top, 4, TILE_SIZE);
              planks.fillStyle(0xffffff, 0.07);
              planks.fillRect(left + 3, top, 3, TILE_SIZE);
            } else {
              planks.fillStyle(0x2c180d, 0.9);
              planks.fillRect(left, top + TILE_SIZE - 3, TILE_SIZE, 3);
              if ((colIndex + rowIndex) % 2 === 0) {
                planks.fillRect(left, top, 2, TILE_SIZE);
              }
              planks.fillStyle(0xffffff, 0.03);
              planks.fillRect(left, top + 3, TILE_SIZE, 2);
            }
          });
        });
        // 마법 기운: 바닥에 은은한 보라 빛과 떠다니는 불씨.
        const glow = this.add.graphics().setDepth(0);
        glow.fillStyle(0x8b5cf6, 0.07);
        for (const id of ["brewer", "table"] as StationId[]) {
          const { x, y } = tileCenter(displayTiles[id]);
          glow.fillCircle(x, y, 110);
        }
        glow.fillStyle(0x7dd3fc, 0.05);
        for (const id of ["summon-red", "summon-blue"] as StationId[]) {
          const { x, y } = tileCenter(displayTiles[id]);
          glow.fillCircle(x, y, 90);
        }
        for (let index = 0; index < 14; index += 1) {
          const spark = this.add
            .circle(
              Phaser.Math.Between(80, 880),
              Phaser.Math.Between(80, 520),
              Phaser.Math.Between(1, 2),
              0xd9b8ff,
            )
            .setDepth(0)
            .setAlpha(0.5);
          this.tweens.add({
            targets: spark,
            y: spark.y - Phaser.Math.Between(24, 54),
            alpha: 0,
            duration: Phaser.Math.Between(2600, 5200),
            delay: Phaser.Math.Between(0, 2600),
            repeat: -1,
            ease: "Sine.easeOut",
          });
        }
        // 동선은 그대로 두고, 방의 경계와 작업 구역만 더 읽기 쉽게 만든다.
        const decor = this.add.graphics().setDepth(0);
        decor.fillStyle(0x24150c, 0.85);
        decor.fillRect(60, 60, 840, 10).fillRect(60, 530, 840, 10);
        decor.fillStyle(0x8a4f24, 0.35);
        decor.fillRoundedRect(300, 400, 360, 65, 12);
        decor.lineStyle(2, 0xe3a44d, 0.35).strokeRoundedRect(300, 400, 360, 65, 12);
        for (const x of [95, 805]) {
          decor.fillStyle(0x2b170d, 0.9).fillRect(x, 150, 60, 8);
          decor.fillStyle(0x9c5e2c, 0.75).fillRect(x + 8, 130, 18, 20);
          decor.fillStyle(0x7d4321, 0.8).fillRect(x + 32, 136, 18, 14);
        }
        for (const x of [120, 840]) {
          decor.fillStyle(0xf6bd5b, 0.16).fillCircle(x, 105, 54);
          decor.fillStyle(0xf6d48e, 0.95).fillCircle(x, 105, 5);
        }
        // 설비 6종을 서로 다른 실루엣으로 그리고 재고는 sync에서 갱신한다.
        this.stations = {} as Record<StationId, Phaser.GameObjects.Text>;
        for (const id of allStations) {
          const { x, y } = tileCenter(displayTiles[id]);
          const shape = this.add.graphics().setDepth(1);
          if (id.startsWith("summon-")) {
            shape
              .fillStyle(stationColors[id], 0.3)
              .fillCircle(x, y, 28)
              .lineStyle(3, stationColors[id], 0.95)
              .strokeCircle(x, y, 25)
              .lineStyle(1, 0xffe8cb, 0.8)
              .strokeCircle(x, y, 16);
            for (let angle = 0; angle < 360; angle += 60) {
              const rad = Phaser.Math.DegToRad(angle);
              shape.fillStyle(0xffe8cb, 0.85).fillCircle(
                x + Math.cos(rad) * 21,
                y + Math.sin(rad) * 21,
                2,
              );
            }
          } else if (id === "brewer") {
            shape
              .fillStyle(0x241a2b, 1)
              .fillRoundedRect(x - 25, y - 15, 50, 40, 12)
              .fillStyle(stationColors[id], 0.9)
              .fillEllipse(x, y - 13, 50, 15)
              .lineStyle(2, 0xdac7ff, 0.75)
              .strokeEllipse(x, y - 13, 52, 17)
              .fillStyle(0xb58cff, 0.8)
              .fillCircle(x - 9, y - 20, 3)
              .fillCircle(x + 7, y - 25, 4);
          } else if (id === "table") {
            shape
              .fillStyle(0x3d2517, 1)
              .fillRect(x - 25, y - 15, 6, 42)
              .fillRect(x + 19, y - 15, 6, 42)
              .fillStyle(stationColors[id], 1)
              .fillRoundedRect(x - 29, y - 20, 58, 18, 4)
              .lineStyle(2, 0xf1cf87, 0.8)
              .strokeRoundedRect(x - 29, y - 20, 58, 18, 4);
          } else if (id === "submission") {
            shape
              .fillStyle(stationColors[id], 1)
              .fillRoundedRect(x - 27, y - 22, 54, 45, 5)
              .lineStyle(2, 0xb9edbd, 0.75)
              .strokeRoundedRect(x - 27, y - 22, 54, 45, 5)
              .fillStyle(0x183b24, 1)
              .fillRect(x - 14, y - 8, 28, 4);
          } else {
            shape
              .fillStyle(stationColors[id], 1)
              .fillRoundedRect(x - 20, y - 20, 40, 43, 8)
              .fillStyle(0x2b2731, 1)
              .fillEllipse(x, y - 19, 46, 10)
              .lineStyle(2, 0xbdb6c9, 0.55)
              .strokeLineShape(new Phaser.Geom.Line(x - 13, y - 8, x - 13, y + 16))
              .strokeLineShape(new Phaser.Geom.Line(x + 13, y - 8, x + 13, y + 16));
          }
          const workAt = tileCenter(taskTiles[id]);
          this.add
            .circle(workAt.x, workAt.y, 5, stationColors[id], 0.38)
            .setStrokeStyle(1, 0xffefd2, 0.55)
            .setDepth(1);
          this.add
            .text(x, y - 10, stationIcons[id], {
              fontSize: id.startsWith("summon-") ? "18px" : "20px",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setDepth(2);
          this.add
            .text(x, y + 22, stationLabels[id], {
              color: "#f8efff",
              fontFamily: "Jua, sans-serif",
              fontSize: "10px",
              align: "center",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setDepth(2);
          // 재고 표시. 소환진은 약초 수, 가공 설비는 채운 칸.
          this.stations[id] = this.add
            .text(x, y - 30, "", {
              color: "#ffe9b8",
              fontFamily: "Jua, sans-serif",
              fontSize: "12px",
              align: "center",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setDepth(3);
        }

        this.slimes = {};
        const current = stateRef.current;
        for (const actorId of roster) {
          const actor = current?.actors[actorId];
          if (!actor) continue;
          // 텍스처는 116x90으로 굽고 0.5배로 쓴다. tween이 이 값을 기준으로
          // 늘였다 줄였다 하므로 setDisplaySize 대신 스케일로 고정한다.
          const art = this.add
            .image(0, 0, `slime-${actorId}-down`)
            .setScale(SLIME_SCALE);
          const name = this.add
            .text(0, -34, actor.name, {
              color: "#f8efff",
              fontFamily: "Jua, sans-serif",
              fontSize: "12px",
              fontStyle: "bold",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5);
          const container = this.add
            .container(actor.x, actor.y, [art, name])
            .setDepth(5)
            .setInteractive(
              new Phaser.Geom.Rectangle(-29, -23, 58, 45),
              Phaser.Geom.Rectangle.Contains,
            )
            .on("pointerover", () => setHoveredActor(actorId))
            .on("pointerout", () =>
              setHoveredActor((prev) => (prev === actorId ? null : prev)),
            );
          const carried = this.add
            .text(actor.x, actor.y - 52, "", { fontSize: "24px", resolution: RENDER_SCALE })
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
          this.slimes[actorId] = {
            body: container,
            art,
            carried,
            range,
            facing: "down",
            last: { x: actor.x, y: actor.y },
            mode: "idle",
            blinking: false,
            motion: this.breathe(art),
          };
          // 걷는 중에도 눈은 계속 깜빡이도록 몸 tween과 분리해 둔다.
          this.time.addEvent({
            delay: Phaser.Math.Between(3200, 5200),
            loop: true,
            callback: () => {
              const sprite = this.slimes[actorId];
              if (!sprite || sprite.facing === "up") return;
              sprite.blinking = true;
              this.paintSlime(actorId);
              this.time.delayedCall(140, () => {
                const open = this.slimes[actorId];
                if (!open) return;
                open.blinking = false;
                this.paintSlime(actorId);
              });
            },
          });
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
            fontFamily: "Jua, sans-serif",
            fontSize: "11px",
            fontStyle: "bold",
            resolution: RENDER_SCALE,
          })
          .setOrigin(0.5);
        const player = this.add
          .container(start.x, start.y, [playerBody, playerLabel])
          .setDepth(6);
        playerPos.current = { x: start.x, y: start.y };
        // 목소리가 닿는 범위. 슬라임의 청력 원과 겹치면 명령이 들린다.
        const playerCarry = this.add
          .text(start.x, start.y - 52, "", {
            fontSize: "24px",
            resolution: RENDER_SCALE,
          })
          .setOrigin(0.5)
          .setDepth(8);
        const voiceRing = this.add
          .circle(start.x, start.y, 1)
          .setStrokeStyle(2, 0xffd46b, 0.5)
          .setDepth(1)
          .setVisible(false);
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
          playerCarry.setPosition(player.x, player.y - 52);
          const level = voiceLevel.current;
          voiceRing.setPosition(player.x, player.y).setVisible(level > 0.01);
          if (level > 0.01) {
            voiceRing.setRadius(voiceRadiusPx(level));
          }
        });

        view.current = {
          sync: (current) => {
            for (const actorId of roster) {
              const actor = current.actors[actorId];
              const sprite = this.slimes[actorId];
              if (!actor || !sprite) continue;
              const facing = facingFromDelta(
                actor.x - sprite.last.x,
                actor.y - sprite.last.y,
                sprite.facing,
              );
              if (facing !== sprite.facing) {
                sprite.facing = facing;
                this.paintSlime(actorId);
              }
              const mode: Motion =
                actor.status === "MOVING"
                  ? "walk"
                  : actor.status === "WORKING"
                    ? actor.leg === "DELIVER" &&
                      (actor.current?.target === "brewer" ||
                        actor.current?.target === "table")
                      ? "stir"
                      : "pick"
                    : "idle";
              if (mode !== sprite.mode) {
                sprite.mode = mode;
                sprite.motion.stop();
                sprite.art.setAngle(0).setY(0);
                sprite.motion = this.startMotion(sprite.art, mode);
              }
              sprite.last = { x: actor.x, y: actor.y };
              sprite.body.setPosition(actor.x, actor.y);
              sprite.range.setPosition(actor.x, actor.y);
              const icon = actor.alert
                ? alertIcons[actor.alert]
                : actor.carrying
                  ? itemIcons[actor.carrying]
                  : "";
              sprite.carried
                .setText(icon ?? "")
                .setPosition(actor.x, actor.y - 52);
            }
            playerCarry.setText(
              current.player.carrying ? itemIcons[current.player.carrying] : "",
            );
            for (const id of allStations) {
              const label =
                id === "summon-red"
                  ? `${current.summons.red.stock}/${SUMMON_MAX}`
                  : id === "summon-blue"
                    ? `${current.summons.blue.stock}/${SUMMON_MAX}`
                    : id === "brewer"
                      ? `${current.brewer.length}/${STORAGE_MAX}`
                      : id === "table"
                        ? `${current.table.length}/${STORAGE_MAX}`
                        : "";
              this.stations[id].setText(label);
            }
          },
        };
        if (stateRef.current) view.current.sync(stateRef.current);
      }
    }

    // 맵은 960x600 좌표계지만 화면에서는 1.5배 넘게 늘어난다. 캔버스
    // 내부 해상도를 RENDER_SCALE배로 잡고 카메라를 같은 배율로 당겨
    // 같은 영역을 더 촘촘한 픽셀로 그린다.
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-canvas",
      width: 960 * RENDER_SCALE,
      height: 600 * RENDER_SCALE,
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
    setSelectedItem("red-herb");
    setSelectedTarget("brewer");
    setHoveredActor(null);
    setState(next);
    setSquad(list);
  }

  function run(item: ItemId, target: StationId) {
    const envelope = command(selectedActor, item, target);
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

  // E는 직접 조작, 스페이스는 누르는 동안만 음성을 받는다.
  useEffect(() => {
    if (!squad) return;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName);
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return;
      if (event.code === "KeyE") {
        event.preventDefault();
        setState((current) =>
          current
            ? playerAct(
                movePlayer(current, playerPos.current.x, playerPos.current.y),
              )
            : current,
        );
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        startMic();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.code !== "Space") return;
      event.preventDefault();
      stopMic();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      stopMic();
    };
    // 핸들러는 ref만 보므로 squad가 바뀔 때만 다시 건다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad]);

  // 마이크 입력의 RMS로 목소리 크기를 잰다. Web Speech와는 별도
  // 스트림을 열어 소리 원 크기만 계산한다.
  async function startMeter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!micHeld.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let live = true;
      const sample = () => {
        if (!live) return;
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const value of buffer) sum += value * value;
        const rms = Math.sqrt(sum / buffer.length);
        // 말소리 RMS는 대체로 0.02~0.25 범위라 그 구간을 0~1로 편다.
        const level = Math.min(1, Math.max(0, (rms - 0.02) / 0.2));
        loudness.current = Math.max(loudness.current, level);
        voiceLevel.current = level;
        requestAnimationFrame(sample);
      };
      sample();
      meter.current = {
        stop: () => {
          live = false;
          stream.getTracks().forEach((track) => track.stop());
          void context.close();
          meter.current = null;
          voiceLevel.current = 0;
        },
      };
    } catch {
      // 볼륨을 못 재면 기본 크기로 말한 것으로 본다.
      loudness.current = 0.5;
    }
  }

  // 브라우저 내장 STT. 누르는 동안에는 결과만 모으고, 키를 뗀 뒤에만
  // 명령으로 바꾼다. 지원하지 않는 브라우저에서는 false를 돌려 오디오
  // 경로로 넘어간다.
  function startListening() {
    const Recognition =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!Recognition) return false;
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    let canRestart = true;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) recognizedText.current += result[0].transcript;
        else interim += result[0].transcript;
      }
      setMic(`${recognizedText.current}${interim}` || "듣는 중…");
    };
    recognition.onerror = () => {
      canRestart = false;
      setMic("음성을 인식하지 못했습니다.");
    };
    recognition.onend = () => {
      listening.current = null;
      if (micHeld.current && canRestart) {
        startListening();
        return;
      }
      meter.current?.stop();
      if (micHeld.current) return;
      const text = recognizedText.current.trim();
      if (text) void runPhrase(text);
      else {
        metrics.current.voiceFailures += 1;
        setMic("음성을 인식하지 못했습니다.");
        setVoice({
          kind: "unheard",
          transcript: null,
          commands: [],
          detail: "다시 눌러 말해 보세요.",
        });
      }
    };
    listening.current = recognition;
    recognition.start();
    setMic("듣는 중…");
    return true;
  }

  // 브라우저 STT 문장은 로컬 사전까지만 사용한다. Gemini는 Web Speech를
  // 쓸 수 없을 때 녹음한 원본 오디오만 해석한다.
  function runPhrase(text: string) {
    const list = squad ?? [];
    // 물품을 명시한 문장은 짧은 "그거" 계열 오인식보다 우선한다.
    const local = matchPhrase(text, list);
    if (local) {
      metrics.current.voiceCommands += 1;
      metrics.current.confidenceSum += 1;
      setVoice({
        kind: "accepted",
        transcript: text,
        commands: local.map(
          (entry) =>
            `${slimeTypes[entry.actorId].name} · ${itemLabel(entry.item)} → ${stationLabels[entry.target]}`,
        ),
        detail: "즉시 인식",
      });
      setMic("즉시 인식");
      setState((current) =>
        current
          ? executeEnvelope(
              movePlayer(current, playerPos.current.x, playerPos.current.y),
              { status: "OK", confidence: 1, commands: local, reason: null },
              loudness.current,
            )
          : current,
      );
      return;
    }
    const carried = matchCarriedPhrase(text, list);
    if (carried) {
      metrics.current.voiceCommands += 1;
      metrics.current.confidenceSum += 1;
      setVoice({
        kind: "accepted",
        transcript: text,
        commands: [
          `${slimeTypes[carried.actorId].name} · 현재 든 물품 → ${stationLabels[carried.target]}`,
        ],
        detail: "즉시 인식",
      });
      setMic("즉시 인식");
      setState((current) =>
        current
          ? redirectCarried(
              movePlayer(current, playerPos.current.x, playerPos.current.y),
              carried.actorId,
              carried.target,
              loudness.current,
            )
          : current,
      );
      return;
    }
    const reason = "로컬 사전에 없는 문장입니다.";
    metrics.current.voiceFailures += 1;
    setMic(reason);
    setVoice({
      kind: "uninterpreted",
      transcript: text,
      commands: [],
      detail: reason,
    });
    setState((current) =>
      current ? { ...current, lastEvent: reason } : current,
    );
  }

  function startMic() {
    if (micHeld.current) return;
    micHeld.current = true;
    recognizedText.current = "";
    loudness.current = 0;
    void startMeter();
    if (startListening()) return;
    void startRecording();
  }

  function stopMic() {
    if (!micHeld.current) return;
    micHeld.current = false;
    if (listening.current) {
      listening.current.stop();
      return;
    }
    if (recorder.current?.state === "recording") recorder.current.stop();
    else setMic("마이크 준비");
  }

  async function startRecording() {
    if (recorder.current?.state === "recording") {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!micHeld.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
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
        form.append("actors", (squad ?? []).join(","));
        await sendCommand(form);
      };
      next.start();
      setMic("듣는 중… 스페이스를 떼면 전송");
    } catch {
      setMic("마이크 권한이 필요합니다.");
    }
  }

  async function sendCommand(form: FormData) {
    {
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
            setMic(reason);
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
            setMic(checked.reason);
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
            commands: checked.value.commands.map(
              (entry) =>
                `${slimeTypes[entry.actorId].name} · ${itemLabel(entry.item)} → ${stationLabels[entry.target]}`,
            ),
            detail: `신뢰도 ${Math.round(checked.value.confidence * 100)}% · 실행 가능 여부는 최근 상황에서 확인`,
          });
          setState((current) =>
            current
              ? executeEnvelope(
                  movePlayer(
                    current,
                    playerPos.current.x,
                    playerPos.current.y,
                  ),
                  checked.value,
                  loudness.current,
                )
              : current,
          );
          setMic(
            `인식 완료 · 신뢰도 ${Math.round(checked.value.confidence * 100)}%`,
          );
        } catch {
          const reason = "음성 서버에 연결하지 못했습니다.";
          metrics.current.voiceFailures += 1;
          setMic(reason);
          setVoice({ kind: "unheard", transcript: null, commands: [], detail: reason });
          setState((current) =>
            current ? { ...current, lastEvent: reason } : current,
          );
        }
    }
  }

  // 슬라임 선택 화면
  if (!squad || !state) {
    return (
      <main className="select-shell">
        <section className="select-screen" aria-label="슬라임 선택">
          <p className="select-guide">
            공방의 첫 직원 슬라임을 1마리 고르세요. 음성으로 이름을 불러
            지휘하고, 청력이 낮은 슬라임에게는 가까이 가서 말해야 합니다.
            목표는 3분 안에 주문 5건 완료입니다.
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
                  {/* data URI라 요청이 없다. next/image가 최적화할 것이 없다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="slime-portrait"
                    src={slimeDataUri(typeId, "down", { animate: true })}
                    alt=""
                  />
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
  const hint = nextHint(state, squad[0]);
  const reach = nextPlayerAction(state);
  const result =
    state.phase === "won"
      ? "성공! 주문 5건을 완료했습니다."
      : "시간 종료. 다시 공방을 가동해 보세요.";

  return (
    <main className="stage">
      <div className="stage-frame">
        <div id="game-canvas" aria-label="탑다운 마법 공방 게임 맵" />

        <div className="hud-top">
          <span className="hud-chip" data-warn={state.timeLeft <= 30 ? "" : undefined}>
            ⏱ {state.timeLeft}
          </span>
          <span className="hud-chip hud-goal">
            📦 {state.filled} / {state.goal}
          </span>
          <span className="hud-chip">💰 {state.gold}G</span>
        </div>

        <div className="hud-pots" aria-label="주문과 재고">
          {/* 주문은 색과 형태만 보여 준다. 효과명은 쓰지 않는다. */}
          <span className="pot-chip" data-status="ORDER">
            <b>주문</b>
            {(Object.entries(state.order.need) as [ItemId, number][]).map(
              ([item, count]) => (
                <span key={item}>
                  {itemIcons[item]} {state.order.done[item] ?? 0}/{count}
                </span>
              ),
            )}
          </span>
          <span className="pot-chip">
            <b>소환진</b>
            🔴 {state.summons.red.stock}/{SUMMON_MAX} 🔵{" "}
            {state.summons.blue.stock}/{SUMMON_MAX}
          </span>
          <span className="pot-chip" data-status={state.brewer.length >= STORAGE_MAX ? "FULL" : undefined}>
            <b>양조기</b>
            {state.brewer.map((item, index) => (
              <span key={`${item}-${index}`}>{itemIcons[item]}</span>
            ))}
            {state.brewer.length}/{STORAGE_MAX}
          </span>
          <span className="pot-chip" data-status={state.table.length >= STORAGE_MAX ? "FULL" : undefined}>
            <b>테이블</b>
            {state.table.map((item, index) => (
              <span key={`${item}-${index}`}>{itemIcons[item]}</span>
            ))}
            {state.table.length}/{STORAGE_MAX}
          </span>
        </div>

        <div className="hud-crew" aria-label="슬라임 상태">
          {squad.map((actorId) => {
            const actor = state.actors[actorId];
            if (!actor) return null;
            return (
              <span key={actorId} className="crew-chip">
                <b style={{ color: typeCssColors[actorId] }}>{actor.name}</b>
                {actor.carrying ? itemIcons[actor.carrying] : "—"}
                <i>
                  {actor.queue.length}/
                  {statTables.focusCapacity[actor.statLevels.focus]}
                </i>
                {actor.alert ? alertIcons[actor.alert] : ""}
              </span>
            );
          })}
        </div>

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="slime-portrait"
                src={slimeDataUri(hovered.typeId, "down", { animate: true })}
                alt=""
              />
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

        <div className="hud-bottom">
          {/* 레시피 전체 대신 지금 할 일 하나만 크게 보여 준다. */}
          <div className="step" role="status" aria-live="polite">
            <small>지금 할 일</small>
            <strong>{hint.title}</strong>
            {hint.say && <q>{hint.say}</q>}
            {/* 앞에 설비가 있으면 직접 할 수 있는 일을 알려 준다. */}
            {reach && (
              <span className="reach">
                <b>E</b> {reach.label}
              </span>
            )}
          </div>

          <div className="hud-right">
            <div className="feed">
              <span className="feed-event">{state.lastEvent}</span>
              {voice && (
                <span className="feed-voice" data-kind={voice.kind}>
                  {voice.transcript ? `“${voice.transcript}”` : voiceKindLabels[voice.kind]}
                  {voice.commands.length ? ` → ${voice.commands.join(", ")}` : ""}
                </span>
              )}
              <span className="feed-mic">{mic}</span>
            </div>
            <div
              className="mic"
              data-recording={micHeld.current ? "" : undefined}
              role="status"
            >
              🎙
              <span>
                {micHeld.current ? "말하는 중" : "스페이스를 누르고 말하기"}
              </span>
            </div>
          </div>
        </div>

        <details className="debug-wrap">
          <summary>🛠</summary>
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
              물품
              <select
                value={selectedItem}
                onChange={(event) =>
                  setSelectedItem(event.target.value as ItemId)
                }
              >
                {allItems.map((item) => (
                  <option key={item} value={item}>
                    {itemLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              목적지
              <select
                value={selectedTarget}
                onChange={(event) =>
                  setSelectedTarget(event.target.value as StationId)
                }
              >
                {allStations
                  .filter((id) => isValidRoute(selectedItem, id))
                  .map((id) => (
                    <option key={id} value={id}>
                      {stationLabels[id]}
                    </option>
                  ))}
              </select>
            </label>
            <button onClick={() => run(selectedItem, selectedTarget)}>
              보내기
            </button>
          </div>
        </details>
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
              💰 {state.gold}G · 📦 {state.filled}/{state.goal}
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
