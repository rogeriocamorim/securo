const SATURATION = 0.65
const LIGHTNESS = 0.55

/**
 * Picks a random hue at fixed saturation/lightness so every generated color
 * stays readable as an icon background, and returns it as `#rrggbb`
 * (the format `<input type="color">` requires).
 */
export function randomCategoryColor(random: () => number = Math.random): string {
  const hue = Math.floor(random() * 360)
  return hslToHex(hue, SATURATION, LIGHTNESS)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))
  const [r, g, b] =
    segment < 1 ? [chroma, x, 0]
    : segment < 2 ? [x, chroma, 0]
    : segment < 3 ? [0, chroma, x]
    : segment < 4 ? [0, x, chroma]
    : segment < 5 ? [x, 0, chroma]
    : [chroma, 0, x]
  const offset = lightness - chroma / 2
  const toHex = (channel: number) =>
    Math.round((channel + offset) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
