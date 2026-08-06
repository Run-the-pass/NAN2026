"use client";

import { useRef, useState } from "react";
import {
  KITCHEN_ROWS,
  stationInstances,
  itemLabel,
  recipes,
  stationLabels,
  type ItemId,
  type Stage,
  type StationId,
} from "../game/core";
import {
  availableStageFoods,
  itemIcons,
  stageInfoUiConfig,
  stationIcons,
} from "./stage-info";

// 여러 칸짜리 기구는 차지한 칸마다 같은 아이콘을 보여 준다.
const stationByTile = new Map(
  stationInstances.flatMap(({ type, tiles }) =>
    tiles.map((tile) => [`${tile.col},${tile.row}`, type as StationId] as const),
  ),
);

function StageTitleHeader({ stage }: { stage: Stage }) {
  return (
    <header className="stage-info-header">
      <h1 id="stage-info-title">{stage.id} : {stage.name}</h1>
    </header>
  );
}

function StageMapPreview({ mapPreviewKey }: { mapPreviewKey: string }) {
  if (mapPreviewKey !== "kitchen-v1") {
    return <p className="stage-map-error">맵 미리보기를 불러올 수 없습니다.</p>;
  }
  return (
    <div className="stage-map-card">
      <div
        className="stage-map-preview"
        data-map-preview={mapPreviewKey}
        role="img"
        aria-label="14×8 식당 맵과 설비 배치 미리보기"
      >
        {KITCHEN_ROWS.flatMap((row, rowIndex) =>
          [...row].map((tile, colIndex) => {
            const station = stationByTile.get(`${colIndex},${rowIndex}`);
            return (
              <span
                key={`${colIndex}-${rowIndex}`}
                data-tile={tile === "#" ? "wall" : station ? "station" : "floor"}
                title={station ? stationLabels[station] : undefined}
              >
                {station ? stationIcons[station] : ""}
              </span>
            );
          }),
        )}
      </div>
    </div>
  );
}

function FoodHoverInfo({ foodId }: { foodId: ItemId | null }) {
  if (!foodId) {
    return <p className="food-info-empty">음식 아이콘에 마우스를 올려 보세요.</p>;
  }
  const recipe = recipes[foodId as keyof typeof recipes];
  if (!recipe) return null;
  const steps = [
    {
      icon: itemIcons[recipe.ingredient.itemId],
      label: `${itemLabel(recipe.ingredient.itemId)} ×${recipe.ingredient.count}`,
    },
    {
      icon: stationIcons[recipe.station],
      label: stationLabels[recipe.station],
    },
    ...(recipe.requiresCleanDish
      ? [{ icon: "🍽️", label: "깨끗한 그릇" }]
      : []),
    {
      icon: stationIcons[recipe.submissionStation],
      label: stationLabels[recipe.submissionStation],
    },
  ];
  return (
    <section className="food-hover-info" aria-live="polite">
      <strong><span aria-hidden>{itemIcons[foodId]}</span> {itemLabel(foodId)}</strong>
      <div className="food-flow">
        {steps.map((step, index) => (
          <span className="food-flow-part" key={step.label}>
            {index > 0 && <i aria-hidden>→</i>}
            <span><b aria-hidden>{step.icon}</b><small>{step.label}</small></span>
          </span>
        ))}
      </div>
    </section>
  );
}

function AvailableFoodPanel({ foodIds }: { foodIds: ItemId[] }) {
  const [hoveredFoodId, setHoveredFoodId] = useState<ItemId | null>(null);
  const [focusedFoodId, setFocusedFoodId] = useState<ItemId | null>(null);
  const slots = [...foodIds, ...Array<null>(6 - foodIds.length).fill(null)];
  const activeFoodId = hoveredFoodId ?? focusedFoodId;
  return (
    <section className="available-food-panel" onMouseLeave={() => setHoveredFoodId(null)}>
      <h2>나올 수 있는 음식 목록</h2>
      <div className="food-slot-grid">
        {slots.map((foodId, index) =>
          foodId ? (
            <button
              type="button"
              className="food-slot"
              key={foodId}
              data-open={activeFoodId === foodId ? "" : undefined}
              aria-label={`${itemLabel(foodId)} 제작 정보`}
              onMouseEnter={() => setHoveredFoodId(foodId)}
              onFocus={() => setFocusedFoodId(foodId)}
              onBlur={() => setFocusedFoodId(null)}
            >
              <span aria-hidden>{itemIcons[foodId]}</span>
            </button>
          ) : (
            <span className="food-slot food-slot-empty" aria-hidden key={`empty-${index}`} />
          ),
        )}
      </div>
      <FoodHoverInfo foodId={activeFoodId} />
    </section>
  );
}

function StageTipList({ tips }: { tips: string[] }) {
  return (
    <ul className="stage-tip-list">
      {tips.map((tip) => <li key={tip}><b>TIP:</b> {tip}</li>)}
    </ul>
  );
}

function StageInfoNextButton({
  disabled,
  onNext,
}: {
  disabled: boolean;
  onNext: () => void;
}) {
  return (
    <button
      type="button"
      className="stage-info-next"
      disabled={disabled}
      onClick={onNext}
      autoFocus
    >
      다음
    </button>
  );
}

export default function StageInfoScreen({
  stage,
  onNext,
}: {
  stage: Stage;
  onNext: () => void;
}) {
  const config = stageInfoUiConfig[stage.id];
  const transitioning = useRef(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  if (!config) {
    return (
      <section className="stage-info-screen stage-info-error" role="alert">
        <p>{stage.id} 스테이지 정보가 등록되지 않았습니다.</p>
      </section>
    );
  }
  const foodIds = availableStageFoods(config);
  const next = () => {
    if (transitioning.current) return;
    transitioning.current = true;
    setIsTransitioning(true);
    onNext();
  };
  return (
    <section
      className="stage-info-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-info-title"
    >
      <StageTitleHeader stage={stage} />
      <div className="stage-info-body">
        <div className="stage-map-column">
          <StageMapPreview mapPreviewKey={config.mapPreviewKey} />
          <StageTipList tips={config.tipLines} />
        </div>
        <AvailableFoodPanel foodIds={foodIds} />
      </div>
      <footer className="stage-info-footer">
        <StageInfoNextButton disabled={isTransitioning} onNext={next} />
      </footer>
    </section>
  );
}
