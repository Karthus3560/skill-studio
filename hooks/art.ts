// The button's icon and the cards' letter tiles, as SVG markup.

export const CLAY = '#D97757' // Claude's warm terracotta
export const CLAY_DARK = '#B85C3E'
export const CREAM = '#F0EEE6'

/** The Skills button icon: a terracotta tile holding a 2x2 grid, one cell a spark. */
export function buttonIcon(size = 26): string {
  const spark = (cx: number, cy: number, r: number) => {
    const pts: string[] = []
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 2
      const rr = i % 2 === 0 ? r : r * 0.38
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`)
    }
    return `<polygon points="${pts.join(' ')}" fill="${CREAM}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CLAY}"/><stop offset="1" stop-color="${CLAY_DARK}"/></linearGradient></defs>
<rect x="1" y="1" width="30" height="30" rx="8" fill="url(#g)"/>
<rect x="7" y="7" width="7.5" height="7.5" rx="2" fill="${CREAM}"/>
<rect x="17.5" y="17.5" width="7.5" height="7.5" rx="2" fill="${CREAM}"/>
<rect x="7" y="17.5" width="7.5" height="7.5" rx="2" fill="${CREAM}" opacity="0.55"/>
${spark(21.25, 10.75, 5.2)}
</svg>`
}

const TILE_COLORS = ['#D97757', '#6A9BCC', '#788C5D', '#C46686', '#BC8A3D', '#8A7FC4', '#4E9A93', '#B5654A']

export type Category = { label: string; color: string; words: RegExp }

export const CATEGORIES: Category[] = [
  { label: 'Video', color: '#C46686', words: /video|remotion|hyperframes|stickman|anidoodle|explainer|brag|shotcraft|clip/i },
  { label: 'Voice', color: '#8A7FC4', words: /voice|vox|speech|audio/i },
  { label: 'Design', color: '#D97757', words: /design|logo|pixel|figma|art|draw|image|diagram|archify|impeccable|frontend|taste/i },
  { label: 'Marketing', color: '#BC8A3D', words: /seo|ads?\b|ad-|marketing|cro|copy|email|launch|pricing|social|referral|lead|churn|offer|paywall|popup|signup|onboard|brand|pr\b|public-relations|influencer|community|competitor|prospect|sales|revops|aso|schema|link-building|directory|events|sms|co-marketing/i },
  { label: 'Docs', color: '#6A9BCC', words: /doc|pdf|pptx|xlsx|docx|ppt|writing|humanizer|copy-editing/i },
  { label: 'Code', color: '#788C5D', words: /code|test|debug|git|api|dart|flutter|ci-|review|refactor|security|performance|tdd|spec|plan|deprecat|observab|simplif|branch|worktree/i },
]

export function categoryOf(name: string, description: string): Category {
  const hay = `${name} ${description}`
  return CATEGORIES.find(c => c.words.test(name)) ?? CATEGORIES.find(c => c.words.test(hay)) ?? { label: 'Other', color: '#7A7A72', words: /$^/ }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** A rounded tile with the skill's initials, coloured by its category. */
export function letterTile(name: string, color: string, size = 30): string {
  const words = name.replace(/^[^:]*:/, '').split(/[-_\s]+/).filter(Boolean)
  const initials = ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase()
  const shade = TILE_COLORS[hash(name) % TILE_COLORS.length]!
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
<rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="${color}"/>
<rect x="0.5" y="20" width="31" height="11.5" rx="0" fill="${shade}" opacity="0.25"/>
<text x="16" y="21" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${initials.length > 1 ? 13 : 15}" font-weight="700" fill="${CREAM}">${initials}</text>
</svg>`
}
