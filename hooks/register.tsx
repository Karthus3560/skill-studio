// Skill Studio (v2): a warm, Claude-themed skill browser in a side panel.
//
//   header   [✦] Skills · 231 skills                         [⚙]
//   search   [ Search skills…               ] [● All ▾]
//   (menus open over the list: Filter, Settings)
//   ★ Favorites / Recent / All skills
//   row      [icon]  name                                [+]  [⋯]
//                    one-line description
//   details  ‹ Back, big icon, name, what it does, full text, actions
//
// Narrow panel: a list. Wide panel: a grid of cards (2 to 4 per row).

import { atom, read, update } from 'claude-code'
import type { CommandInfo, EngineInterface, Register } from 'claude-code'

import type { SkillGenStatus, SkillLang, SkillMeta, StudioMenu } from '../types'
import { categoryOf } from './art'
import { fingerprint, generate, loadMeta, resetStatus, setMeta } from './gen'
import { CATEGORY_COLORS, CATEGORY_NAMES, ICON_NAMES, clayIcon, iconForCategory } from './icons'

// ---- Claude palette ----
const CLAY = '#D97757'
const CREAM = '#F0EEE6'
const SAND = '#E3D5C1'
const MUTED = '#A39E93'
const EDGE = '#3B3A36'
const RAISED = '#2B2A27'
const SHEET = '#201F1D'
const HOVER = 'rgba(217,119,87,0.10)'

const PANE = 'skill-studio'
const PER_PAGE = 30
const STORE_RECENT = 'recent-v1'
const STORE_FAVS = 'favorites-v1'
const STORE_LANG = 'lang-v1'
const NBSP = ' '
const pad = (t: string, n: number) => t + NBSP.repeat(Math.max(0, n - t.length))
const padStart = (t: string, n: number) => NBSP.repeat(Math.max(0, n - t.length)) + t

// ---- state (each file names what it reads) ----
const query = atom({ plugin: 'skill-studio', key: 'query' } as const, '')
const category = atom({ plugin: 'skill-studio', key: 'category' } as const, 'All')
const page = atom({ plugin: 'skill-studio', key: 'page' } as const, 0)
const recent = atom({ plugin: 'skill-studio', key: 'recent' } as const, [] as string[])
const favorites = atom({ plugin: 'skill-studio', key: 'favorites' } as const, [] as string[])
const lang = atom({ plugin: 'skill-studio', key: 'lang' } as const, 'en' as SkillLang)
const busy = atom({ plugin: 'skill-studio', key: 'busy' } as const, [] as string[])
const menu = atom({ plugin: 'skill-studio', key: 'menu' } as const, '' as StudioMenu)
const detail = atom({ plugin: 'skill-studio', key: 'detail' } as const, '')
const editing = atom({ plugin: 'skill-studio', key: 'editing' } as const, false)
const meta = atom({ plugin: 'skill-studio', key: 'meta' } as const, {} as Record<string, SkillMeta>, { shape: 'meta-1' })
const status = atom(
  { plugin: 'skill-studio', key: 'status' } as const,
  { running: false, done: 0, total: 0 } as SkillGenStatus,
)

// ---- skills ----
let knownNames = new Set<string>()

