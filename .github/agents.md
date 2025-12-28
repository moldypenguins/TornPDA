# AI Agent Instructions — TornPDA+

Purpose: quickly orient an AI coding assistant so it can be immediately productive editing, adding features, or fixing bugs.

* **Big picture architecture**

  + Tampermonkey userscripts targeting Torn: two primary scripts under `src/` — `ExecutePlus.user.js` and `RacingPlus.user.js` — each may have a paired SCSS file (`*.scss`).
  + Build pipeline uses Gulp: `clean → lint (ESLint + Stylelint) → userscripts`.
    - SCSS is compiled via `sass`, processed with `postcss + autoprefixer`, minified with `clean-css`, then inlined into JS by replacing `__MINIFIED_CSS__` placeholders.
    - JS is minified with `terser` (JSDoc comments preserved; `// TODO:` removed; `'use strict'` kept).
    - Outputs go to `dist/` and are referenced by Tampermonkey metadata `@updateURL`/`@downloadURL`.
  + Linting/formatting:
    - ESLint (Flat) with browser globals; Prettier enforced via `eslint-plugin-prettier` and `eslint-config-prettier`.
    - Stylelint with `stylelint-config-standard-scss`, `recess-order`, and CSS Modules helper.
    - Prettier settings: `printWidth: 160`, `semi: true`, `singleQuote: false`, `tabWidth: 2`, `bracketSameLine: true`.


* **When making changes**
  + Keep commits/patches atomic; one concern per diff.
  + Confirm before large refactors; default to minimal surface edits.
  + Keep markdown frontmatter consistent; add new fields to all localized copies.

* **Where to look for typical changes**
  + src/*
  + `*.user.js`: Tampermonkey metadata and script logic.
  + `*.scss`: styles compiled and injected; ensure matching filenames for CSS injection.
  + `gulpfile.js`, `eslint.config.js`, `stylelint.config.js`, `prettier.config.js`: build and standards.

* **Project-specific conventions**
  + Comments: comment code following the project's conventions; keep comments concise, consistent, and helpful.
  + Strings: no hardcoded user‑visible text.
  + Styling: scss that is compiled and injected during build.
  + Commit convention: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `style:`).
  + Avoid large component templates; extract logic if complexity grows.
  + Tampermonkey metadata:
    - Keep `@name`, `@namespace`, `@version`, `@description`, `@match`, `@run-at`, `@grant` accurate and minimal.
    - Use `@updateURL`/`@downloadURL` pointing to `refs/heads/main/dist/*.user.js` raw URLs.
    - Only add `@require` if necessary; prefer local bundling; do not rely on GM_* unless required.
  + CSS injection:
    - Maintain `__MINIFIED_CSS__` placeholder where styles are assigned (e.g., `s.innerHTML = \`__MINIFIED_CSS__\`;`).
    - Ensure a paired `*.scss` exists when using the placeholder; filename must match the script base name.
  + Logging and runtime:
    - Keep debug logging behind flags; avoid noisy console output in production builds.
    - Avoid long synchronous operations; prefer defer/wait helpers.
  + Distribution:
    - Do not edit files in `dist/` manually; they are build artifacts.
    - Bump `@version` when making user‑visible changes; align with README badges/notes if applicable.

* **Common code standards to follow**

  + JavaScript (per ESLint Flat + Prettier):
    - `ecmaVersion: latest`, `sourceType: script`, browser globals allowed.
    - `no-unused-vars: warn`; remove dead code and unused constants.
    - Formatting via Prettier: 160 char width, semicolons, double quotes, 2‑space indent, bracketSameLine on.
    - Prefer `const`/`let` over `var`; avoid global leaks; keep functions small and focused.
  + SCSS (per Stylelint):
    - Standard SCSS rules with order guidance; autoprefix via build (no manual vendor prefixes).
    - No redundant shorthands; avoid duplicate selectors; keep attribute quotes consistent with config.
    - Keep `dist/` and `node_modules/` ignored; fix violations with `npm run lint:fix` when safe.
  + Build & tasks:
    - `npm run build` → full clean, lint, and bundle to `dist/`.
    - `npm run start` → build once then watch (`monitor`).
    - `npm run lint`, `npm run lint:js`, `npm run lint:scss`, `npm run lint:fix` → targeted linting.


* **Agent Operating Rules**
  + Avoid wasting tokens: read only necessary files; targeted searches over full dumps.
  + Default to concise answers; expand only when user requests more detail.
  + Use `apply_patch` for edits; never invent paths; keep diffs minimal.
  + Confirm intent before broad refactors or dependency additions.
  + Maintain existing style & formatting; no gratuitous rearranging.
  + Cite official docs below for framework specifics; avoid guessing.
  + No secrets or credentials exposure; treat env config as sensitive.
  + Provide aggregated patches rather than noisy micro‑diffs unless user asks.
  + Justify any new dependency; prefer native Nuxt/Vue/Tailwind solutions.
  + Clarify assumptions instead of guessing when ambiguity exists.
  + Avoid unnecessary verbosity; do not restate unchanged plans.
  + Only run tests/lint relevant to changes; avoid full scans unless needed.
  + Repository specifics:
    - Edit only under `src/`; never modify `dist/` by hand.
    - Preserve Tampermonkey metadata ordering and URLs; keep `@grant` minimal.
    - When adding styles, include the `__MINIFIED_CSS__` placeholder and create a matching SCSS file.
    - Use Gulp tasks for build/lint; do not introduce alternate pipelines without approval.

* **Context Documentation** - The following official documentation sites are useful context for working in this repository:
  + `https://www.tampermonkey.net/documentation.php`: Tampermonkey official documentation.
  + `https://gulpjs.com/docs`: Gulp official docs.
  + `https://eslint.org/docs/latest/extend/configure-flat-config`: ESLint Flat Config docs.
  + `https://stylelint.io/user-guide/get-started`: Stylelint guide.
  + `https://prettier.io/docs/en/options.html`: Prettier options.
