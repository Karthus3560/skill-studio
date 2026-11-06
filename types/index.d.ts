export type SkillMeta = {
  /** Fingerprint of the skill's name and description when this was made. */
  fp: string
  /** One plain sentence, at most 12 words, in English. */
  short: string
  /** The same in Arabic, made when the person switches to Arabic. */
  shortAr?: string
  icon: string
  category: string
  /** Set by the person's own edit: never overwritten by generation. */
  manual?: boolean
}

export type SkillLang = 'en' | 'ar'

export type SkillGenStatus = {
  running: boolean
  done: number
  total: number
  error?: string
}

/** Which overlay is open over the panel, if any. */
export type StudioMenu = '' | 'filter' | 'settings'

declare module 'claude-code' {
  interface PluginState {
    'skill-studio': {
      query: string
      category: string
      meta: Shaped<Record<string, SkillMeta>>
      status: SkillGenStatus
      page: number
      recent: string[]
      favorites: string[]
      lang: SkillLang
      busy: string[]
      menu: StudioMenu
      /** The skill whose details view is open, '' for the list. */
      detail: string
      /** Whether the details view's edit fields are open. */
      editing: boolean
    }
  }
}
