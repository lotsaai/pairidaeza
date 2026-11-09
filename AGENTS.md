# Pairidaeza

## NSH docs are required reading

Do not write NSH code from memory or by analogy with React, React Native or CSS.

- Index: https://nsh.dev/llms.txt
- Full docs: https://nsh.dev/llms-full.txt. Read the relevant sections before writing or changing UI, and whenever unsure an API, element or module exists.
- Design Guides: skill `nsh-design-guides` (`references/design-guides.md`). Read in full before any visible UI change.
- Coding Guides: `.agents/skills/nsh/references/coding-guides.md`.
- Exact APIs: `.nsh/types` (run `nsh check` to generate).
- The site follows the latest release. Verify examples against `.nsh/types` for the installed `nsh` version.

## Rules

- Prefer TSX/TS. Do not edit `Cargo.toml` or `src/lib.rs` unless asked.
- Use codebase-memory graph tools, `ast_grep` and `ast_edit` before `grep`, `find` or `ls`.
- Loop: `nsh check`, `nsh build` (read warnings), `nsh test`, then `nsh run` and look at the result.
