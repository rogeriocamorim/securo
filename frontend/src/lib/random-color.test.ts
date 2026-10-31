import { describe, expect, it } from 'vitest'

import { randomCategoryColor } from './random-color'

describe('randomCategoryColor', () => {
  it('returns a #rrggbb hex string', () => {
    for (let i = 0; i < 100; i++) {
      expect(randomCategoryColor()).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('maps the random hue onto the color wheel', () => {
    expect(randomCategoryColor(() => 0)).toBe('#d74242')
    expect(randomCategoryColor(() => 1 / 3)).toBe('#42d742')
    expect(randomCategoryColor(() => 2 / 3)).toBe('#4242d7')
  })

  it('produces different colors across calls', () => {
    const colors = new Set(Array.from({ length: 20 }, () => randomCategoryColor()))
    expect(colors.size).toBeGreaterThan(1)
  })
})
