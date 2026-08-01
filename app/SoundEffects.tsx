"use client";

import { useEffect, useRef } from "react";
import type { ActorId, GameState, SlimeTypeId } from "../game/core";
import { gameSoundCues, type GameSoundCue } from "./sound-events";

const settingsKey = "slime-restaurant-music";
const settingsEvent = "slime-restaurant-music-change";
const root = "/sfx/";

const files: Record<GameSoundCue, string | string[]> = {
  "round-start": "05_round_start.mp3",
  "game-over": "06_game_over.mp3",
  "round-clear": "07_round_clear.mp3",
  "low-time": "08_only_have_little_time.mp3",
  "new-item": "03_new_item.mp3",
  grill: "A01_grill.mp3",
  wash: "A00_washing_dish.mp3",
  "pick-item": ["A02_pick_item_0.mp3", "A03_pick_item_1.mp3"],
  "food-submit": "A07_food_ready.mp3",
  "order-success": "01_order_success.mp3",
  "new-order": "00_new_order.mp3",
  trash: "A08_trash.mp3",
  "fire-start": [
    "E00_sudden_fire_0.mp3",
    "E01_sudden_fire_1.mp3",
    "E02_sudden_fire_2.mp3",
    "E03_sudden_fire_3.mp3",
  ],
  "fire-extinguish": "A06_fire_extinguish.mp3",
  move: "S00_move.mp3",
};

const fireLoops = [
  "E04_sudden_fire_loop_0.mp3",
  "E05_sudden_fire_loop_1.mp3",
  "E06_sudden_fire_loop_2.mp3",
  "E07_sudden_fire_loop_3.mp3",
];

const slimeSounds: Record<SlimeTypeId, string[]> = {
  water: ["S01_water_0.mp3", "S02_water_1.mp3", "S03_water_2.mp3", "S08_water_3.mp3"],
  fire: ["S04_fire_0.mp3", "S05_fire_1.mp3", "S06_fire_2.mp3", "S07_fire_3.mp3"],
  lightning: ["S09_lightning_0.mp3", "S10_lightning_1.mp3", "S11_lightning_2.mp3", "S12_lightning_3.mp3"],
  earth: ["S13_earth_0.mp3", "S14_earth_1.mp3", "S15_earth_2.mp3", "S16_earth_3.mp3"],
};

function settings() {
  try {
    return { enabled: true, volume: 0.35, ...JSON.parse(localStorage.getItem(settingsKey) ?? "{}") };
  } catch {
    return { enabled: true, volume: 0.35 };
  }
}

const choose = (value: string | string[]) =>
  Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;

function play(file: string, gain = 0.8) {
  const current = settings();
  if (!current.enabled) return;
  const audio = new Audio(root + file);
  audio.volume = Math.min(1, Math.max(0, current.volume * 1.6 * gain));
  void audio.play().catch(() => undefined);
}

export function GlobalSoundEffects() {
  useEffect(() => {
    let lastHover = 0;
    const click = (event: MouseEvent) => {
      const control = event.target instanceof Element
        ? event.target.closest<HTMLElement>("button, a")
        : null;
      if (!control) return;
      const slime = control.dataset.slimeType as SlimeTypeId | undefined;
      play(slime ? choose(slimeSounds[slime]) : "02_click.mp3", slime ? 0.65 : 0.45);
    };
    const hover = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || performance.now() - lastHover < 80) return;
      const control = event.target instanceof Element
        ? event.target.closest<HTMLElement>("button, a")
        : null;
      if (!control || (event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) return;
      lastHover = performance.now();
      play("04_hover.mp3", 0.25);
    };
    window.addEventListener("click", click);
    window.addEventListener("pointerover", hover);
    return () => {
      window.removeEventListener("click", click);
      window.removeEventListener("pointerover", hover);
    };
  }, []);
  return null;
}

export function GameSoundEffects({
  state,
  selectedActors,
}: {
  state: GameState;
  selectedActors: ActorId[];
}) {
  const previous = useRef<GameState | null>(null);
  const previousSelection = useRef("");
  const fireLoop = useRef<HTMLAudioElement | null>(null);
  const isBurning = Object.values(state.fires).some((fire) => fire?.onFire);

  useEffect(() => {
    for (const cue of gameSoundCues(previous.current, state)) {
      play(choose(files[cue]), cue === "move" ? 0.45 : 0.8);
    }
    previous.current = state;
  }, [state]);

  useEffect(() => {
    const signature = selectedActors.join(",");
    const typeId = state.actors[selectedActors[0]]?.typeId;
    if (signature && typeId && signature !== previousSelection.current) {
      play(choose(slimeSounds[typeId]), 0.65);
    }
    previousSelection.current = signature;
  }, [selectedActors, state.actors]);

  useEffect(() => {
    if (!isBurning) {
      fireLoop.current?.pause();
      fireLoop.current = null;
      return;
    }
    const audio = new Audio(root + choose(fireLoops));
    fireLoop.current = audio;
    audio.loop = true;
    const apply = () => {
      const current = settings();
      audio.volume = Math.min(1, Math.max(0, current.volume * 0.35));
      if (current.enabled) void audio.play().catch(() => undefined);
      else audio.pause();
    };
    apply();
    window.addEventListener(settingsEvent, apply);
    return () => {
      window.removeEventListener(settingsEvent, apply);
      audio.pause();
      if (fireLoop.current === audio) fireLoop.current = null;
    };
  }, [isBurning]);

  return null;
}
