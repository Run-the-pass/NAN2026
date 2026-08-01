"use client";

import * as Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  TILE_SIZE,
  KITCHEN_ROWS,
  displayTiles,
  initialState,
  interactActors,
  isWalkable,
  moveActors,
  pixelToTile,
  slimeTypes,
  taskTiles,
  tick,
  tileCenter,
  STORAGE_MAX,
  INGREDIENT_MAX,
  allStations,
  stationLabels,
  activeOrders,
  orderComplete,
  itemLabel,
  fireConfig,
  squadActorIds,
  currentStage,
  isLastStage,
  nextStage,
  GOLD_PER_ORDER,
  dishConfig,
  carriedLabel,
  isDish,
  type ActorId,
  type Carried,
  type GameState,
  type ItemId,
  type SlimeTypeId,
  type StationId,
} from "../game/core";
import {
  facingFromDelta,
  facings,
  slimeDataUri,
  type Facing,
} from "./slime-art";
import Music, { MusicSettings } from "./Music";
import { gameMusicSource } from "./music-source";
import { GameSoundEffects } from "./SoundEffects";

type View = {
  sync: (state: GameState) => void;
  pause: () => void;
  resume: () => void;
};

const typeColors: Record<SlimeTypeId, number> = {
  water: 0x189fc4,
  fire: 0xe05a39,
  lightning: 0xefb229,
  earth: 0x8b6c42,
};
const allTypeIds = Object.keys(slimeTypes) as SlimeTypeId[];
// 캔버스 내부 해상도 배율. 카메라 zoom도 같은 값을 써서 보이는
// 영역은 그대로 두고 픽셀만 촘촘하게 만든다.
const RENDER_SCALE = 3;
// 텍스처는 world 58x45로 그린다. 확대에 견디도록 넉넉히 구워 둔다.
const SLIME_TEXTURE = { width: 348, height: 270 };
const SLIME_SCALE = 58 / SLIME_TEXTURE.width;
const FIRE_TEXTURE = { width: 348, height: 301 };
// 같은 출력 너비에서 원본 불 슬라임 몸통과 생성형 슬라임 몸통이 맞는다.
const FIRE_SLIME_SCALE = SLIME_SCALE;
// 젓기만 손에 드는 것이 없어 따로 보여 줘야 한다.
type Motion = "idle" | "walk" | "stir" | "pick";
const itemIcons: Record<ItemId, string> = {
  mushroom: "🍄",
  "grilled-mushroom": "🍲",
};
const alertIcons: Record<string, string> = {
  WAITING: "⏳",
  SOURCE_EMPTY: "🫙",
  TARGET_FULL: "🚫",
  INVALID_ROUTE: "❓",
  WRONG_ELEMENT: "🔥",
};
const workStatusLabels = {
  IDLE: "대기",
  MISSING_MATERIAL: "식재료 부족",
  WORKING: "조리 중",
  COMPLETE: "요리 완성",
} as const;
// 주방 설비 타일 색.
const stationColors: Record<StationId, number> = {
  "ingredient-box": 0x9a6235,
  stove: 0xc65b32,
  submission: 0x3f7f4a,
  trash: 0x585264,
  "dish-rack": 0x6f83a7,
  washer: 0x3e8e9e,
  table: 0x8b5b32,
};
const stationIcons: Record<StationId, string> = {
  "ingredient-box": "🍄",
  stove: "🍳",
  submission: "📬",
  trash: "🗑",
  "dish-rack": "🍽️",
  washer: "🫧",
  table: "🪵",
};

const carriedIcon = (carried: Carried) =>
  isDish(carried)
    ? carried.status === "dirty"
      ? "🍽️💧"
      : carried.content
        ? `🍽️${itemIcons[carried.content]}`
        : "🍽️"
    : itemIcons[carried];

const statRows = [
  ["🔨", "작업 속도", "workSpeed"],
  ["👟", "이동 속도", "moveSpeed"],
] as const;

type Metrics = {
  buttonCommands: number;
};

