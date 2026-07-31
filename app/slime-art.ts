import type { SlimeTypeId } from "../game/core.js";

export type Facing = "down" | "up" | "left" | "right";

// 방향별 게임 텍스처가 없는 속성은 같은 형태에 속성색을 적용한다.
const palettes: Record<SlimeTypeId, { outer: string; inner: string }> = {
  water: { outer: "#73d6e5", inner: "#189fc4" },
  fire: { outer: "#ffc59a", inner: "#e05a39" },
  lightning: { outer: "#fff0a3", inner: "#efb229" },
  earth: { outer: "#c6aa80", inner: "#8b6c42" },
};

// 바라보는 방향에 따라 얼굴만 옮긴다. 위를 보면 등만 보인다.
const faceOffsets: Record<Facing, { x: number; y: number } | null> = {
  down: { x: 0, y: 0 },
  left: { x: -96, y: 6 },
  right: { x: 96, y: 6 },
  up: null,
};

const bodyPath =
  "M 627 300 C 844 300 1028 438 1081 623 C 1124 775 1070 900 961 954 C 875 997 743 1000 627 1000 C 491 1000 354 994 265 939 C 178 886 145 787 169 652 C 208 433 399 300 627 300 Z";

// 원본 SVG의 숨쉬기·깜빡임. img로 띄우는 곳(선택 화면, 호버 카드)에서만
// 살아 움직인다. Phaser는 SVG를 정지 화면으로 굽기 때문에 무시되고,
// 그쪽 움직임은 tween과 blink 텍스처가 담당한다.
const idleCss = `<style>
#slime{transform-box:fill-box;transform-origin:50% 88%;animation:breathe 3.2s cubic-bezier(.45,0,.28,1) infinite}
#inner{transform-box:fill-box;transform-origin:50% 100%;animation:belly 3.2s cubic-bezier(.45,0,.28,1) infinite}
#face{transform-box:fill-box;transform-origin:center;animation:face-float 3.2s ease-in-out infinite}
#eyes{transform-box:fill-box;transform-origin:center;animation:blink 5.4s ease-in-out infinite}
@keyframes breathe{0%,32%,100%{transform:translateY(0) scale(1)}46%{transform:translateY(-13px) scale(.985,1.035)}58%{transform:translateY(8px) scale(1.035,.965)}69%{transform:translateY(-3px) scale(.995,1.012)}}
@keyframes belly{0%,32%,100%{transform:scale(1)}46%{transform:scale(.975,1.045)}58%{transform:scale(1.045,.94)}69%{transform:scale(.99,1.015)}}
@keyframes face-float{0%,32%,100%{transform:translateY(0)}46%{transform:translateY(-8px)}58%{transform:translateY(7px) scaleY(.96)}}
@keyframes blink{0%,45%,49%,100%{transform:scaleY(1)}47%{transform:scaleY(.12)}}
@media (prefers-reduced-motion:reduce){#slime,#inner,#face,#eyes{animation:none}}
</style>`;

export function slimeSvg(
  typeId: SlimeTypeId,
  facing: Facing = "down",
  opts: { blink?: boolean; animate?: boolean } = {},
) {
  const { outer, inner } = palettes[typeId];
  const face = faceOffsets[facing];
  const eyes = opts.blink
    ? `<rect x="493" y="668" width="66" height="16" rx="8" fill="#000000"/>
<rect x="693" y="668" width="66" height="16" rx="8" fill="#000000"/>`
    : `<circle cx="526" cy="676" r="33" fill="#000000"/>
<circle cx="726" cy="676" r="33" fill="#000000"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1018" height="862" viewBox="120 180 1018 862">
<defs>
<linearGradient id="o" x1="0.5" y1="0" x2="0.5" y2="1">
<stop offset="0" stop-color="${outer}"/><stop offset="1" stop-color="${outer}"/>
</linearGradient>
<radialGradient id="i" cx="50%" cy="44%" r="67%">
<stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${inner}"/>
</radialGradient>
${opts.animate ? idleCss : ""}
</defs>
<g id="slime">
<path d="${bodyPath}" fill="none" stroke="#ffffff" stroke-width="49" stroke-linejoin="round"/>
<path d="${bodyPath}" fill="url(#o)" stroke="#000000" stroke-width="29" stroke-linejoin="round"/>
<g id="inner"><path d="M 272 681 C 291 560 433 480 615 472 C 808 463 938 545 974 665 C 1001 756 973 831 900 868 C 822 908 435 913 345 871 C 281 841 257 777 272 681 Z" fill="url(#i)"/></g>
<ellipse cx="410" cy="439" rx="58" ry="28" transform="rotate(-36 410 439)" fill="#ffffff" opacity="0.55"/>
${
  face
    ? `<g id="face" transform="translate(${face.x} ${face.y})">
<g id="eyes">${eyes}</g>
<path d="M 581 718 H 671 A 45 50 0 0 1 581 718 Z" fill="#000000"/>
</g>`
    : ""
}
</g>
</svg>`;
}

// Phaser의 load.svg는 data URI를 base64로 가정하므로 base64로 통일한다.
// SVG 문자열은 ASCII만 쓰므로 btoa로 충분하다.
export function slimeDataUri(
  typeId: SlimeTypeId,
  facing: Facing = "down",
  opts: { blink?: boolean; animate?: boolean } = {},
) {
  return `data:image/svg+xml;base64,${btoa(slimeSvg(typeId, facing, opts))}`;
}

export const facings: Facing[] = ["down", "up", "left", "right"];

// 이동 델타로 방향을 정한다. 큰 축이 이기고, 멈춰 있으면 이전 방향을 쓴다.
export function facingFromDelta(dx: number, dy: number, previous: Facing) {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return previous;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
