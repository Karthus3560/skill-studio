// The clay icon set (from the ChatGPT sheets) and the categories they're grouped in.

import { CLAY } from './clay'

export const ICON_NAMES = [
  'film', 'mic', 'brush', 'megaphone', 'chart', 'doc', 'code', 'bug', 'rocket', 'search', 'globe', 'shield',
  'palette', 'robot', 'book', 'calendar', 'mail', 'cart', 'bulb', 'chat', 'terminal', 'branch', 'gear', 'pencil',
  'image', 'music', 'target', 'users', 'dollar', 'lock', 'sparkle', 'map', 'clock', 'layers', 'wand', 'slides',
  'table', 'phone', 'game', 'heart', 'flask', 'box', 'cloud', 'star', 'link', 'pixel', 'backup', 'graph',
]

/** Each category's dot colour, all from one warm family. */
export const CATEGORY_COLORS: Record<string, string> = {
  Video: '#E08A6D',
  Voice: '#C9A3D4',
  Design: '#D97757',
  Marketing: '#E3B26B',
  Docs: '#9DB8D9',
  Code: '#A9C48B',
  Data: '#86C2B8',
  Writing: '#E3D5C1',
  Other: '#A39E93',
}

export const CATEGORY_NAMES = Object.keys(CATEGORY_COLORS)

const FALLBACK_BY_CATEGORY: Record<string, string> = {
  Video: 'film', Voice: 'mic', Design: 'palette', Marketing: 'megaphone', Docs: 'doc',
  Code: 'code', Data: 'chart', Writing: 'pencil', Other: 'sparkle',
}

/** The icon for a category when a skill has no generated icon yet. */
export function iconForCategory(category: string): string {
  return FALLBACK_BY_CATEGORY[category] ?? 'sparkle'
}

/** One clay icon as a small SVG wrapping its WebP; a plain clay tile if the set lacks it. */
export function clayIcon(icon: string, size: number): string {
  const b64 = CLAY[icon] ?? CLAY.sparkle
  const body = b64
    ? `<image href="data:image/webp;base64,${b64}" width="44" height="44"/>`
    : `<rect x="1" y="1" width="42" height="42" rx="10" fill="#2B2A27" stroke="#F0EEE6" stroke-opacity="0.25"/><circle cx="22" cy="22" r="8" fill="#D97757"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44">${body}</svg>`
}
