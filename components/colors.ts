// A bot's color as the background of the user's messages in its chat: the color, deepened in OKLCH
// just enough for white text to read on it (WCAG AA), so it keeps its hue instead of turning muddy.
// Ported from the reference app's chat bubble colors.

const TEXT_CONTRAST = 4.5;
const WHITE = "#FFFFFF";

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(a, bb), Math.atan2(bb, a)];
}

function fromOklch(lightness: number, chroma: number, hue: number) {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const hex = rgb.map((v) => {
    const c = Math.min(1, Math.max(0, v));
    const srgb = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${hex.join("")}`.toUpperCase();
}

/** Background and text colors for the user's messages in a chat with a bot of this `#RRGGBB` color. */
export function userBubbleColors(botColor: string) {
  let background = botColor.toUpperCase();
  const [lightness, chroma, hue] = toOklch(background);
  for (let l = lightness; contrast(background, WHITE) < TEXT_CONTRAST && l > 0;) {
    l -= 0.01;
    background = fromOklch(l, chroma, hue);
  }
  return { background, foreground: WHITE };
}
