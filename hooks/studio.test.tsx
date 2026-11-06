import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never,
} as const

const PANE = (bodyColumns = 56) =>
  ({
    plugin: 'skill-studio',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'skill-studio',
    props: { title: 'Skills', isFocused: true, bodyColumns, placement: 'dock' } as never,
  }) as never

const SKILLS = [
  { name: 'video-shotcraft', description: 'Plan shots for a video', source: 'user' },
  { name: 'seo-audit', description: 'Audit a site for SEO', source: 'plugin' },
  { name: 'anthropic-skills:built-in-browser', description: 'Drive the in-app browser', source: 'plugin' },
  { name: 'help', description: 'Built-in help', source: 'builtin' },
]

const quiet = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('command.list', () => ({ value: SKILLS }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.scroll', () => ({ value: {} }) as never)
  on('prompt.paint', () => ({ value: { isPainted: true } }) as never)
}

test('the band shows the Skills button and it opens the panel', async ($, on) => {
  const opened: string[] = []
  quiet(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'skill-studio', surface, ...BAND })
    expect(await ui.find({ key: 'studio-open' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'skill-studio', surface: 'desktop', ...BAND })
  await ui.press({ key: 'studio-open' })
  expect(opened).toContain('skill-studio')
  await ui.unmount()
})

test('the list shows only user and plugin skills; + adds at the cursor', async ($, on) => {
  const filled: string[] = []
  quiet(on)
  on('prompt.read', () => ({ value: { text: 'make a video', cursor: 5 } }) as never)
  on('prompt.fill', ($, e) => {
    expect(e.mode).toBe('insert')
    filled.push(e.text)
    return { isFilled: true, text: e.text } as never
  })
  const ui = await $.ui.mount(PANE())
  expect(await ui.find({ key: 'all-add-video-shotcraft' })).toBeDefined()
  expect(await ui.find({ key: 'all-add-anthropic-skills:built-in-browser' })).toBeDefined()
  expect(await ui.find({ key: 'all-add-help' })).toBeUndefined()
  await ui.press({ key: 'all-add-seo-audit' })
  expect(filled).toEqual(['/seo-audit '])
  expect(await ui.find({ key: 'recent-add-seo-audit' })).toBeDefined()
  await ui.unmount()
})

test('the filter menu opens over the list and filters', async ($, on) => {
  quiet(on)
  const ui = await $.ui.mount(PANE())
  await ui.press({ key: 'open-filter' })
  expect(await ui.find({ key: 'menu-filter' })).toBeDefined()
  await ui.press({ key: 'cat-Video' })
  expect(await ui.find({ key: 'menu-filter' })).toBeUndefined()
  expect(await ui.find({ key: 'all-add-video-shotcraft' })).toBeDefined()
  expect(await ui.find({ key: 'all-add-seo-audit' })).toBeUndefined()
  await ui.unmount()
})

test('⋯ opens the details view; favourite shows a Favourites section; Back returns', async ($, on) => {
  quiet(on)
  const ui = await $.ui.mount(PANE())
  await ui.press({ key: 'all-more-seo-audit' })
  expect(await ui.find({ key: 'detail-add' })).toBeDefined()
  await ui.press({ key: 'detail-fav' })
  await ui.press({ key: 'detail-back' })
  expect(await ui.find({ key: 'fav-add-seo-audit' })).toBeDefined()
  await ui.unmount()
})

test('a wide panel draws cards instead of rows', async ($, on) => {
  quiet(on)
  const ui = await $.ui.mount(PANE(160))
  expect(await ui.find({ key: 'card-add-seo-audit' })).toBeDefined()
  expect(await ui.find({ key: 'all-add-seo-audit' })).toBeUndefined()
  await ui.unmount()
})

test('Settings switches descriptions to Arabic', async ($, on) => {
  const asked: string[] = []
  quiet(on)
  on('model.complete', ($, e) => {
    asked.push(String(e.system))
    return {
      value: {
        isAnswered: true,
        text: '[{"name":"seo-audit","short":"يفحص الموقع لتحسين الظهور في البحث","icon":"search","category":"Marketing"}]',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    } as never
  })
  const ui = await $.ui.mount(PANE())
  await ui.press({ key: 'open-settings' })
  await ui.press({ key: 'lang-ar' })
  expect(asked.some(s => s.includes('Arabic'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /يفحص الموقع/ })).toBeDefined()
  await ui.unmount()
})

test('Settings shows the author credit', async ($, on) => {
  quiet(on)
  const ui = await $.ui.mount(PANE())
  await ui.press({ key: 'open-settings' })
  expect(await ui.find({ type: 'Text', text: /Ghaith Saad Jawad/ })).toBeDefined()
  await ui.unmount()
})
