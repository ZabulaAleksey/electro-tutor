# Electro Tutor - local instructions

Before working here, read `~/codex-workspace/AGENTS.md`. This file contains only project-specific additions; a more local `AGENTS.md` takes priority for its directory.

## Project context

- Astro-based bilingual RU/UA electrical-engineering learning platform.
- Start with `PROJECT_CONTEXT.md`; use `ARCHITECTURE.md` for code location, `CONTENT_GUIDE.md` for lessons, and `PAYMENTS_AND_BOOKING.md` only for scheduling or payment work.
- Keep user-facing educational content consistent across supported locales.
- Do not edit generated `dist/` output or dependency directories manually.

## Commands

- Development: `npm run dev`
- Static and type checks: `npm run check` and `npm run lint`
- Production build: `npm run build`

Load only the documents and AI Dev Team rules relevant to the current task; do not preload all rules, SPEC files, or `LEARNING_LOG.md`.
