type Rect = { left: number; top: number; width: number; height: number };

// Phaser 좌표를 사용해야 MouseEvent와 TouchEvent 모두 같은 위치에 안내가 뜬다.
export function pointerToastAnchor(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  canvas: Rect,
  frame: Rect,
) {
  const x = canvas.left + pointer.x * canvas.width / size.width - frame.left;
  const y = canvas.top + pointer.y * canvas.height / size.height - frame.top - 8;
  const inset = Math.min(170, frame.width / 2);
  return {
    x: Math.min(Math.max(x, inset), frame.width - inset),
    y: Math.min(Math.max(y, 70), Math.max(70, frame.height - 70)),
  };
}

// 화면을 시계 방향으로 90도 돌렸을 때의 역변환.
export function rotatedPointerPosition(pointer: { x: number; y: number }, canvas: Rect, size: { width: number; height: number }) {
  return {
    x: (pointer.y - canvas.top) / canvas.height * size.width,
    y: (canvas.left + canvas.width - pointer.x) / canvas.width * size.height,
  };
}
