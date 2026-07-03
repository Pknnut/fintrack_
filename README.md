# FinTrack

A personal finance PWA (Thai baht ฿) for tracking transactions, goals, instalments,
budgets, and recurring items. Single-page, vanilla JS, no build step.

**Live app:** https://pknnut.github.io/

## Stack
- Frontend: vanilla HTML/CSS/JS, hosted on GitHub Pages
- Backend: Google Apps Script (`fintrack_appscript.gs`) connected to Google Sheets
- Storage: localStorage (offline-first), synced to Sheets on demand

## Files
| File | Purpose |
|---|---|
| `index.html` | Main app shell + markup |
| `style.css` | All styling (design tokens, components, dark mode) |
| `ui-kit.js` | Reusable UI engines — numeric keypad, EN/TH text keyboard, custom dropdowns |
| `app-core.js` | State, save/sync helpers, modals infra, startup, PIN, navigation (`goTo`), History, date utils |
| `app-dashboard.js` | Dark mode, Home, Safe to Spend (+ Estimated Bills card), Net Worth, Goals, Analytics |
| `app-instalments-add.js` | Instalments (+ payoff simulator, debt-free planner), Add form, Split transactions |
| `app-settings-budget.js` | Sheets sync engine, Settings page, Budget |
| `app-notifications-recurring.js` | Goal contribution history, Goal spending, In-app notifications, Recurring, Estimated Bills page |
| `app-calendar.js` | Calendar page, Monthly report card, Add Recurring modal, Calendar search |
| `app-init.js` | Bootstrap kickoff — **must stay the last `<script>` tag** in `index.html` |
| `fintrack_appscript.gs` | Backend — doGet/doPost handlers for Sheets read/write |

App logic used to be one `app.js` (it grew past 3,400 lines); it's now split into
the `app-*.js` files above, in the order `index.html` loads them. They're plain
scripts sharing one global scope (no bundler, no modules) — same mechanism as
`ui-kit.js` already used — so every `onclick="..."` attribute in `index.html`
keeps working unmodified. `app-core.js` declares the shared state (`txs`, `GOALS`,
`INSTALLMENTS`, `settings`, etc.) and must load first; `app-init.js` calls
`startup()` and must load last. The files between those two can be edited
independently — just don't reorder the first or last script tag.

## Local development
No build step. Just serve the folder:
```bash
npx serve .
# or: VSCode "Live Server" extension → Go Live
```
Avoid opening `index.html` directly via `file://` — some fetch/CORS behavior
differs from an actual HTTP server.

## Deploying
- **Frontend:** push to `main` → GitHub Pages rebuilds automatically (~1 min).
- **Backend:** edit `fintrack_appscript.gs` in this repo, then copy changes into
  the Apps Script editor and redeploy the Web App (or use `clasp push` if set up).

## Conventions
- Surgical edits only — no full-file rewrites. Diffs should be small and reviewable.
- Run `node --check <file>.js` before committing any JS change.
- All money values render through `fmt()` — never format ฿ amounts inline.
- Colors via CSS variables (`var(--slate-900)` etc.) — no hardcoded hex in new code.
- Inline SVG or emoji for icons (no icon-font dependency issues on some devices).