const emptyMetrics = (): Metrics => ({
  buttonCommands: 0,
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
  // 일반 플레이는 첫 직원 한 마리, 상호작용 검증은 네 마리로 시작한다.
  const [picked, setPicked] = useState<SlimeTypeId>("water");
  const [state, setState] = useState<GameState | null>(null);
  const [selectedActors, setSelectedActors] = useState<ActorId[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const paused = settingsOpen || resumeCount !== null;

  const [saved, setSaved] = useState("");
  const stateRef = useRef(state);
  const selectedActorsRef = useRef(selectedActors);
  const view = useRef<View | null>(null);
  const metrics = useRef<Metrics>(emptyMetrics());
  const savedRef = useRef(false);
  const roundSeed = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    selectedActorsRef.current = selectedActors;
  }, [selectedActors]);

  useEffect(() => {
    if (!squad || paused) return;
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
  }, [squad, paused]);

  useEffect(() => {
    if (resumeCount === null) return;
    const timer = window.setTimeout(
      () => setResumeCount((count) => count === null || count <= 1 ? null : count - 1),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resumeCount]);

  useEffect(() => {
    if (paused) view.current?.pause();
    else view.current?.resume();
  }, [paused]);

  useEffect(() => {
    if (state) view.current?.sync(state);
  }, [state, selectedActors]);

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
        elapsedMs: currentStage(state).timeLimitMs - state.timeLeftMs,
        voiceCommands: 0,
        buttonCommands: counts.buttonCommands,
        voiceFailures: 0,
        avgConfidence: null,
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
    // 스프라이트는 마리 수만큼, 텍스처는 속성 수만큼 만든다.
    const roster = squadActorIds(squad);
    const kinds = [...new Set(squad)];
    class Restaurant extends Phaser.Scene {
      slimes!: Partial<
        Record<
          ActorId,
          {
            typeId: SlimeTypeId;
            body: Phaser.GameObjects.Container;
            art: Phaser.GameObjects.Image;
            carried: Phaser.GameObjects.Text;
            selected: Phaser.GameObjects.Arc;
            facing: Facing;
            last: { x: number; y: number };
            mode: Motion;
            blinking: boolean;
            scale: number;
            motion: Phaser.Tweens.Tween;
          }
        >
      >;
      stations!: Record<StationId, Phaser.GameObjects.Text>;

      // 가만히 있을 때: 원본 SVG의 숨쉬기를 tween으로 옮긴 것.
      breathe(art: Phaser.GameObjects.Image, scale = SLIME_SCALE) {
        art.setScale(scale);
        return this.tweens.add({
          targets: art,
          scaleX: scale * 0.985,
          scaleY: scale * 1.035,
          y: -2,
          duration: 1600,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // 걸을 때: 더 짧고 크게 통통 튄다.
      walk(art: Phaser.GameObjects.Image, scale = SLIME_SCALE) {
        art.setScale(scale);
        return this.tweens.add({
          targets: art,
          scaleX: scale * 1.06,
          scaleY: scale * 0.9,
          y: 3,
          duration: 240,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // 젓기: 팔이 없으니 몸을 좌우로 기울여 젓는다.
      stir(art: Phaser.GameObjects.Image, scale = SLIME_SCALE) {
        art.setScale(scale).setAngle(-12);
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
      pick(art: Phaser.GameObjects.Image, scale = SLIME_SCALE) {
        art.setScale(scale);
        return this.tweens.add({
          targets: art,
          scaleX: scale * 1.12,
          scaleY: scale * 0.8,
          y: 6,
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: "Quad.easeOut",
        });
      }

      startMotion(art: Phaser.GameObjects.Image, mode: Motion, scale = SLIME_SCALE) {
        if (mode === "walk") return this.walk(art, scale);
        if (mode === "stir") return this.stir(art, scale);
        if (mode === "pick") return this.pick(art, scale);
        return this.breathe(art, scale);
      }

      // 방향과 깜빡임 상태를 하나의 텍스처 키로 합쳐 적용한다.
      paintSlime(actorId: ActorId) {
        const sprite = this.slimes[actorId];
        if (!sprite) return;
        if (actorId === "fire") {
          sprite.art.setTexture("slime-fire-art").setFlipX(sprite.facing === "left");
          return;
        }
        const blink = sprite.blinking && sprite.facing !== "up" ? "-blink" : "";
        sprite.art.setTexture(`slime-${sprite.typeId}-${sprite.facing}${blink}`);
      }

      preload() {
        for (const typeId of kinds) {
          for (const facing of facings) {
            for (const blink of [false, true]) {
              this.load.svg(
                `slime-${typeId}-${facing}${blink ? "-blink" : ""}`,
                slimeDataUri(typeId, facing, { blink }),
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
        // 나무와 금속 중심의 판타지 식당 바닥과 벽.
        const planks = this.add.graphics().setDepth(0);
        KITCHEN_ROWS.forEach((row, rowIndex) => {
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
        // 식당 경계와 중앙 배식 동선을 읽기 쉽게 만든다.
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
        // 네 주방 설비를 서로 다른 실루엣으로 그린다.
        this.stations = {} as Record<StationId, Phaser.GameObjects.Text>;
        for (const id of allStations) {
          const { x, y } = tileCenter(displayTiles[id]);
          const shape = this.add.graphics().setDepth(y);
          if (id === "ingredient-box") {
            shape
              .fillStyle(0x6d3f20, 1)
              .fillRoundedRect(x - 28, y - 22, 56, 44, 5)
              .lineStyle(3, 0xc88a4c, 0.9)
              .strokeRoundedRect(x - 28, y - 22, 56, 44, 5)
              .lineStyle(2, 0x3d2415, 0.8)
              .strokeLineShape(new Phaser.Geom.Line(x, y - 20, x, y + 20));
          } else if (id === "stove") {
            shape
              .fillStyle(0x28272b, 1)
              .fillRoundedRect(x - 25, y - 15, 50, 40, 12)
              .fillStyle(stationColors[id], 0.9)
              .fillEllipse(x, y - 13, 50, 15)
              .lineStyle(2, 0xe9d3b1, 0.75)
              .strokeEllipse(x, y - 13, 52, 17)
              .fillStyle(0xffb347, 0.8)
              .fillCircle(x - 9, y - 20, 3)
              .fillCircle(x + 7, y - 25, 4);
          } else if (id === "submission") {
            shape
              .fillStyle(stationColors[id], 1)
              .fillRoundedRect(x - 27, y - 22, 54, 45, 5)
              .lineStyle(2, 0xb9edbd, 0.75)
              .strokeRoundedRect(x - 27, y - 22, 54, 45, 5)
              .fillStyle(0x183b24, 1)
              .fillRect(x - 14, y - 8, 28, 4);
          } else if (id === "dish-rack") {
            shape
              .fillStyle(0x4b382a, 1)
              .fillRoundedRect(x - 27, y - 23, 54, 46, 5)
              .lineStyle(3, stationColors[id], 0.95)
              .strokeRoundedRect(x - 27, y - 23, 54, 46, 5)
              .lineStyle(2, 0xd9e8ff, 0.7)
              .strokeLineShape(new Phaser.Geom.Line(x - 20, y - 5, x + 20, y - 5))
              .strokeLineShape(new Phaser.Geom.Line(x - 20, y + 10, x + 20, y + 10));
          } else if (id === "washer") {
            shape
              .fillStyle(0x394b50, 1)
              .fillRoundedRect(x - 27, y - 18, 54, 42, 6)
              .fillStyle(0x77c9d8, 0.75)
              .fillEllipse(x, y - 14, 45, 18)
              .lineStyle(2, 0xcdf8ff, 0.8)
              .strokeEllipse(x, y - 14, 45, 18);
          } else if (id === "table") {
            shape
              .fillStyle(stationColors[id], 1)
              .fillRoundedRect(x - 29, y - 17, 58, 34, 6)
              .lineStyle(3, 0xc89258, 0.9)
              .strokeRoundedRect(x - 29, y - 17, 58, 34, 6)
              .fillStyle(0x563619, 1)
              .fillRect(x - 22, y + 14, 7, 12)
              .fillRect(x + 15, y + 14, 7, 12);
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
              fontSize: "20px",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setDepth(y + 1);
          this.add
            .text(x, y + 22, stationLabels[id], {
              color: "#f8efff",
              fontFamily: "Jua, sans-serif",
              fontSize: "10px",
              align: "center",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setDepth(y + 1);
          // 재료 수와 조리 상태 표시.
          this.stations[id] = this.add
            .text(x, y - 30, "", {
              color: "#ffe9b8",
              fontFamily: "Jua, sans-serif",
              fontSize: "12px",
              align: "center",
              resolution: RENDER_SCALE,
            })
            .setOrigin(0.5)
            .setDepth(y + 2);
          this.add
            .zone(x, y, TILE_SIZE, TILE_SIZE)
            .setDepth(4)
            .setInteractive()
            .on(
              "pointerdown",
              (
                pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                inputEvent: Phaser.Types.Input.EventData,
              ) => {
                inputEvent.stopPropagation();
                if (!pointer.rightButtonDown()) return;
                metrics.current.buttonCommands += 1;
                setState((value) =>
                  value
                    ? interactActors(value, selectedActorsRef.current, id)
                    : value,
                );
              },
            );
        }

        this.slimes = {};
        const current = stateRef.current;
        for (const actorId of roster) {
          const actor = current?.actors[actorId];
          if (!actor) continue;
          const scale = actorId === "fire" ? FIRE_SLIME_SCALE : SLIME_SCALE;
          const art = this.add
            .image(0, 0, `slime-${actor.typeId}-down`)
            .setScale(SLIME_SCALE);
          const container = this.add
            .container(actor.x, actor.y, [art])
            .setDepth(actor.y)
            .setInteractive(
              new Phaser.Geom.Rectangle(-29, -23, 58, 45),
              Phaser.Geom.Rectangle.Contains,
            )
            .on(
              "pointerdown",
              (
                pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                inputEvent: Phaser.Types.Input.EventData,
              ) => {
                inputEvent.stopPropagation();
                if (!pointer.leftButtonDown()) return;
                const additive =
                  pointer.event instanceof MouseEvent && pointer.event.shiftKey;
                setSelectedActors((selected) =>
                  additive
                    ? selected.includes(actorId)
                      ? selected.filter((id) => id !== actorId)
                      : [...selected, actorId]
                    : [actorId],
                );
              },
            );
          const carried = this.add
            .text(actor.x, actor.y - 52, "", { fontSize: "24px", resolution: RENDER_SCALE })
            .setOrigin(0.5)
            .setDepth(actor.y + 2);
          const selected = this.add
            .circle(actor.x, actor.y + 14, 30)
            .setStrokeStyle(3, typeColors[actor.typeId], 0.95)
            .setFillStyle(typeColors[actor.typeId], 0.12)
            .setDepth(actor.y - 1)
            .setVisible(false);
          this.slimes[actorId] = {
            typeId: actor.typeId,
            body: container,
            art,
            carried,
            selected,
            facing: "down",
            last: { x: actor.x, y: actor.y },
            mode: "idle",
            blinking: false,
            scale,
            motion: this.breathe(art, scale),
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
        this.input.mouse?.disableContextMenu();
        const selectionBox = this.add
          .rectangle(0, 0, 0, 0, 0x9fdcff, 0.16)
          .setOrigin(0)
          .setStrokeStyle(1, 0xd9f4ff, 0.95)
          .setDepth(10_000)
          .setVisible(false);
        let dragStart: {
          world: Phaser.Math.Vector2;
          screenX: number;
          screenY: number;
          additive: boolean;
        } | null = null;
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (pointer.leftButtonDown()) {
            dragStart = {
              world: this.cameras.main.getWorldPoint(pointer.x, pointer.y),
              screenX: pointer.x,
              screenY: pointer.y,
              additive:
                pointer.event instanceof MouseEvent && pointer.event.shiftKey,
            };
            return;
          }
          if (!pointer.rightButtonDown()) return;
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          if (!isWalkable(pixelToTile(point.x, point.y))) return;
          metrics.current.buttonCommands += 1;
          setState((value) =>
            value
              ? moveActors(value, selectedActorsRef.current, { x: point.x, y: point.y })
              : value,
          );
        });
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (!dragStart || !pointer.isDown) return;
          if (
            Math.hypot(pointer.x - dragStart.screenX, pointer.y - dragStart.screenY) <
            dishConfig.dragThresholdPx
          ) return;
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          const left = Math.min(dragStart.world.x, point.x);
          const top = Math.min(dragStart.world.y, point.y);
          selectionBox
            .setPosition(left, top)
            .setSize(Math.abs(point.x - dragStart.world.x), Math.abs(point.y - dragStart.world.y))
            .setVisible(true);
        });
        this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (!dragStart) return;
          const start = dragStart;
          dragStart = null;
          selectionBox.setVisible(false);
          if (
            Math.hypot(pointer.x - start.screenX, pointer.y - start.screenY) <
            dishConfig.dragThresholdPx
          ) {
            setSelectedActors([]);
            return;
          }
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          const left = Math.min(start.world.x, point.x);
          const right = Math.max(start.world.x, point.x);
          const top = Math.min(start.world.y, point.y);
          const bottom = Math.max(start.world.y, point.y);
          const inside = roster.filter((actorId) => {
            const actor = stateRef.current?.actors[actorId];
            return (
              actor &&
              actor.x >= left &&
              actor.x <= right &&
              actor.y >= top &&
              actor.y <= bottom
            );
          });
          setSelectedActors((selected) =>
            start.additive ? [...new Set([...selected, ...inside])] : inside,
          );
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
                    ? current.workstation.workerId === actorId
                      ? "stir"
                      : "pick"
                    : "idle";
              if (mode !== sprite.mode) {
                sprite.mode = mode;
                sprite.motion.stop();
                sprite.art.setAngle(0).setY(0);
                sprite.motion = this.startMotion(sprite.art, mode, sprite.scale);
              }
              sprite.last = { x: actor.x, y: actor.y };
              sprite.body.setPosition(actor.x, actor.y).setDepth(actor.y);
              sprite.selected
                .setPosition(actor.x, actor.y + 14)
                .setDepth(actor.y - 1)
                .setVisible(selectedActorsRef.current.includes(actorId));
              const icon = actor.alert
                ? alertIcons[actor.alert]
                : actor.carrying.map(carriedIcon).join(" ");
              sprite.carried
                .setText(icon ?? "")
                .setPosition(actor.x, actor.y - 52)
                .setDepth(actor.y + 2);
            }
            for (const id of allStations) {
              const fire = current.fires[id];
              const label = fire?.onFire
                ? // 불이 난 설비는 진화 진행도를 대신 보여 준다.
                  `🔥 ${Math.round((fire.extinguishMs / fireConfig.extinguishMs) * 100)}%`
                : id === "ingredient-box"
                  ? `${current.ingredients.stock}/${INGREDIENT_MAX}`
                  : id === "stove"
                    ? current.workstation.status === "WORKING"
                      ? `${workStatusLabels.WORKING} ${Math.round((current.workstation.progressMs / current.workstation.totalMs) * 100)}%`
                      : workStatusLabels[current.workstation.status]
                    : id === "dish-rack"
                      ? `${current.dishRack.length}/${dishConfig.rackCapacity}`
                      : id === "washer"
                        ? current.washer.workerId
                          ? `세척 ${Math.round((current.washer.progressMs / current.washer.totalMs) * 100)}%`
                          : current.washer.dish
                            ? current.washer.dish.status === "clean" ? "세척 완료" : "세척 대기"
                            : "비어 있음"
                        : id === "table"
                          ? current.table[0] ? carriedLabel(current.table[0]) : "비어 있음"
                          : "";
              this.stations[id].setText(label);
            }
          },
          pause: () => this.scene.pause(),
          resume: () => this.scene.resume(),
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
      scene: Restaurant,
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
    setSelectedActors([]);
    setSettingsOpen(false);
    setResumeCount(null);
    setState(next);
    setSquad(list);
  }

  // 속성 키와 전체 선택 키.
  useEffect(() => {
    if (!squad) return;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName);
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return;
      if (event.code === "Escape") {
        event.preventDefault();
        setSettingsOpen((open) => {
          const next = !open;
          setResumeCount(next ? null : 3);
          return next;
        });
        return;
      }
      const elementByKey = {
        KeyQ: "water",
        KeyW: "fire",
        KeyE: "lightning",
        KeyR: "earth",
      } as const;
      const roster = squadActorIds(squad);
      const element = elementByKey[event.code as keyof typeof elementByKey];
      if (element) {
        // 속성 키 하나가 그 속성의 모든 마리를 고른다.
        setSelectedActors(
          roster.filter(
            (actorId) =>
              stateRef.current?.actors[actorId]?.typeId === element,
          ),
        );
        return;
      }
      if (event.code !== "Space") return;
      event.preventDefault();
      setSelectedActors(roster);
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
    // 핸들러는 ref만 보므로 squad가 바뀔 때만 다시 건다.
  }, [squad]);

  // 슬라임 선택 화면
  if (!squad || !state) {
    return (
      <main className="select-shell">
        <Music src="/music/main.mp3" />
        <section className="select-screen" aria-label="슬라임 선택">
          <p className="select-guide">
            식당의 첫 직원 슬라임을 1마리 고르세요. 게임에서
            슬라임을 좌클릭하고, 바닥이나 설비를 우클릭해 지시합니다.
            스테이지마다 주문을 다 채우면 다음 스테이지로 넘어갑니다.
          </p>
          <div className="select-grid">
            {allTypeIds.map((typeId) => {
              const kind = slimeTypes[typeId];
              const active = picked === typeId;
              return (
                <button
                  key={typeId}
                  className="slime-select-card"
                  data-slime-type={typeId}
                  data-active={active ? "" : undefined}
                  aria-pressed={active}
                  onClick={() => setPicked(typeId)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="slime-portrait"
                    data-water={typeId === "water" ? "" : undefined}
                    data-fire={typeId === "fire" ? "" : undefined}
                    src={
                      typeId === "water"
                        ? "/slimes/water.svg"
                        : typeId === "fire"
                          ? "/slimes/fire.svg"
                          : slimeDataUri(typeId, "down", { animate: true })
                    }
                    alt=""
                  />
                  <strong>{kind.name} 슬라임 · {kind.elementLabel}</strong>
                  <small>{kind.trait}</small>
                  <StatGauges levels={kind.statLevels} />
                </button>
              );
            })}
          </div>
          <footer className="select-footer">
            <span>첫 직원: {slimeTypes[picked].name} 슬라임</span>
            <button className="select-start" onClick={() => startRound([picked])}>
              식당 영업 시작
            </button>
            <button className="select-start" onClick={() => startRound(allTypeIds)}>
              4마리 상호작용 테스트
            </button>
          </footer>
        </section>
      </main>
    );
  }

  const result =
    state.phase === "lost"
      ? "영업 종료. 주문을 다 채우지 못했습니다."
      : isLastStage(state)
        ? "모든 스테이지를 클리어했습니다!"
        : `${currentStage(state).id} 클리어!`;

  return (
    <main className="stage">
      <Music src={gameMusicSource(state.timeLeft, state.phase)} />
      <GameSoundEffects state={state} selectedActors={selectedActors} />
      <div className="stage-frame">
        <div id="game-canvas" aria-label="탑다운 판타지 식당 게임 맵" />
        <MusicSettings
          variant="game"
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            setResumeCount(open ? null : 3);
          }}
        />
        {resumeCount !== null && (
          <div className="resume-countdown" role="status" aria-live="assertive">
            <strong key={resumeCount}>{resumeCount}</strong>
          </div>
        )}

        <div className="hud-top">
          <span className="hud-chip">
            🍽 {currentStage(state).id} {currentStage(state).name}
          </span>
          <span className="hud-chip" data-warn={state.timeLeft <= 30 ? "" : undefined}>
            ⏱ {state.timeLeft}
          </span>
          <span className="hud-chip hud-goal">
            📦 {state.filled} / {state.goal}
          </span>
          <span className="hud-chip">💰 {state.gold}G</span>
        </div>

        <div className="hud-pots" aria-label="주문과 재고">
          <span className="pot-chip" data-status="ORDER">
            <b>음식 주문</b>
            {activeOrders(state).map((order) => (
              <span key={order.id}>
                {itemIcons[order.foodId]} {itemLabel(order.foodId)}{" "}
                {order.submittedCount}/{order.targetCount}
                {orderComplete(order) ? " ✅" : ""}
              </span>
            ))}
          </span>
          <span className="pot-chip">
            <b>재료 상자</b>
            🍄 {state.ingredients.stock}/{INGREDIENT_MAX}
          </span>
          <span className="pot-chip" data-status={state.fires.stove?.onFire ? "FULL" : state.stove.length >= STORAGE_MAX ? "FULL" : undefined}>
            <b>조리 도구</b>
            <span>
              {state.fires.stove?.onFire
                ? `🔥 화재 · 진화 ${Math.round((state.fires.stove.extinguishMs / fireConfig.extinguishMs) * 100)}%`
                : `${workStatusLabels[state.workstation.status]}${
                    state.workstation.status === "WORKING"
                      ? ` ${Math.round((state.workstation.progressMs / state.workstation.totalMs) * 100)}%`
                      : ""
                  }`}
            </span>
            {state.stove.map((item, index) => (
              <span key={`${item}-${index}`}>{itemIcons[item]}</span>
            ))}
            {state.stove.length}/{STORAGE_MAX}
          </span>
          <span className="pot-chip">
            <b>그릇</b>
            <span>🍽️ 생성대 {state.dishRack.length}/{dishConfig.rackCapacity}</span>
            <span>
              🫧 {state.washer.workerId
                ? `세척 ${Math.round((state.washer.progressMs / state.washer.totalMs) * 100)}%`
                : state.washer.dish?.status === "clean"
                  ? "세척 완료"
                  : state.washer.dish
                    ? "세척 대기"
                    : "세척기 비어 있음"}
            </span>
            <span>🪵 {state.table[0] ? carriedLabel(state.table[0]) : "테이블 비어 있음"}</span>
          </span>
        </div>

        <div className="hud-bottom">
          {/* 레시피 전체 대신 지금 할 일 하나만 크게 보여 준다. */}
          <div className="step" role="status" aria-live="polite">
            <small>조작</small>
            <strong>좌클릭·Shift·드래그 선택 · 우클릭 이동/상호작용</strong>
            {/* 앞에 설비가 있으면 직접 할 수 있는 일을 알려 준다. */}
            <span className="reach">Q 물 · W 불 · E 번개 · R 땅 · Space 전체</span>
          </div>

          <div className="hud-right">
            <div className="feed">
              <span className="feed-event">{state.lastEvent}</span>
            </div>
          </div>
        </div>

      </div>

      {state.phase !== "playing" && (
        <section
          className="result-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <div>
            <p className="eyebrow">
              {state.phase === "lost"
                ? "GAME OVER"
                : isLastStage(state)
                  ? "ALL CLEAR"
                  : "STAGE CLEAR"}
            </p>
            <h2 id="result-title">{result}</h2>
            {/* 정산: 주문 성공은 골드로, 실수는 횟수만 보여 준다. */}
            <dl className="settle">
              <div>
                <dt>주문 성공 횟수</dt>
                <dd>
                  {state.filled}번 × {GOLD_PER_ORDER}G
                </dd>
                <dd>{state.filled * GOLD_PER_ORDER}G</dd>
              </div>
              <div>
                <dt>주문 실수 횟수</dt>
                <dd>{state.misses}번</dd>
                <dd aria-hidden>—</dd>
              </div>
              <div className="settle-total">
                <dt>합계</dt>
                <dd />
                <dd>{state.gold}G</dd>
              </div>
            </dl>
            <p className="mic-state">{saved}</p>
            <div className="result-actions">
              {state.phase === "won" && !isLastStage(state) ? (
                <button
                  autoFocus
                  onClick={() => {
                    savedRef.current = false;
                    setSaved("");
                    setSelectedActors([]);
                    setState((current) => (current ? nextStage(current) : current));
                  }}
                >
                  다음 스테이지
                </button>
              ) : (
                <button autoFocus onClick={() => startRound(squad)}>
                  1-1부터
                </button>
              )}
              <button
                onClick={() => {
                  setSquad(null);
                  setState(null);
                }}
              >
                타이틀로
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