async function skills($: EngineInterface): Promise<CommandInfo[]> {
  const all = await $.command.list()
  const own = all.filter(c => (c.source === 'user' || c.source === 'plugin') && c.name !== 'skill-studio')
  knownNames = new Set(own.map(c => c.name))
  const seen = new Set<string>()
  return own
    .filter(c => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Splits `plugin:skill` into the skill's own name and where it comes from. */
function splitName(name: string): { title: string; source: string } {
  const i = name.indexOf(':')
  return i < 0 ? { title: name, source: '' } : { title: name.slice(i + 1), source: name.slice(0, i) }
}

function oneLine(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').replace(/^(use (this|when)[^.]*?(when|to)\s)/i, '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function dotColor(label: string): string {
  return label === 'All' ? CLAY : (CATEGORY_COLORS[label] ?? MUTED)
}

/** Cards per row from the panel width in cells; 1 means the list layout. */
function columnsFor(bodyColumns: number): number {
  if (bodyColumns >= 150) return 4
  if (bodyColumns >= 110) return 3
  if (bodyColumns >= 80) return 2
  return 1
}
const WIDTH_FOR: Record<number, string> = { 2: '48%', 3: '31%', 4: '23%' }

// ---- prompt ----
/** Paints every `/skill` in the draft that names a real skill as a clay chip. */
async function paintSkills($: EngineInterface, text?: string) {
  const draft = text ?? (await $.prompt.read()).text
  const decorations = []
  const re = /(^|\s)(\/[A-Za-z0-9][\w:.-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(draft))) {
    const word = m[2]!
    if (!knownNames.has(word.slice(1))) continue
    const start = m.index + m[1]!.length
    decorations.push({ start, end: start + word.length, bold: true, color: CLAY, backgroundColor: 'rgba(217,119,87,0.18)' })
  }
  await $.prompt.paint({ text: draft, decorations }).catch(() => undefined)
}

/** Adds `/name` at the cursor, keeping what was typed; several can be added. */
async function addSkill($: EngineInterface, name: string) {
  const box = await $.prompt.read()
  const before = box.text.slice(0, box.cursor)
  const after = box.text.slice(box.cursor)
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
  const trail = after.length === 0 || /^\S/.test(after) ? ' ' : ''
  const filled = await $.prompt.fill({ text: `${lead}/${name}${trail}`, mode: 'insert' })
  if (!filled.isFilled) await $.command.run({ command: name })
  await update($, recent, list => [name, ...list.filter(n => n !== name)].slice(0, 5))
  await $.store.set(STORE_RECENT, await read($, recent))
  await paintSkills($)
}

async function toggleFavorite($: EngineInterface, name: string) {
  await update($, favorites, list => (list.includes(name) ? list.filter(n => n !== name) : [name, ...list]))
  await $.store.set(STORE_FAVS, await read($, favorites))
}

async function openDetail($: EngineInterface, name: string) {
  await update($, menu, () => '' as StudioMenu)
  await update($, editing, () => false)
  await update($, detail, () => name)
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

type Row = CommandInfo & { m: SkillMeta | undefined; label: string }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'skill-studio', description: 'Open Skill Studio' })
    await loadMeta($)
    await resetStatus($)
    await skills($).catch(() => [])
    const savedRecent = (await $.store.get(STORE_RECENT)) as string[] | undefined
    if (Array.isArray(savedRecent)) await update($, recent, () => savedRecent.slice(0, 5))
    const savedFavs = (await $.store.get(STORE_FAVS)) as string[] | undefined
    if (Array.isArray(savedFavs)) await update($, favorites, () => savedFavs)
    const savedLang = (await $.store.get(STORE_LANG)) as SkillLang | undefined
    if (savedLang === 'ar' || savedLang === 'en') await update($, lang, () => savedLang)
    $.clock.after(4000, () => {
      void skills($).then(async list => generate($, list, { lang: await read($, lang) }))
    })
    return next(e)
  })

  on('command.run', { command: 'skill-studio' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Skills' })
    return { text: 'Skill Studio opened.' }
  })

  // Keep skill chips painted as the person types, pastes or recalls history.
  on('prompt.edit', async ($, e, next) => {
    const done = await next(e)
    if (knownNames.size > 0) void paintSkills($)
    return done
  })
  on('prompt.change', async ($, e, next) => {
    const done = await next(e)
    if (knownNames.size > 0) void paintSkills($, e.text)
    return done
  })

  // ---- the button above the prompt ----
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    // Never nest the engine's own placeholder: the desktop drops a band that does.
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" marginTop={1} marginBottom={1}>
          <Button key="studio-open" onPress={() => void $.ui.open({ id: PANE, title: 'Skills' })}>
            <Text color={CLAY} bold>✦ Skills</Text>
          </Button>
        </Box>
        {below}
      </Box>
    )
  })

  // ---- the panel ----
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const hasSvg = e.surface !== 'terminal' && 'Svg' in ui
    const raw = await read($, query)
    const q = raw.trim().toLowerCase()
    const cat = await read($, category)
    const known = await read($, meta)
    const gen = await read($, status)
    const lng = await read($, lang)
    const working = new Set(await read($, busy))
    const open = await read($, menu)
    const detailName = await read($, detail)
    const isEditing = await read($, editing)
    const recents = await read($, recent)
    const favs = await read($, favorites)
    const all = await skills($)

    const rows: Row[] = all.map(c => {
      const m = known[c.name]
      const fresh = m && (m.manual || m.fp === fingerprint(c)) ? m : undefined
      return { ...c, m: fresh, label: fresh?.category ?? categoryOf(c.name, c.description).label }
    })
    const byName = new Map(rows.map(r => [r.name, r]))
    const blurbOf = (c: Row) =>
      (lng === 'ar' ? c.m?.shortAr : undefined) || c.m?.short || oneLine(c.description || c.label, 90)
    const iconOf = (c: Row) => c.m?.icon ?? iconForCategory(c.label)
    const svg = (c: Row, size: number) =>
      hasSvg ? <ui.Svg source={clayIcon(iconOf(c), size)} alt={c.label} width={size} height={size} /> : null
    const countOf = (label: string) => (label === 'All' ? rows.length : rows.filter(r => r.label === label).length)
    const setMenu = (v: StudioMenu) => void update($, menu, cur => (cur === v ? '' : v))

    // ---------- details view ----------
    const d = detailName ? byName.get(detailName) : undefined
    if (d) {
      const { title, source } = splitName(d.name)
      const isFav = favs.includes(d.name)
      const blurb = blurbOf(d)
      const save = (patch: Partial<SkillMeta>) =>
        void setMeta($, d.name, {
          fp: fingerprint(d),
          short: d.m?.short ?? '',
          shortAr: d.m?.shortAr,
          icon: iconOf(d),
          category: d.m?.category ?? d.label,
          ...patch,
          manual: true,
        })
      return (
        <Box flexDirection="column" gap={1} width="100%">
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
            <Button key="detail-back" plain onPress={() => void update($, detail, () => '')}>
              <Text color={CLAY} bold>‹ Back</Text>
            </Button>
            <Button key="detail-fav" plain onPress={() => void toggleFavorite($, d.name)}>
              <Text color={isFav ? CLAY : MUTED}>{isFav ? '★ Favourite' : '☆ Favourite'}</Text>
            </Button>
          </Box>
          <Box flexDirection="column" alignItems="center" gap={1} paddingY={1} width="100%">
            {svg(d, 72)}
            <Text bold size="title">{title}</Text>
            <Text size="caption" color={dotColor(d.label)}>
              ● {d.label}
              {source ? `  ·  ${source}` : ''}
              {d.m?.manual ? '  ·  edited' : ''}
            </Text>
          </Box>
          <Box flexDirection="column" padding={1} borderStyle="round" borderColor={EDGE} backgroundColor={RAISED} width="100%">
            <Text color={CREAM}>{blurb}</Text>
          </Box>
          <Box flexDirection="row" gap={1} width="100%">
            <Button key="detail-add" variant="primary" label={`Add /${title} to prompt`} onPress={() => void addSkill($, d.name)} />
            <Button
              key="detail-regen"
              label={working.has(d.name) ? '⏳ Rewriting…' : '↻ Rewrite'}
              onPress={() => {
                if (!working.has(d.name)) void generate($, all, { only: d.name, lang: lng })
              }}
            />
            <Button key="detail-edit" label={isEditing ? 'Done' : '✎ Edit'} onPress={() => void update($, editing, v => !v)} />
          </Box>
          {isEditing && 'Input' in ui && 'Select' in ui && (
            <Box flexDirection="column" gap={1} padding={1} borderStyle="round" borderColor={CLAY} width="100%">
              <ui.Input
                key="detail-edit-short"
                label={lng === 'ar' ? 'الوصف المختصر' : 'Short description'}
                value={blurb}
                submitLabel="Save"
                onSubmit={value => save(lng === 'ar' ? { shortAr: value.trim() || blurb } : { short: value.trim() || blurb })}
              />
              <ui.Select
                key="detail-edit-icon"
                label="Icon"
                value={iconOf(d)}
                options={ICON_NAMES.map(n => ({ value: n, label: n }))}
                onSelect={value => save({ icon: value })}
              />
              <ui.Select
                key="detail-edit-cat"
                label="Category"
                value={d.m?.category ?? d.label}
                options={CATEGORY_NAMES.map(n => ({ value: n, label: n }))}
                onSelect={value => save({ category: value })}
              />
            </Box>
          )}
          <Text dimColor size="caption" bold>FULL DESCRIPTION</Text>
          <Text dimColor size="footnote">{d.description || 'No description.'}</Text>
        </Box>
      )
    }

    // ---------- list view ----------
    const matches = rows.filter(
      c =>
        (cat === 'All' || c.label === cat) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          (c.m?.short.toLowerCase().includes(q) ?? false) ||
          (c.m?.shortAr?.includes(raw.trim()) ?? false)),
    )
    const pages = Math.max(1, Math.ceil(matches.length / PER_PAGE))
    const pg = Math.min(await read($, page), pages - 1)
    const visible = matches.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE)
    const isHome = !q && cat === 'All' && pg === 0
    const favRows = isHome ? favs.map(n => byName.get(n)).filter((r): r is Row => !!r).slice(0, 8) : []
    const recentRows = isHome ? recents.map(n => byName.get(n)).filter((r): r is Row => !!r && !favs.includes(r.name)) : []
    const cols = columnsFor(e.props.bodyColumns || 56)

    // A list row: icon | name + one line | + | ⋯
    const listRow = (c: Row, keyPrefix: string) => {
      const { title } = splitName(c.name)
      return (
        <Box
          key={`${keyPrefix}-${c.name}`}
          flexDirection="row"
          alignItems="center"
          gap={1}
          paddingX={1}
          paddingY={1}
          width="100%"
          borderStyle="round"
          borderColor={EDGE}
          hover={{ borderColor: CLAY, backgroundColor: HOVER }}
        >
          {svg(c, 38)}
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            <Button key={`${keyPrefix}-name-${c.name}`} plain onPress={() => void openDetail($, c.name)}>
              <Text bold color={CREAM}>{title}</Text>
              {favs.includes(c.name) ? <Text color={CLAY}> ★</Text> : ''}
            </Button>
            <Text dimColor size="footnote">{oneLine(blurbOf(c), 72)}</Text>
          </Box>
          <Button key={`${keyPrefix}-add-${c.name}`} onPress={() => void addSkill($, c.name)}>
            <Text bold color={CLAY}>+</Text>
          </Button>
          <Button key={`${keyPrefix}-more-${c.name}`} plain label="⋯" onPress={() => void openDetail($, c.name)} />
        </Box>
      )
    }

    // A grid card for wide panels: icon | actions, name, description.
    const card = (c: Row, width: string) => {
      const { title } = splitName(c.name)
      return (
        <Box
          key={`card-${c.name}`}
          flexDirection="column"
          gap={1}
          padding={1}
          width={width}
          borderStyle="round"
          borderColor={EDGE}
          hover={{ borderColor: CLAY, backgroundColor: HOVER }}
        >
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
            {svg(c, 44)}
            <Box flexDirection="row" gap={1} alignItems="center">
              <Button key={`card-add-${c.name}`} onPress={() => void addSkill($, c.name)}>
                <Text bold color={CLAY}>+ Add</Text>
              </Button>
              <Button key={`card-more-${c.name}`} plain label="⋯" onPress={() => void openDetail($, c.name)} />
            </Box>
          </Box>
          <Button key={`card-name-${c.name}`} plain onPress={() => void openDetail($, c.name)}>
            <Text bold color={CREAM}>{title}</Text>
            {favs.includes(c.name) ? <Text color={CLAY}> ★</Text> : ''}
          </Button>
          <Text dimColor size="footnote">{oneLine(blurbOf(c), 110)}</Text>
        </Box>
      )
    }

    const section = (label: string, color: string, list: Row[], keyPrefix: string) =>
      list.length === 0 ? null : (
        <Box key={`section-${keyPrefix}`} flexDirection="column" gap={1} width="100%">
          <Text size="caption" bold color={color}>{label}</Text>
          {cols === 1 ? (
            list.map(c => listRow(c, keyPrefix))
          ) : (
            <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} width="100%">
              {list.map(c => card(c, WIDTH_FOR[cols] ?? '48%'))}
            </Box>
          )}
        </Box>
      )

    // Menus open over the list, below the search row.
    const menuBox = (key: string, title: string, children: unknown) => (
      <Box
        key={key}
        position="absolute"
        top={3}
        left={0}
        right={0}
        width="100%"
        flexDirection="column"
        gap={1}
        paddingX={2}
        paddingY={1}
        borderStyle="round"
        borderColor={CLAY}
        backgroundColor={SHEET}
      >
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
          <Text bold size="caption" color={CLAY}>{title}</Text>
          <Button key={`${key}-close`} plain label="✕" role="dismiss" onPress={() => void update($, menu, () => '' as StudioMenu)} />
        </Box>
        {children as never}
      </Box>
    )

    const filterMenu = menuBox(
      'menu-filter',
      'FILTER',
      [0, 2, 4, 6, 8].map(i => (
        <Box key={`filter-line-${i}`} flexDirection="row" justifyContent="space-between" width="100%">
          {['All', ...CATEGORY_NAMES].slice(i, i + 2).map(label => (
            <Button
              key={`cat-${label}`}
              variant={label === cat ? 'primary' : 'secondary'}
              onPress={() => {
                void update($, category, () => label)
                void update($, page, () => 0)
                void update($, menu, () => '' as StudioMenu)
              }}
            >
              <Text color={dotColor(label)}>● </Text>
              <Text mono bold color={label === cat ? undefined : CREAM}>{pad(label, 9)}</Text>
              <Text mono dimColor>{padStart(String(countOf(label)), 4)}</Text>
            </Button>
          ))}
        </Box>
      )),
    )

    const settingsMenu = menuBox('menu-settings', 'SETTINGS', [
      <Text key="set-lang-title" dimColor size="caption">Descriptions in</Text>,
      <Box key="set-lang" flexDirection="row" gap={1}>
        {(['en', 'ar'] as const).map(code => (
          <Button
            key={`lang-${code}`}
            variant={lng === code ? 'primary' : 'secondary'}
            onPress={() => {
              void (async () => {
                await update($, lang, () => code)
                await $.store.set(STORE_LANG, code)
                await update($, menu, () => '' as StudioMenu)
                await generate($, all, { lang: code })
              })()
            }}
          >
            <Text mono bold>{code === 'en' ? pad('English', 8) : pad('العربية', 8)}</Text>
          </Button>
        ))}
      </Box>,
      <Box key="set-actions" flexDirection="column" gap={1}>
        <Button
          key="set-rewrite-all"
          plain
          onPress={() => {
            void update($, menu, () => '' as StudioMenu)
            void generate($, all, { force: true, lang: lng })
          }}
        >
          <Text color={CREAM}>↻ Rewrite every description</Text>
        </Button>
        <Button
          key="set-clear-recent"
          plain
          onPress={() => {
            void update($, recent, () => [])
            void $.store.set(STORE_RECENT, [])
          }}
        >
          <Text color={CREAM}>⌫ Clear recent</Text>
        </Button>
      </Box>,
      <Box key="set-credit" flexDirection="column" alignItems="center" width="100%" paddingTop={1} borderStyle="single" borderColor={EDGE}>
        <Text size="caption" color={SAND}>✦ Skill Studio v2</Text>
        <Text size="caption" color={MUTED}>Designed and made by <Text bold color={CLAY}>Ghaith Saad Jawad</Text></Text>
        <Text size="caption" dimColor>© 2026 Ghaith Saad Jawad. All rights reserved.</Text>
      </Box>,
    ])

    const described = rows.filter(r => (lng === 'ar' ? r.m?.shortAr : r.m?.short)).length
    const subtitle = gen.running
      ? `Describing skills… ${gen.done} of ${gen.total}`
      : gen.error
        ? `Descriptions paused: ${gen.error}`
        : `${rows.length} skills${described < rows.length ? ` · ${described} described` : ''}${lng === 'ar' ? ' · العربية' : ''}`

    return (
      <Box flexDirection="column" gap={1} width="100%">
        {/* header */}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
          <Box flexDirection="row" alignItems="center" gap={1}>
            {hasSvg && <ui.Svg source={clayIcon('sparkle', 40)} alt="Skills" width={40} height={40} />}
            <Box flexDirection="column">
              <Text bold size="heading" color={CREAM}>Skills</Text>
              <Text size="caption" color={gen.error ? CLAY : MUTED}>{subtitle}</Text>
            </Box>
          </Box>
          <Button key="open-settings" plain onPress={() => setMenu('settings')}>
            <Text color={open === 'settings' ? CLAY : MUTED} size="heading">⚙</Text>
          </Button>
        </Box>

        {/* search + filter, with the menus drawn over the list */}
        <Box flexDirection="column" width="100%" position="relative">
          <Box flexDirection="row" alignItems="center" gap={1} width="100%">
            {'Input' in ui && (
              <Box flexGrow={1} flexShrink={1} flexDirection="column">
                <ui.Input
                  key="search"
                  placeholder="Search skills…"
                  value={raw}
                  autoFocus
                  onInput={value => {
                    void update($, query, () => value)
                    void update($, page, () => 0)
                  }}
                  onSubmit={value => {
                    const first = matches[0]
                    if (first && value.trim()) void addSkill($, first.name)
                  }}
                />
              </Box>
            )}
            <Button key="open-filter" onPress={() => setMenu('filter')}>
              <Text color={dotColor(cat)}>● </Text>
              <Text bold color={CREAM}>{cat}</Text>
              <Text color={MUTED}> {open === 'filter' ? '▴' : '▾'}</Text>
            </Button>
          </Box>
          {open === 'filter' && filterMenu}
          {open === 'settings' && settingsMenu}
        </Box>

        {section('★  FAVOURITES', CLAY, favRows, 'fav')}
        {section('RECENT', SAND, recentRows, 'recent')}
        {section(
          q ? `${matches.length} MATCHES` : `${cat === 'All' ? 'ALL SKILLS' : cat.toUpperCase()}  ·  ${matches.length}`,
          q ? MUTED : dotColor(cat),
          visible,
          'all',
        )}

        {matches.length === 0 && (
          <Box flexDirection="column" alignItems="center" gap={1} paddingY={2} width="100%">
            <Text bold color={CREAM}>Nothing matches “{raw.trim()}”</Text>
            <Text dimColor size="footnote">Try another word, or switch the filter to All.</Text>
          </Box>
        )}

        {pages > 1 && (
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
            <Button key="page-prev" plain onPress={() => void update($, page, p => Math.max(0, Math.min(p, pages - 1) - 1))}>
              <Text color={pg > 0 ? CLAY : MUTED}>‹ Previous</Text>
            </Button>
            <Text dimColor size="caption">{pg + 1} / {pages}</Text>
            <Button key="page-next" plain onPress={() => void update($, page, p => Math.min(pages - 1, p + 1))}>
              <Text color={pg < pages - 1 ? CLAY : MUTED}>Next ›</Text>
            </Button>
          </Box>
        )}
      </Box>
    )
  })
}
