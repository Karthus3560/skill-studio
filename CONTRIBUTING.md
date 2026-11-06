# Contributing to Skill Studio

Thanks for wanting to make Skill Studio better. You're free to change it however you like. Here's how to share your changes back.

## The short version

1. **Fork** this repo (the Fork button, top right).
2. Make your change on a branch in your fork.
3. Test it in Claude Code (see below).
4. Open a **pull request** here and describe what changed and why. A screenshot helps a lot for anything visual.

## Developing locally

Skill Studio is a Claude Code **mod** (a plugin of function hooks). To run your copy:

```bash
git clone https://github.com/<you>/skill-studio.git
claude --plugin-dir ./skill-studio
```

Saving a file reloads the mod in that session. Before opening a PR:

```bash
claude plugin validate ./skill-studio
claude plugin test ./skill-studio
```

Both should pass. The tests live in `hooks/studio.test.tsx`.

## Where things are

| File | What it does |
|---|---|
| `hooks/register.tsx` | The ✦ Skills button, the panel, menus, the details view, adding skills to the prompt |
| `hooks/gen.ts` | Writes each skill's short description, icon and category with a small model, then caches them |
| `hooks/icons.ts` | Category colours and how an icon is drawn |
| `hooks/clay.ts` | The 48 clay icons, embedded as small WebP images |
| `types/index.d.ts` | The mod's saved state |

## Ideas welcome

- More icon packs, or a picker to switch packs
- More description languages
- Keyboard navigation in the grid
- Better categories

## Ground rules

- Keep the credit to the original author in Settings and in the license.
- Be kind in issues and PRs.
- Don't commit API keys, tokens or personal data.
