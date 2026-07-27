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
import { nextHint } from "../game/hint";
import {
  facingFromDelta,
  facings,
  slimeDataUri,
  type Facing,
} from "./slime-art";

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
// 텍스처는 116x90으로 굽고 절반 크기로 그린다.
const SLIME_SCALE = 0.5;
// 젓기만 손에 드는 것이 없어 따로 보여 줘야 한다.
type Motion = "idle" | "walk" | "stir" | "pick";
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
      pots!: Record<CauldronId, Phaser.GameObjects.Text>;
      swirls!: Record<CauldronId, Phaser.GameObjects.Container>;

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
                { width: 116, height: 90 },
              );
            }
          }
        }
      }

      create() {
        this.cameras.main.setBackgroundColor("#171527");
        // 판자 위에 얹는 가구. 나무 공방 톤에 맞춘 색.
        const furniture: Record<string, [number, number]> = {
          B: [0x8b5a2b, 0xbb8348],
          T: [0x554f86, 0x8279cc],
          H: [0x2f7a3f, 0x54bb63],
          P: [0x66408c, 0x9d6bc9],
        };
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
        // 상자·작업대·납품대는 판자 위에 한 단 올라온 것처럼 그린다.
        const props = this.add.graphics().setDepth(1);
        WORKSHOP_ROWS.forEach((row, rowIndex) => {
          [...row].forEach((tile, colIndex) => {
            const paint = furniture[tile];
            if (!paint) return;
            const { x, y } = tileCenter({ col: colIndex, row: rowIndex });
            const left = x - TILE_SIZE / 2;
            const top = y - TILE_SIZE / 2;
            props.fillStyle(paint[0], 1);
            props.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            props.fillStyle(paint[1], 1);
            props.fillRect(left + 2, top + 2, TILE_SIZE - 4, 8);
          });
        });
        // 마법 기운: 바닥에 은은한 보라 빛과 떠다니는 불씨.
        const glow = this.add.graphics().setDepth(0);
        glow.fillStyle(0x8b5cf6, 0.07);
        for (const id of ["cauldron-01", "cauldron-02"] as CauldronId[]) {
          const { x, y } = tileCenter(displayTiles[id]);
          glow.fillCircle(x, y, 110);
        }
        glow.fillStyle(0x7dd3fc, 0.05);
        glow.fillCircle(...(([tileCenter(displayTiles.submission).x,
          tileCenter(displayTiles.submission).y, 90]) as [number, number, number]));
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
              fontFamily: "Jua, sans-serif",
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
        this.swirls = {} as Record<CauldronId, Phaser.GameObjects.Container>;
        for (const id of ["cauldron-01", "cauldron-02"] as CauldronId[]) {
          const position = tileCenter(displayTiles[id]);
          this.pots[id].setPosition(position.x, position.y);
          // 조합·각인 중인 솥은 소용돌이가 돈다.
          const swirl = this.add
            .container(
              position.x,
              position.y,
              [0, 120, 240].map((degrees) => {
                const radians = Phaser.Math.DegToRad(degrees);
                return this.add
                  .circle(
                    Math.cos(radians) * 17,
                    Math.sin(radians) * 17,
                    3,
                    0xf3e6ff,
                  )
                  .setAlpha(0.85);
              }),
            )
            .setDepth(4)
            .setVisible(false);
          this.tweens.add({
            targets: swirl,
            angle: 360,
            duration: 1100,
            repeat: -1,
            ease: "Linear",
          });
          this.swirls[id] = swirl;
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
                    ? actor.current?.action === "MIX"
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
              this.swirls[id].setVisible(
                pot.status === "MIXING" || pot.status === "INSCRIBING",
              );
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
      let voicedFrames = 0;
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
          voicedFrames = 1;
          next.ondataavailable = (event) => chunks.push(event.data);
          next.onstop = () => {
            if (voicedFrames < 12) {
              voiceBusy.current = false;
              setMic("상시 음성 인식 중 · 말씀하세요");
              return;
            }
            const blob = new Blob(chunks, { type: next.mimeType });
            void submitVoice(blob, list).finally(() => {
              voiceBusy.current = false;
            });
          };
          next.start();
          setMic("말씀을 듣는 중…");
        } else if (active) {
          if (level > 0.02) {
            lastVoiceAt = now;
            voicedFrames += 1;
          }
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
      <main className="select-shell">
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
  const result =
    state.phase === "won"
      ? "성공! 마도서 8권을 납품했습니다."
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
            📚 {state.submitted} / {state.goal}
          </span>
          <span className="hud-chip">💰 {state.gold}G</span>
        </div>

        <div className="hud-pots" aria-label="솥 상태">
          {(["cauldron-01", "cauldron-02"] as CauldronId[]).map((id) => {
            const pot = state.cauldrons[id];
            return (
              <span key={id} className="pot-chip" data-status={pot.status}>
                <b>{potNames[id]}</b>
                {statusNames[pot.status]}
                {pot.timerMs ? ` ${(pot.timerMs / 1000).toFixed(1)}초` : ""}
              </span>
            );
          })}
        </div>

        <div className="hud-crew" aria-label="슬라임 상태">
          {squad.map((actorId) => {
            const actor = state.actors[actorId];
            if (!actor) return null;
            return (
              <span key={actorId} className="crew-chip">
                <b style={{ color: typeCssColors[actorId] }}>{actor.name}</b>
                {actor.carrying ? carriedIcons[actor.carrying] : "—"}
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
            <button
              className="mic"
            onClick={toggleMic}
            disabled={state.phase !== "playing"}
              data-recording={recorder.current?.state === "recording" ? "" : undefined}
            >
              🎙
              <span>
                {recorder.current?.state === "recording" ? "중지" : "말하기"}
              </span>
            </button>
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
