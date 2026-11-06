// Writes each skill's short description, icon and category once, with a small
// model, and keeps them in $.store so the grid never waits on it.

import { atom, read, update } from 'claude-code'
import type { CommandInfo, EngineInterface } from 'claude-code'

import type { SkillGenStatus, SkillLang, SkillMeta } from '../types'
import { CATEGORY_NAMES, ICON_NAMES } from './icons'

export const STORE_META = 'meta-v1'
const meta = atom({ plugin: 'skill-studio', key: 'meta' } as const, {} as Record<string, SkillMeta>, { shape: 'meta-1' })
const status = atom(
  { plugin: 'skill-studio', key: 'status' } as const,
  { running: false, done: 0, total: 0 } as SkillGenStatus,
)

const busy = atom({ plugin: 'skill-studio', key: 'busy' } as const, [] as string[])

const BATCH = 10
const MODEL = 'haiku'
let running = false

export function fingerprint(c: CommandInfo): string {
  const s = `${c.name}\n${c.description}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

export async function loadMeta($: EngineInterface) {
  const saved = (await $.store.get(STORE_META)) as Record<string, SkillMeta> | undefined
  if (saved && typeof saved === 'object') await update($, meta, () => saved)
}

async function saveMeta($: EngineInterface) {
  await $.store.set(STORE_META, await read($, meta))
}

export async function setMeta($: EngineInterface, name: string, value: SkillMeta) {
  await update($, meta, m => ({ ...m, [name]: value }))
  await saveMeta($)
}

async function skillFile($: EngineInterface, name: string): Promise<string> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home || name.includes(':')) return ''
  const path = `${home}/.claude/skills/${name}/SKILL.md`
  try {
    if (!(await $.fs.exists(path))) return ''
    const text = await $.fs.read(path)
    // Drop the frontmatter, keep the start of the instructions.
    return text.replace(/^---[\s\S]*?---\s*/, '').slice(0, 1800)
  } catch {
    return ''
  }
}

const RULES = `You label tools ("skills") for a picker grid. For each skill, reply with:
- "short": ONE plain sentence, at most 12 words, saying what the skill does. Start with a verb. No "Use when", no "This skill", no marketing words, no trailing period needed.
- "icon": exactly one of: ${ICON_NAMES.join(', ')}
- "category": exactly one of: ${CATEGORY_NAMES.join(', ')}
Reply with ONLY a JSON array, one object per skill in the order given: [{"name":"...","short":"...","icon":"...","category":"..."}]`

const RULES_AR = `${RULES}
Write every "short" in clear Modern Standard Arabic (فصحى بسيطة), still at most 12 words, starting with a verb. Keep product and tool names (GitHub, Remotion, SEO, PDF) in Latin letters. "icon" and "category" stay in English exactly as listed.`

type Answer = { name?: unknown; short?: unknown; icon?: unknown; category?: unknown }

function parse(text: string): Answer[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown
    return Array.isArray(v) ? (v as Answer[]) : []
  } catch {
    return []
  }
}

function clean(a: Answer, fp: string): SkillMeta | null {
  if (typeof a.short !== 'string' || !a.short.trim()) return null
  let short = a.short.replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  const words = short.split(' ')
  if (words.length > 14) short = words.slice(0, 14).join(' ') + '…'
  const icon = typeof a.icon === 'string' && ICON_NAMES.includes(a.icon) ? a.icon : 'sparkle'
  const category = typeof a.category === 'string' && CATEGORY_NAMES.includes(a.category) ? a.category : 'Other'
  return { fp, short, icon, category }
}

/** Clears a "describing…" left standing by a reload that cut a job short. */
export async function resetStatus($: EngineInterface) {
  running = false
  await update($, status, s => ({ ...s, running: false }))
  await update($, busy, () => [])
}

async function regenerateOne($: EngineInterface, list: CommandInfo[], name: string, lang: SkillLang) {
  const c = list.find(x => x.name === name)
  if (!c) return
  await update($, busy, b => [...b.filter(n => n !== name), name])
  try {
    const body = await skillFile($, c.name)
    const r = await $.model.complete({
      model: MODEL,
      system: [{ text: lang === 'ar' ? RULES_AR : RULES, cache: true }],
      prompt: `### ${c.name}
Description: ${c.description}${body ? `
Instructions (start):
${body}` : ''}`,
      maxTokens: 400,
      timeoutMs: 45_000,
    })
    if (!r.isAnswered) {
      $.ui.toast(`Couldn't rewrite ${name}: the model call failed (${r.reason}).`)
      return
    }
    const m = parse(r.text).map(a => clean(a, fingerprint(c))).find(Boolean)
    if (!m) {
      $.ui.toast(`Couldn't rewrite ${name}: the model's answer wasn't usable. Try ↻ again.`)
      return
    }
    const old = (await read($, meta))[name]
    const next: SkillMeta =
      lang === 'ar'
        ? { ...(old ?? { short: '', icon: m.icon, category: m.category }), fp: m.fp, shortAr: m.short }
        : { ...m, shortAr: old && old.fp === m.fp ? old.shortAr : undefined }
    await update($, meta, all => ({ ...all, [name]: next }))
    await saveMeta($)
    $.ui.toast(`Rewrote ${name}: ${m.short}`)
  } catch (err) {
    $.ui.toast(`Couldn't rewrite ${name}: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await update($, busy, b => b.filter(n => n !== name))
  }
}

/** Describes every skill that is new or changed; `force` redoes all but manual edits. */
export async function generate(
  $: EngineInterface,
  list: CommandInfo[],
  opts: { force?: boolean; only?: string; lang?: SkillLang } = {},
) {
  const lang = opts.lang ?? 'en'
  // One skill's ↻ runs at once, even while a big job is going.
  if (opts.only) return regenerateOne($, list, opts.only, lang)
  if (running) {
    $.ui.toast('Already describing skills — the new request waits until that finishes.')
    return
  }
  running = true
  try {
    const known = await read($, meta)
    const todo = list.filter(c => {
      if (opts.only) return c.name === opts.only
      const m = known[c.name]
      if (m?.manual) return false
      if (opts.force || !m || m.fp !== fingerprint(c)) return true
      return lang === 'ar' ? !m.shortAr : !m.short
    })
    if (todo.length === 0) return
    await update($, status, () => ({ running: true, done: 0, total: todo.length }))
    let done = 0
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH)
      const items = await Promise.all(
        batch.map(async c => {
          const body = await skillFile($, c.name)
          return `### ${c.name}\nDescription: ${c.description}${body ? `\nInstructions (start):\n${body}` : ''}`
        }),
      )
      const r = await $.model.complete({
        model: MODEL,
        system: [{ text: lang === 'ar' ? RULES_AR : RULES, cache: true }],
        prompt: items.join('\n\n'),
        maxTokens: 1500,
        timeoutMs: 60_000,
      })
      if (!r.isAnswered) {
        await update($, status, s => ({ ...s, running: false, error: `The model call failed (${r.reason}).` }))
        return
      }
      const answers = parse(r.text)
      const before = await read($, meta)
      const fresh: Record<string, SkillMeta> = {}
      batch.forEach((c, j) => {
        const a = answers.find(x => x.name === c.name) ?? answers[j]
        const m = a ? clean(a, fingerprint(c)) : null
        if (!m) return
        const old = before[c.name]
        const sameSkill = old && old.fp === m.fp
        if (lang === 'ar') {
          // Arabic fills its own field; the English text, icon and category stay.
          fresh[c.name] = sameSkill
            ? { ...old, shortAr: m.short }
            : { fp: m.fp, short: '', shortAr: m.short, icon: m.icon, category: m.category }
        } else {
          fresh[c.name] = { ...m, shortAr: sameSkill ? old.shortAr : undefined }
        }
      })
      await update($, meta, m => ({ ...m, ...fresh }))
      await saveMeta($)
      done += batch.length
      await update($, status, s => ({ ...s, done }))
    }
    await update($, status, s => ({ ...s, running: false }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await update($, status, s => ({ ...s, running: false, error: msg }))
  } finally {
    running = false
  }
}
