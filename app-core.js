// FinTrack — Core: constants, state, save/sync helpers, modals, startup, PIN, navigation, History, date utils.
// Loaded FIRST — declares the state every other app-*.js file reads (txs, GOALS, INSTALLMENTS, settings, etc).
const INCOME_CATS = [{e:"💼",n:"Salary"},{e:"💰",n:"Freelance"},{e:"📈",n:"Trading / Investing"},{e:"🏠",n:"Rental Income"},{e:"🎁",n:"Bonus"},{e:"💵",n:"Other Income"},{e:"🏦",n:"Interest Income"},{e:"💸",n:"Refund / Cashback"},{e:"🎉",n:"Gift Received"}];
const EXPENSE_CATS = [{e:"🏠",n:"Rent / Mortgage"},{e:"🍜",n:"Food & Dining"},{e:"🚇",n:"BTS / MRT"},{e:"🚗",n:"Grab / Transport"},{e:"⛽",n:"Gasoline"},{e:"⚡",n:"Electricity"},{e:"💧",n:"Water"},{e:"📱",n:"Phone / Internet"},{e:"🛒",n:"Groceries"},{e:"🏥",n:"Health / Medical"},{e:"👕",n:"Shopping"},{e:"🎬",n:"Entertainment"},{e:"✈️",n:"Travel"},{e:"📚",n:"Education"},{e:"💳",n:"Credit Card"},{e:"🏦",n:"Loan Repayment"},{e:"💊",n:"Pharmacy"},{e:"🛡️",n:"Insurance"},{e:"📦",n:"Other Expense"},{e:"👨‍👩‍👧",n:"Family Support"},{e:"📺",n:"Subscriptions"},{e:"🥊",n:"Fitness & Sports"},{e:"🎀",n:"Gifts & Donations"},{e:"🔧",n:"Home Maintenance"},{e:"💇",n:"Personal Care"},{e:"🐾",n:"Pet Care"}];
// Shared edit-button icon (matches the recurring page's edit button) — used for every edit button.
const EDIT_PENCIL    = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const EDIT_PENCIL_SM = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const SIM_BOLT = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>';
let GOALS = [];
let INSTALLMENTS = [
  {icon:"🏍️",name:"Bike (1)",cat:"💳 Credit Card",total:3218.80,monthly:321.88,paid:5,total_mo:10,color:"var(--teal)"},
  {icon:"🏍️",name:"Bike (2)",cat:"💳 Credit Card",total:9556.50,monthly:955.65,paid:5,total_mo:10,color:"var(--amber)"},
  {icon:"🏍️",name:"Bike (3)",cat:"💳 Credit Card",total:2772.90,monthly:462.15,paid:4,total_mo:6,color:"var(--green)"},
  {icon:"🛡️",name:"AIA Insurance",cat:"🛡️ Insurance",total:30681.70,monthly:3068.17,paid:5,total_mo:10,color:"#8b5cf6"},
];
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CAT_COLORS = ["#6366f1","#0d9488","#f59e0b","#ef4444","#22c55e","#8b5cf6","#ec4899","#f97316"];
// Soft background tints for category icons (calendar detail + search).
// Built FROM the category arrays above by position, not a hand-maintained name
// lookup — so renaming a category in EXPENSE_CATS/INCOME_CATS can't desync this
// the way the old hardcoded-name-keyed map could.
const EXPENSE_TINTS = [
  "var(--tint-green-bg)", "var(--tint-amber-bg)", "var(--tint-blue-bg)", "var(--tint-blue-bg)",
  "var(--tint-blue-bg)", "var(--tint-cyan-bg)", "var(--tint-cyan-bg)", "var(--tint-cyan-bg)",
  "var(--tint-amber-bg)", "var(--tint-rose-bg)", "var(--tint-orange-bg)", "var(--tint-purple-bg)",
  "var(--tint-purple-bg)", "var(--tint-purple-bg)", "var(--slate-100)", "var(--slate-100)",
  "var(--tint-rose-bg)", "var(--tint-rose-bg)", "var(--slate-100)",
  "var(--tint-rose-bg)", "var(--tint-purple-bg)", "var(--tint-green-bg)", "var(--tint-amber-bg)",
  "var(--tint-blue-bg)", "var(--tint-rose-bg)", "var(--tint-cyan-bg)"
];
const INCOME_TINTS = Array(INCOME_CATS.length).fill("var(--tint-green-bg)");
const CAT_BG = {};
EXPENSE_CATS.forEach((c, i) => { CAT_BG[c.n] = EXPENSE_TINTS[i] || "var(--slate-100)"; });
INCOME_CATS.forEach((c, i) => { CAT_BG[c.n] = INCOME_TINTS[i] || "var(--tint-green-bg)"; });

let txs = JSON.parse(localStorage.getItem("ft_txs") || "[]");
// Data integrity: strip fromGoal:true when there's no goalName (legacy bad data).
// Names that don't match a real goal are validated later in isGoalSpend() at render time.
txs = txs.map(t => t.fromGoal && !t.goalName ? {...t, fromGoal: false} : t);
let settings = JSON.parse(localStorage.getItem("ft_settings") || "{}");
const _savedGoals = JSON.parse(localStorage.getItem("ft_goals") || "null");
const _savedInsts = JSON.parse(localStorage.getItem("ft_insts") || "null");
if (_savedGoals) GOALS.push(..._savedGoals);
if (_savedInsts) { INSTALLMENTS.length = 0; INSTALLMENTS.push(..._savedInsts); }
// g.saved is always DERIVED from contributions minus spends, never trusted as an
// incrementally-maintained running total. Spending from a goal used to only log to
// g.spends without ever touching g.saved, so the goal's progress bar/percentage
// silently stayed wrong (showing gross ever-contributed instead of what's actually
// still held) the moment you spent anything. Recalculating from the source arrays
// on every load/mutation makes it self-correcting instead of relying on every
// handler that touches contributions/spends to remember to keep saved in sync.
//
// Migration note: goal creation lets you set a starting "saved" amount directly
// (no matching contribution entry created for it) — so a goal can legitimately
// have saved > 0 with an empty contributions array. Recalculating blindly from
// contributions alone would silently zero that starting amount out. One-time fix:
// if a goal has saved > 0 but no contributions/spends recorded at all, seed a
// single "Starting balance" contribution for the current saved value before
// recalculating, so the amount is preserved going forward instead of lost.
function migrateGoalStartingBalance(g) {
  const hasHistory = (g.contributions && g.contributions.length) || (g.spends && g.spends.length);
  if (!hasHistory && g.saved > 0) {
    g.contributions = [{ id: Date.now(), amount: g.saved, note: "Starting balance", date: toDateStr(new Date()) }];
  }
  if (!g.contributions) g.contributions = [];
}
function recalcGoalSaved(g) {
  const contribTotal = (g.contributions || []).reduce((s,c) => s + (c.amount||0), 0);
  const spendTotal    = (g.spends || []).reduce((s,sp) => s + (sp.amount||0), 0);
  g.saved = contribTotal - spendTotal;
}
function recalcAllGoalsSaved() { GOALS.forEach(g => { migrateGoalStartingBalance(g); recalcGoalSaved(g); }); saveGoals(); }
recalcAllGoalsSaved();
// g.saved is always DERIVED from contributions minus spends, never trusted as an
// incrementally-maintained running total. Spending from a goal used to only log to
// g.spends without ever touching g.saved, so the goal's progress bar/percentage
// silently stayed wrong (showing gross ever-contributed instead of what's actually
// still held) the moment you spent anything. Recalculating from the source arrays
// on every load/mutation makes it self-correcting instead of relying on every
// handler that touches contributions/spends to remember to keep saved in sync.
function recalcGoalSaved(g) {
  const contribTotal = (g.contributions || []).reduce((s,c) => s + (c.amount||0), 0);
  const spendTotal    = (g.spends || []).reduce((s,sp) => s + (sp.amount||0), 0);
  g.saved = contribTotal - spendTotal;
}
function recalcAllGoalsSaved() { GOALS.forEach(recalcGoalSaved); }
recalcAllGoalsSaved();
// Backfills goalId onto legacy goal-spends (matched by current name), so the link
// survives future goal renames. Runs at load, and again after fetchGoalsFromSheets —
// a freshly-fetched goal has a brand new local id, so any transaction that already
// references it by name needs re-linking to that new id.
function backfillGoalIds() {
  let changed = false;
  txs.forEach(t => {
    if (t.fromGoal === true && t.type === "Expense" && t.goalId == null && t.goalName) {
      const g = GOALS.find(g => g.name === t.goalName);
      if (g) { t.goalId = g.id; changed = true; }
    }
  });
  if (changed) saveTxs();
}
backfillGoalIds();
// Backfills a stable id onto any instalment missing one — needed so confirmMarkPaid
// can link a transaction back to the instalment that created it. Runs at load time,
// and again after fetchInstallmentsFromSheets (since Sheets has no id column at all —
// every fetched instalment needs a fresh one assigned locally).
function backfillInstIds() {
  let changed = false;
  INSTALLMENTS.forEach((p, i) => {
    if (p.id == null) { p.id = Date.now() + i; changed = true; }
  });
  if (changed) saveInsts();
}
backfillInstIds();
let pinBuffer = "", pinMode = "enter", pinSetupFirst = "";
let unsyncedIds = JSON.parse(localStorage.getItem("ft_unsynced") || "[]");
// Tracks txs edited locally but not synced — keyed by rowId so fetchFromSheets
// can re-apply the edit on top of pulled data instead of losing it.
let pendingEdits = JSON.parse(localStorage.getItem("ft_pending_edits") || "{}");
function savePendingEdits() { localStorage.setItem("ft_pending_edits", JSON.stringify(pendingEdits)); }
let deletedRowIds = new Set(JSON.parse(localStorage.getItem("ft_deleted_rows") || "[]"));
function saveDeletedRows() { localStorage.setItem("ft_deleted_rows", JSON.stringify([...deletedRowIds])); }
async function fixBalance() {
  deletedRowIds = new Set();
  saveDeletedRows();
  showToast("Blocked rows cleared — pulling fresh data…");
  await pullAllFromSheets();
  showToast("Balance updated ✓");
}
let RECURRING = JSON.parse(localStorage.getItem("ft_recurring") || "[]");
// Strip null/undefined holes that can appear when confirmAddRecurring() writes
// to an out-of-bounds index (stale _recAddEditIdx). Those holes survive
// JSON round-trips as null and make renderRecurringPage throw.
if (!Array.isArray(RECURRING)) RECURRING = [];
RECURRING = RECURRING.filter(r => r && typeof r === "object" && r.desc);
let isRecurring = false;
function saveRecurring() {
  RECURRING = RECURRING.filter(r => r && typeof r === "object" && r.desc);
  localStorage.setItem("ft_recurring", JSON.stringify(RECURRING));
  if (settings.sheetsUrl) syncRecurringToSheets();
}
async function syncRecurringToSheets() {
  await Promise.race([
    postToSheets("save_recurring", { recurring: RECURRING }),
    new Promise(r => setTimeout(() => r(false), 6000))
  ]);
}
async function fetchRecurringFromSheets(silent = false) {
  if (!settings.sheetsUrl) return false;
  try {
    const res  = await fetch(settings.sheetsUrl + "?action=get_recurring");
    const data = await res.json();
    if (data.recurring && Array.isArray(data.recurring)) {
      RECURRING = data.recurring.filter(r => r && typeof r === "object" && r.desc);
      localStorage.setItem("ft_recurring", JSON.stringify(RECURRING));
      return true;
    }
    return false;
  } catch { return false; }
}

// The backend's get_installments route already existed — this is the frontend half
// that was never built, which is why instalments never came back on a fresh device.
// Sheets has no id/color columns at all (those are local-only concepts), so every
// fetched plan needs a fresh id (backfillInstIds) and a fallback color assigned here.
// "name" may or may not carry a leading emoji depending on how it was originally
// saved — parsed the same way submitInst()/openEditInstModal() already do.
async function fetchInstallmentsFromSheets(silent = false) {
  if (!settings.sheetsUrl) return false;
  try {
    const res  = await fetch(settings.sheetsUrl + "?action=get_installments");
    const data = await res.json();
    if (data.installments && Array.isArray(data.installments) && data.installments.length) {
      INSTALLMENTS = data.installments.map((r, i) => {
        const raw = r.name || "";
        const m = raw.match(/^(\p{Emoji}\uFE0F?)\s*/u);
        return {
          id: Date.now() + i,
          icon: m ? m[1] : "📦",
          name: m ? raw.slice(m[0].length) : raw,
          cat: r.category || "",
          total: Number(r.total) || 0,
          monthly: Number(r.monthly) || 0,
          paid: Number(r.monthsPaid) || 0,
          total_mo: Number(r.totalMonths) || 0,
          color: CAT_COLORS[i % CAT_COLORS.length],
          startDate: r.startDate || ""
        };
      });
      saveInsts();
      return true;
    }
    return false;
  } catch { return false; }
}

// Goals had no pull-back path at all until now — backend's get_goals route is brand
// new (see fintrack_appscript.gs). Recovers name/saved/target/monthly/due, since
// that's all the sheet stores; category, color, contribution history, and goal-spend
// logs are local-only concepts with no Sheets column, so they're not recoverable —
// the goal itself comes back, not its full history. Re-running backfillGoalIds after
// this is what re-links any local goal-spend transactions to the newly-fetched goal's
// (necessarily new) local id, matched by name.
async function fetchGoalsFromSheets(silent = false) {
  if (!settings.sheetsUrl) return false;
  try {
    const res  = await fetch(settings.sheetsUrl + "?action=get_goals");
    const data = await res.json();
    if (data.goals && Array.isArray(data.goals) && data.goals.length) {
      GOALS = data.goals.map((r, i) => {
        const raw = r.name || "";
        const m = raw.match(/^(\p{Emoji}\uFE0F?)\s*/u);
        // Defensive: Sheets can silently reinterpret "Jul 2026"-style text as a Date
        // object on re-entry (the same risk already fixed for Budgets' effectiveYM
        // column) — formatDate() on the backend would then send back "2026-07-01"
        // instead. Convert that back to the "Mon YYYY" shape the rest of the app expects.
        let due = r.due || "—";
        const isoMatch = String(due).match(/^(\d{4})-(\d{2})-\d{2}/);
        if (isoMatch) due = MO[parseInt(isoMatch[2],10)-1] + " " + isoMatch[1];
        return {
          id: Date.now() + i,
          icon: m ? m[1] : "🎯",
          name: m ? raw.slice(m[0].length) : raw,
          saved: Number(r.saved) || 0,
          target: Number(r.target) || 0,
          monthly: Number(r.monthly) || 0,
          color: "var(--teal)", bg: "var(--tint-green-bg)",
          due, category: "",
          contributions: [], spends: []
        };
      });
      // Every fetch resets contributions/spends to [] (see comment above — they're
      // local-only, not recoverable from Sheets), but saved itself is the real,
      // canonical total from the sheet. Seed it as a contribution now, BEFORE
      // anything ever recalculates saved from contributions minus spends —
      // otherwise a fresh pull would silently zero out real progress the moment
      // any goal action next ran recalcGoalSaved().
      GOALS.forEach(migrateGoalStartingBalance);
      saveGoals();
      backfillGoalIds();
      return true;
    }
    return false;
  } catch { return false; }
}

// ══ ESTIMATED BILLS ══════════════════════════════════════════
// Bills you know are coming but whose exact amount varies month to month
// (electric, credit card, internet, mobile...). Unlike Recurring, this never
// auto-logs a transaction — it's a pure forecast, kept local-only (no Sheets sync).
// Matched against this month's real transactions by description, exactly like
// Recurring, so a bill drops out of the pending total the moment you log the real
// payment — it's never subtracted twice.
// Shared by Recurring and Estimated Bills: both need to know "has a transaction
// matching this description already been logged this month?" Building one Set per
// render and matching by (type|desc) — not just desc — means an Income item named
// "Bonus" can no longer be marked "logged" by an unrelated Expense also named "Bonus".
function buildLoggedKeysThisMonth() {
  const now = new Date();
  const mo = now.getMonth(), yr = now.getFullYear();
  const keys = new Set();
  txs.forEach(t => {
    if (!t || typeof t !== "object") return;
    const d = parseDate(t.date);
    if (d.getMonth() === mo && d.getFullYear() === yr) {
      keys.add((t.type || "Expense") + "|" + String(t.desc || t.description || "").toLowerCase());
    }
  });
  return keys;
}
function isLoggedThisMonth(loggedKeys, desc, type) {
  return loggedKeys.has((type || "Expense") + "|" + String(desc || "").toLowerCase());
}

let ESTIMATES = JSON.parse(localStorage.getItem("ft_estbills") || "[]");
if (!Array.isArray(ESTIMATES)) ESTIMATES = [];
// Same self-healing filter as RECURRING: a stale-index write (e.g. edit modal saving
// against an idx that no longer matches after the list shrank) can leave a sparse
// array slot, which JSON.stringify serializes as null. One null entry here used to
// throw inside renderEstBillsHomeCard() and silently take Safe-to-Spend and the
// Recent list down with it, since they render later in the same renderHome() call.
ESTIMATES = ESTIMATES.filter(b => b && typeof b === "object" && b.desc);
function saveEstBills() {
  localStorage.setItem("ft_estbills", JSON.stringify(ESTIMATES));
  if (settings.sheetsUrl) syncEstBillsToSheets();
}
async function syncEstBillsToSheets() {
  await Promise.race([
    postToSheets("save_estbills", { estimates: ESTIMATES }),
    new Promise(r => setTimeout(() => r(false), 6000))
  ]);
}
async function fetchEstBillsFromSheets(silent = false) {
  if (!settings.sheetsUrl) return false;
  try {
    const res  = await fetch(settings.sheetsUrl + "?action=get_estbills");
    const data = await res.json();
    if (data.estimates && Array.isArray(data.estimates)) {
      ESTIMATES = data.estimates.filter(e => e && typeof e === "object" && e.desc);
      localStorage.setItem("ft_estbills", JSON.stringify(ESTIMATES));
      return true;
    }
    return false;
  } catch { return false; }
}
// getPendingEstBills / estBillsPending*Total used to feed this-month Safe to Spend,
// back when Estimated Bills tracked "has this month's bill arrived yet." That page
// now forecasts next month instead (nothing can be logged against a month that
// hasn't started), so this-month Logged/Pending tracking no longer applies here —
// removed along with their only call site in renderSafeToSpend().
// Used by the Cash Flow Forecast — only bills explicitly flagged as repeating monthly
// (electric, credit card... or irregular income) get projected into future months. One-off
// estimates (repeats === false) are excluded since there's no signal for what future months hold.
// Missing the flag entirely (legacy bills, added before this existed) defaults to true.
function estBillsRepeatingExpenseTotal() {
  return ESTIMATES.filter(b => b && b.repeats !== false && (b.type||"Expense") !== "Income").reduce((s,b)=>s+(b.amount||0), 0);
}
function estBillsRepeatingIncomeTotal() {
  return ESTIMATES.filter(b => b && b.repeats !== false && b.type === "Income").reduce((s,b)=>s+(b.amount||0), 0);
}

if (!settings.pin || settings.pin.length !== 6) settings.pin = "123456";
if (settings.pinEnabled === undefined) settings.pinEnabled = true;
if (settings.autosync   === undefined) settings.autosync   = true;
if (!settings.notif)        settings.notif        = false;
if (!settings.notifBudget)  settings.notifBudget  = true;
if (!settings.notifLog)     settings.notifLog     = true;
if (!settings.notifGoal)    settings.notifGoal    = false;
if (!settings.sheetsUrl) settings.sheetsUrl = "";
saveSettings();

function saveTxs()      { localStorage.setItem("ft_txs",      JSON.stringify(txs)); }
function saveGoals()    { localStorage.setItem("ft_goals",    JSON.stringify(GOALS)); }
function saveInsts()    { localStorage.setItem("ft_insts",    JSON.stringify(INSTALLMENTS)); }
function saveSettings() { localStorage.setItem("ft_settings", JSON.stringify(settings)); }
function fmt(n, dp) {
  const d = dp === undefined ? 2 : dp;
  const formatted = Number(n).toLocaleString("th-TH", {minimumFractionDigits:d, maximumFractionDigits:d});
  if (window._privacyMode) return "฿ " + formatted.replace(/[0-9]/g, "*");
  return "฿" + formatted;
}
function togglePrivacy() {
  window._privacyMode = !window._privacyMode;
  const btn = document.getElementById("privacy-btn"), icon = document.getElementById("privacy-icon");
  if (window._privacyMode) { btn.classList.add("active"); icon.className = "ti ti-eye-off"; icon.style.fontSize = "17px"; }
  else { btn.classList.remove("active"); icon.className = "ti ti-eye"; icon.style.fontSize = "17px"; icon.style.color = "var(--slate-500)"; }
  renderHome();
  const activePage = document.querySelector(".page.active");
  if (activePage) {
    const id = activePage.id;
    if (id==="page-goals")        renderGoals();
    if (id==="page-analytics")    renderAnalytics();
    if (id==="page-installments") renderInstallments();
    if (id==="page-history")      renderHistory();
    if (id==="page-budget")       renderBudget();
  }
}
function safeDate(raw) {
  if (!raw) return "—";
  const parts = raw.split("-");
  if (parts.length !== 3) return "—";
  const y = parseInt(parts[0],10), m = parseInt(parts[1],10);
  if (isNaN(y)||isNaN(m)||m<1||m>12) return "—";
  return MO[m-1] + " " + y;
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══ MODALS ════════════════════════════════════════════════════
let modalGoalIdx = -1, modalInstIdx = -1;

function openGoalModal(idx) {
  modalGoalIdx = idx;
  const g = GOALS[idx];
  document.getElementById("modal-goal-title").textContent = "Add savings — " + g.name;
  document.getElementById("modal-goal-sub").textContent = "Currently saved: " + fmt(g.saved) + " of " + fmt(g.target);
  document.getElementById("modal-goal-amount").value = "";
  document.getElementById("modal-goal-note").value = "";
  const today = new Date();
  buildDaySelect("mg-date-d", today.getDate());
  buildMonthSelect("mg-date-m", today.getMonth()+1);
  buildYearSelect("mg-date-y", today.getFullYear(), 2, 1);
  sddEnhance("mg-date-d",{flex:"1",up:true}); sddEnhance("mg-date-m",{flex:"1.4",up:true}); sddEnhance("mg-date-y",{flex:"1.2",up:true});
  document.getElementById("modal-goal").classList.remove("hidden");
  nkpBind();
  /* keypad field: no autofocus (avoids auto-opening keypad over the form) */
}
function openInstModal(idx) {
  modalInstIdx = idx;
  const p = INSTALLMENTS[idx], newPaid = p.paid + 1;
  document.getElementById("modal-inst-title").textContent = "Mark as paid — " + p.name;
  document.getElementById("modal-inst-sub").textContent = "Payment " + newPaid + " of " + p.total_mo;
  document.getElementById("modal-inst-detail").innerHTML =
    '<div class="modal-detail-row"><span>Amount</span><strong>' + fmt(p.monthly) + '</strong></div>' +
    '<div class="modal-detail-row"><span>Months left after</span><strong>' + Math.max(p.total_mo-newPaid,0) + '</strong></div>' +
    '<div class="modal-detail-row"><span>Balance after</span><strong style="color:var(--red)">' + fmt(Math.max(p.total-p.monthly*newPaid,0)) + '</strong></div>';
  const linkNote = document.getElementById("modal-inst-link-note");
  if (linkNote) linkNote.innerHTML =
    '<i class="ti ti-link" style="font-size:15px;color:var(--green-text);margin-top:1px" aria-hidden="true"></i>' +
    '<div><p style="font-size:11px;font-weight:600;color:var(--green-text);margin:0 0 2px">Also logs an expense transaction</p>' +
    '<p style="font-size:10px;color:var(--green-text);margin:0">' + fmt(p.monthly) + ' · ' + p.cat.replace(/^\S+\s/,"") + ' · today — shows up in History, Analytics and Budget automatically.</p></div>';
  document.getElementById("modal-inst").classList.remove("hidden");
}
function openModal(type) {
  const el = document.getElementById("modal-" + type);
  if (el) el.classList.remove("hidden");
}
function closeModal(type) {
  document.getElementById("modal-" + type).classList.add("hidden");
  nkpClose();
  if (typeof tkbClose === "function") tkbClose();
  if (type==="goal")      modalGoalIdx = -1;
  if (type==="spend-goal")   spendGoalIdx = -1;
  if (type==="edit-contrib") { editContribGoalIdx=-1; editContribIdx=-1; }
  if (type==="inst")      modalInstIdx = -1;
  if (type==="budget")    editBudgetIdx = -1;
  if (type==="edit-tx")   editTxId = null;
  if (type==="edit-goal") editGoalIdx = -1;
  if (type==="edit-inst") editInstIdx = -1;
  if (type==="add-recurring") _recAddEditIdx = -1;
  if (type==="add-estbill") _estAddEditIdx = -1;
}

async function confirmAddSavings() {
  if (modalGoalIdx < 0) return;
  const amount = parseFloat(document.getElementById("modal-goal-amount").value) || 0;
  if (amount <= 0) { showToast("Enter an amount"); return; }
  const note = document.getElementById("modal-goal-note").value.trim();
  const date = getDateVal("mg-date-d","mg-date-m","mg-date-y") || toDateStr(new Date());
  const g = GOALS[modalGoalIdx];
  // Also create a real transaction so this actually reduces Current Balance —
  // money moving into a goal has genuinely left spendable cash. Typed Expense
  // (so calcSummary/Current Balance correctly subtracts it) but flagged toGoal
  // so isGoalSpend() excludes it from Analytics/Budget "spending" stats — saving
  // isn't consumption. History renders toGoal rows with a distinct teal "→"
  // instead of a red "-" so it doesn't read as a normal expense either.
  const tx = { id: Date.now()+1, date, type: "Expense", category: "🎯 Goal Savings",
               desc: g.name, amount, notes: note, toGoal: true, goalId: g.id, goalName: g.name };
  // Save to contributions log — txId links this entry to the transaction above,
  // so deleteGoalContrib/confirmEditContrib know which transaction to remove or
  // update. Without this link, deleting a contribution only removed the log
  // entry, leaving its transaction permanently orphaned in History and Sheets.
  if (!g.contributions) g.contributions = [];
  g.contributions.push({ id: Date.now(), amount, note, date, txId: tx.id });
  recalcGoalSaved(g);
  const newSaved = g.saved;
  saveGoals();
  txs.push(tx); saveTxs();
  closeModal("goal"); renderGoals(); renderHome();
  showToast("+" + fmt(amount) + " saved!");
  if (settings.sheetsUrl && settings.autosync) {
    setSyncStatus("syncing");
    const [goalOk, txRes] = await Promise.all([
      Promise.race([postToSheets("update_goal_saved",{data:{name:g.name,newSaved,target:g.target}}),new Promise(r=>setTimeout(()=>r(false),6000))]),
      Promise.race([postToSheetsRaw("add_transaction",{data:{...tx}}),new Promise(r=>setTimeout(()=>r(null),6000))])
    ]);
    if (txRes && !txRes.error && txRes.rowId) { const local = txs.find(x => x.id === tx.id); if (local) { local.rowId = txRes.rowId; saveTxs(); } }
    else if (!txRes || txRes.error) { unsyncedIds.push(tx.id); localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds)); }
    if (goalOk && txRes && !txRes.error) { setSyncStatus("ok"); showToast("Savings synced to Sheets ✓"); }
    else { setSyncStatus("error"); showToast("Saved locally — sync failed"); }
  }
}
async function confirmMarkPaid() {
  if (modalInstIdx < 0) return;
  const p = INSTALLMENTS[modalInstIdx];
  if (p.paid >= p.total_mo) { showToast("Already fully paid off"); closeModal("inst"); return; }
  const newPaid = p.paid + 1;
  const now = new Date();
  INSTALLMENTS[modalInstIdx].paid = newPaid;
  INSTALLMENTS[modalInstIdx].lastPaidYM = ymOf(now);
  saveInsts();
  // One real payment = one transaction, created here instead of a separate manual
  // entry — this is what lets Safe to Spend stop double-counting this instalment.
  const tx = { id: Date.now(), date: toDateStr(now), type: "Expense", category: p.cat,
    desc: (p.icon ? p.icon + " " : "") + p.name + " instalment", amount: p.monthly,
    notes: "", fromInst: true, instId: p.id };
  txs.push(tx); saveTxs();
  closeModal("inst"); renderInstallments(); renderHome();
  showToast(p.name + " — payment " + newPaid + "/" + p.total_mo + " marked + logged ✓");
  if (settings.sheetsUrl && settings.autosync) {
    setSyncStatus("syncing");
    const [instOk, txOk] = await Promise.all([
      Promise.race([postToSheets("update_installment_paid",{planName:p.name,monthsPaid:newPaid}),new Promise(r=>setTimeout(()=>r(false),6000))]),
      Promise.race([postToSheets("add_transaction",{data:{...tx}}),new Promise(r=>setTimeout(()=>r(false),6000))])
    ]);
    if (instOk && txOk) { setSyncStatus("ok"); }
    else {
      setSyncStatus("error");
      if (!txOk) { unsyncedIds.push(tx.id); localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds)); }
      showToast("Synced partially — check connection");
    }
  }
}

// ══ STARTUP ═══════════════════════════════════════════════════
async function rebuildAnalyticsSheet() {
  if (!settings.sheetsUrl) { showToast("Add Sheets URL in Settings first"); return; }
  const yr = analyticsYear || new Date().getFullYear();
  showToast("Rebuilding " + yr + " Analytics sheet…"); setSyncStatus("syncing");
  try {
    const res = await fetch(settings.sheetsUrl + "?action=rebuild_analytics&year=" + yr);
    const data = await res.json();
    if (data.success) { setSyncStatus("ok"); showToast(yr + " Analytics sheet rebuilt ✓"); }
    else { setSyncStatus("error"); showToast("Rebuild failed: " + (data.error || "unknown")); }
  } catch(e) { setSyncStatus("error"); showToast("Rebuild failed — check connection"); }
}

async function startup() {
  setLoading("Starting up…", 10);
  if (settings.sheetsUrl) {
    setLoading("Fetching data from Google Sheets…", 25);
    const [txOk, budgetOk] = await Promise.all([fetchFromSheets(true), fetchBudgetsFromSheets(true), fetchRecurringFromSheets(true), fetchInstallmentsFromSheets(true), fetchGoalsFromSheets(true), fetchEstBillsFromSheets(true)]);
    if (txOk || budgetOk) { setLoading("Data loaded ✓", 90); await delay(600); }
    else { setLoading("Working offline", 90); await delay(600); }
  } else { setLoading("Loading…", 80); await delay(300); }
  setLoading("Ready", 100); await delay(300);
  applyDarkMode();
  checkRecurringSuggestions();
  checkInAppNotifications();
  document.getElementById("loading-screen").classList.add("hidden");
  if (settings.pinEnabled) {
    document.getElementById("pin-screen").classList.remove("hidden");
    pinMode = "enter"; document.getElementById("pin-sub").textContent = "Enter your PIN"; updatePinDots();
  } else { unlockApp(); }
}
function setLoading(msg, pct) {
  document.getElementById("loading-msg").textContent = msg;
  document.getElementById("loading-bar").style.width = pct + "%";
}

async function fetchFromSheets(silent = false) {
  if (!settings.sheetsUrl) { if (!silent) { showToast("Add Sheets URL in Settings first"); goTo("settings"); } return false; }
  if (!silent) { setSyncStatus("syncing"); showToast("Pulling from Google Sheets…"); }
  try {
    const res = await fetch(settings.sheetsUrl + "?action=get_transactions");
    const data = await res.json();
    if (data.transactions && Array.isArray(data.transactions)) {
      // Dedup: remove from unsyncedIds any tx that Sheets already has (matched by date+amount+desc)
      const sheetsKeys = new Set(data.transactions.map(t => t.date + '|' + t.amount + '|' + (t.description||"")));
      unsyncedIds = unsyncedIds.filter(uid => {
        const local = txs.find(t => t.id === uid);
        if (!local) return false;
        const key = (local.date||"") + '|' + local.amount + '|' + (local.desc||local.description||"");
        return !sheetsKeys.has(key); // keep in unsynced only if NOT already in Sheets
      });
      localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds));
      // A tx that just got a rowId back from a successful write can still vanish here if
      // Sheets' read hasn't caught up with that write yet (Apps Script propagation lag) —
      // it has a rowId (so a plain !t.rowId check would drop it) but isn't in data.transactions
      // yet either, so it fell through both buckets.
      // BUT rowId is a Sheet row number, not a stable id — deleting any row shifts every row
      // below it up by one, so every other local tx's cached rowId can go stale in one delete.
      // A stale rowId won't be in this fetch either, which used to make a same-old-rowId check
      // treat it as "still unsynced" and keep it — duplicating the same transaction that's
      // also present correctly in sheetsRows under its new (shifted) rowId. Disambiguate the
      // two cases by content (date+amount+desc, same key already built above as sheetsKeys):
      // if the content is already present in the fresh pull under some rowId, this local copy
      // is just a stale echo of a shifted row — drop it. Only keep it if the content itself
      // isn't in the pull at all yet (genuine propagation lag on a brand-new add).
      const fetchedRowIds = new Set(data.transactions.map(t => t.rowId));
      const localOnly = txs.filter(t => {
        if (t.rowId && fetchedRowIds.has(t.rowId)) return false; // present under its own rowId — sheetsRows already covers it
        if (!t.rowId) return unsyncedIds.includes(t.id); // never synced — keep only if genuinely still unsynced
        const key = (t.date||"") + '|' + t.amount + '|' + (t.desc||t.description||"");
        return !sheetsKeys.has(key); // has a stale rowId — keep only if its content isn't in Sheets yet either
      });
      const sheetsRows = data.transactions.filter(t => !deletedRowIds.has(t.rowId)).map(t => ({id:t.rowId,rowId:t.rowId,date:normalizeDate(t.date),type:t.type,category:t.category,desc:t.description,amount:t.amount,notes:t.notes||"",fromGoal:t.fromGoal===true||t.fromGoal==="true"||t.fromGoal===1,toGoal:t.toGoal===true||t.toGoal==="true"||t.toGoal===1,goalId:t.goalId!=null?t.goalId:null,goalName:t.goalName||"",splitId:t.splitId||""}));
      // deletedRowIds is only meant to hide a just-deleted row for the few seconds before
      // Sheets' read catches up with the delete — it must NOT persist past that. Row numbers
      // get reused once everything below a deleted row shifts up, so a stale entry here
      // silently blacklists whatever unrelated transaction later lands on that same number.
      // Once we have a fresh authoritative pull, its job is done — clear it every pull.
      if (deletedRowIds.size) { deletedRowIds = new Set(); saveDeletedRows(); }
      txs = [...sheetsRows,...localOnly];
      // _loggedRecurringCache (app-notifications-recurring.js) is only a short-lived UI
      // convenience so the "Logged" badge updates instantly after tapping Log. This fetch
      // just pulled authoritative data from Sheets, so from this point on isLoggedThisMonth()
      // reading straight from txs IS the truth — clear the cache so it can never keep
      // claiming "Logged" for a transaction that was deleted or whose sync actually failed.
      if (typeof _loggedRecurringCache !== "undefined") _loggedRecurringCache.clear();
      // Re-apply any locally-edited values that haven't synced yet, so a pull
      // doesn't silently overwrite changes the user made since the last sync.
      if (Object.keys(pendingEdits).length) {
        txs = txs.map(t => {
          const edit = pendingEdits[t.rowId];
          return edit ? {...t, ...edit} : t;
        });
      }
      saveTxs(); settings.lastPull = new Date().toISOString(); saveSettings();
      if (!silent) { setSyncStatus("ok"); showToast(data.transactions.length + " transactions pulled ✓"); document.getElementById("last-pull-label").textContent = "Last pulled: just now"; }
      renderHome(); renderAnalytics(); return true;
    }
    return false;
  } catch(e) { if (!silent) { setSyncStatus("error"); showToast("Pull failed — check connection"); } return false; }
}

// Settings' "Pull from Google Sheets" button used to call fetchFromSheets() alone —
// transactions only. Budgets and Recurring only ever came back automatically on a
// full app startup() (which runs the same three fetches together) — meaning a fresh
// device that pastes the Sheets URL and taps Pull, without reloading the page first,
// got transactions back but not Recurring or Budgets. This is the actual "Pull"
// button now; it does what the label always implied it did.
async function pullAllFromSheets() {
  if (!settings.sheetsUrl) { showToast("Add Sheets URL in Settings first"); goTo("settings"); return; }
  setSyncStatus("syncing"); showToast("Pulling from Google Sheets…");
  const [txOk, budgetOk, recOk, instOk, goalOk] = await Promise.all([
    fetchFromSheets(true), fetchBudgetsFromSheets(true), fetchRecurringFromSheets(true), fetchInstallmentsFromSheets(true), fetchGoalsFromSheets(true), fetchEstBillsFromSheets(true)
  ]);
  if (txOk || budgetOk || recOk || instOk || goalOk) {
    setSyncStatus("ok");
    settings.lastPull = new Date().toISOString(); saveSettings();
    const lbl = document.getElementById("last-pull-label");
    if (lbl) lbl.textContent = "Last pulled: just now";
    const parts = [];
    if (txOk) parts.push("transactions");
    if (budgetOk) parts.push("budgets");
    if (recOk) parts.push("recurring");
    if (instOk) parts.push("instalments");
    if (goalOk) parts.push("goals");
    showToast("Pulled " + parts.join(", ") + " ✓");
    renderHome(); renderAnalytics();
    if (document.getElementById("page-budget")?.classList.contains("active")) renderBudget();
    if (document.getElementById("page-recurring")?.classList.contains("active")) renderRecurringPage();
    if (document.getElementById("page-installments")?.classList.contains("active")) renderInstallments();
    if (document.getElementById("page-goals")?.classList.contains("active")) renderGoals();
  } else {
    setSyncStatus("error"); showToast("Pull failed — check connection");
  }
}

function pinPress(digit) { if (pinBuffer.length >= 6) return; pinBuffer += digit; updatePinDots(); if (pinBuffer.length === 6) setTimeout(() => checkPin(), 120); }
function pinDel() { pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); document.getElementById("pin-error").textContent = ""; }
function updatePinDots() { for (let i=0;i<6;i++) document.getElementById("d"+i).classList.toggle("filled", i<pinBuffer.length); }
function checkPin() {
  if (pinMode === "enter") {
    if (pinBuffer === settings.pin) { unlockApp(); }
    else { document.getElementById("pin-error").textContent = "Incorrect PIN. Try again."; pinBuffer = ""; updatePinDots(); }
  } else if (pinMode === "setup") {
    pinSetupFirst = pinBuffer; pinBuffer = ""; pinMode = "confirm";
    document.getElementById("pin-sub").textContent = "Confirm your new PIN";
    document.getElementById("pin-setup-hint").textContent = "Enter the same PIN again"; updatePinDots();
  } else if (pinMode === "confirm") {
    if (pinBuffer === pinSetupFirst) {
      settings.pin = pinBuffer; saveSettings(); pinBuffer = ""; pinMode = "enter"; unlockApp(); showToast("PIN updated ✓");
    } else {
      document.getElementById("pin-error").textContent = "PINs don't match. Try again.";
      pinBuffer = ""; pinMode = "setup"; pinSetupFirst = "";
      document.getElementById("pin-sub").textContent = "Set a new PIN"; updatePinDots();
    }
  }
}
function unlockApp() { document.getElementById("pin-screen").classList.add("hidden"); updateSyncBar(); renderHome(); }
function changePin() {
  document.getElementById("pin-screen").classList.remove("hidden");
  pinBuffer = ""; pinMode = "setup"; pinSetupFirst = "";
  document.getElementById("pin-sub").textContent = "Set a new PIN";
  document.getElementById("pin-setup-hint").textContent = "Choose a 6-digit PIN";
  document.getElementById("pin-error").textContent = ""; updatePinDots();
}

function goTo(page) {
  const currentPage = document.querySelector(".page.active");
  if (currentPage) _prevPage = currentPage.id.replace("page-", "");
  if (currentPage && currentPage.id === "page-history" && page !== "history") {
    histFilter = "all";
    ["hist-filter-type","hist-filter-year","hist-filter-month","hist-filter-cat","hist-search"].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === "hist-filter-type" ? "all" : ""; });
    const panel = document.getElementById("hist-adv-panel"), btn = document.getElementById("hist-adv-btn");
    if (panel) panel.classList.remove("open"); if (btn) btn.classList.remove("active");
    const tagsEl = document.getElementById("hist-active-filters"), advLabel = document.getElementById("hist-adv-btn-label"), heading = document.getElementById("hist-type-label");
    if (tagsEl) tagsEl.innerHTML = ""; if (advLabel) advLabel.textContent = "Filter"; if (heading) heading.textContent = "All transactions";
  }
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const nb = document.getElementById("nav-" + page); if (nb) nb.classList.add("active");
  if (page==="home")         renderHome();
  if (page==="goals")        { const gPanel=document.getElementById("goals-filter-panel"),gBtn=document.getElementById("goals-filter-btn"); if(gPanel)gPanel.classList.remove("open"); if(document.getElementById("goals-filter-status"))document.getElementById("goals-filter-status").value="all"; if(document.getElementById("goals-filter-year"))document.getElementById("goals-filter-year").value=""; buildGoalsYearDropdown(); sddEnhance("goals-filter-status"); sddEnhance("goals-filter-year"); renderGoals(); }
  if (page==="analytics")    { closeAnalyticsDropdown(); renderAnalytics(); }
  if (page==="installments") { sddEnhance("inst-filter-status",{flex:"1"}); sddEnhance("inst-filter-sort",{flex:"1"}); renderInstallments(); }
  if (page==="add")          setupAdd();
  if (page==="settings")     renderSettings();
  if (page==="recurring")    { _recEditIdx = null; renderRecurringPage(); }
  if (page==="estbills")     { _estEditIdx = null; renderEstBillsPage(); }
  if (page==="forecast")     { renderForecastPage(); }
  if (page==="calendar")     { const cs=document.getElementById("cal-search"); if(cs)cs.value=""; const cr=document.getElementById("cal-search-results"); if(cr)cr.style.display="none"; const cm=document.getElementById("cal-main-content"); if(cm)cm.style.display="block"; renderCalendarPage(); }
  if (page==="history")      { histFilter="all"; document.getElementById("hist-search").value=""; document.getElementById("hist-adv-panel").classList.remove("open"); document.getElementById("hist-adv-btn").classList.remove("active"); if(document.getElementById("hist-filter-type"))document.getElementById("hist-filter-type").value="all"; buildHistFilterDropdowns(); ["hist-filter-type","hist-filter-year","hist-filter-month","hist-filter-cat"].forEach(id=>sddEnhance(id)); sddEnhance("hist-sort",{inline:true}); renderHistory(); }
  if (page==="budget")       { closeBudgetDropdown(); renderBudget(); }
}

let histFilter = "all";
let histDateFrom = null, histDateTo = null; // exact-day or week range from tapping the spending chart
// Tapping a point on the Home spending chart jumps here with that exact day (or
// week, for the 1M view) pre-filtered — set the range BEFORE calling goTo so its
// own renderHistory() call already reflects it, no extra render needed.
function goToHistoryForDate(dateStr) {
  histDateFrom = dateStr; histDateTo = dateStr;
  goTo("history");
}
function goToHistoryForRange(fromStr, toStr) {
  histDateFrom = fromStr; histDateTo = toStr;
  goTo("history");
}
let _prevPage = "home";
function onHistTypeChange() { histFilter = document.getElementById("hist-filter-type").value; document.getElementById("hist-filter-cat").value = ""; buildHistCategoryDropdown(); if(SDD_ENHANCED.has("hist-filter-type"))sddSync("hist-filter-type"); if(SDD_ENHANCED.has("hist-filter-cat"))sddSync("hist-filter-cat"); renderHistory(); }
function toggleHistAdv() { const panel=document.getElementById("hist-adv-panel"),btn=document.getElementById("hist-adv-btn"); const isOpen=panel.classList.toggle("open"); btn.classList.toggle("active",isOpen); if(isOpen)buildHistFilterDropdowns(); }
function buildHistFilterDropdowns() { buildHistYearDropdown(); buildHistCategoryDropdown(); }
function buildHistYearDropdown() {
  const years=[...new Set(txs.map(t=>parseDate(t.date).getFullYear()))].sort((a,b)=>b-a);
  const ySel=document.getElementById("hist-filter-year"),curY=ySel.value;
  ySel.innerHTML='<option value="">All years</option>'+years.map(y=>'<option value="'+y+'"'+(y==curY?' selected':'')+'>'+y+'</option>').join("");
  if (typeof sddSync==="function" && SDD_ENHANCED.has("hist-filter-year")) sddSync("hist-filter-year");
}
function buildHistCategoryDropdown() {
  const cats=[...new Set(txs.filter(t=>histFilter==="all"||t.type===histFilter).map(t=>t.category).filter(Boolean))].sort();
  const cSel=document.getElementById("hist-filter-cat"),curC=cSel.value;
  cSel.innerHTML='<option value="">All categories</option>'+cats.map(c=>'<option value="'+c+'"'+(c===curC?' selected':'')+'>'+c+'</option>').join("");
  if (typeof sddSync==="function" && SDD_ENHANCED.has("hist-filter-cat")) sddSync("hist-filter-cat");
}
function clearHistFilters() {
  histFilter="all"; document.getElementById("hist-filter-type").value="all"; document.getElementById("hist-filter-year").value=""; document.getElementById("hist-filter-month").value=""; document.getElementById("hist-filter-cat").value=""; document.getElementById("hist-search").value="";
  buildHistCategoryDropdown();
  ["hist-filter-type","hist-filter-year","hist-filter-month","hist-filter-cat"].forEach(id=>{ if(SDD_ENHANCED.has(id)) sddSync(id); });
  renderHistory();
}
function getHistActiveFilters() { return { year:document.getElementById("hist-filter-year")?.value||"", month:document.getElementById("hist-filter-month")?.value, cat:document.getElementById("hist-filter-cat")?.value||"" }; }
function renderHistTags(f) {
  const tags=[];
  if (histFilter!=="all") tags.push({label:histFilter,key:"type"});
  if (histDateFrom) {
    const d1=parseDate(histDateFrom);
    const label = histDateTo && histDateTo!==histDateFrom
      ? d1.getDate()+" "+MO[d1.getMonth()]+" – "+parseDate(histDateTo).getDate()+" "+MO[parseDate(histDateTo).getMonth()]
      : d1.getDate()+" "+MO[d1.getMonth()]+" "+d1.getFullYear();
    tags.push({label:label,key:"daterange"});
  }
  if (f.year) tags.push({label:f.year,key:"year"});
  if (f.month!==""&&f.month!==undefined&&f.month!==null) tags.push({label:MO[parseInt(f.month)],key:"month"});
  if (f.cat) tags.push({label:f.cat.replace(/^\S+\s/,""),key:"cat"});
  const heading=document.getElementById("hist-type-label");
  if (heading) { if(histFilter==="Expense")heading.textContent="Expenses"; else if(histFilter==="Income")heading.textContent="Income"; else heading.textContent="All transactions"; }
  const advLabel=document.getElementById("hist-adv-btn-label");
  if (advLabel) advLabel.textContent=tags.length>0?"Filter ("+tags.length+")":"Filter";
  const el=document.getElementById("hist-active-filters"); if(!el)return;
  el.innerHTML=tags.map(t=>'<div class="hist-filter-tag">'+t.label+'<button onclick="clearHistTag(\''+t.key+'\')" aria-label="Remove filter">×</button></div>').join("");
}
function clearHistTag(key) {
  if(key==="type"){histFilter="all";document.getElementById("hist-filter-type").value="all";buildHistCategoryDropdown();if(SDD_ENHANCED.has("hist-filter-type"))sddSync("hist-filter-type");}
  if(key==="daterange"){histDateFrom=null;histDateTo=null;}
  if(key==="year"){document.getElementById("hist-filter-year").value="";if(SDD_ENHANCED.has("hist-filter-year"))sddSync("hist-filter-year");}
  if(key==="month"){document.getElementById("hist-filter-month").value="";if(SDD_ENHANCED.has("hist-filter-month"))sddSync("hist-filter-month");}
  if(key==="cat"){document.getElementById("hist-filter-cat").value="";if(SDD_ENHANCED.has("hist-filter-cat"))sddSync("hist-filter-cat");}
  renderHistory();
}
function renderHistory() {
  const search=(document.getElementById("hist-search")?.value||"").toLowerCase();
  const sort=document.getElementById("hist-sort")?.value||"newest";
  const f=getHistActiveFilters();
  renderHistTags(f);
  const hasFilters=f.year||(f.month!==""&&f.month!==undefined)||f.cat;
  const advBtn=document.getElementById("hist-adv-btn"); if(advBtn)advBtn.classList.toggle("active",!!hasFilters);
  let list=txs.filter(t=>{
    if(histFilter!=="all"&&t.type!==histFilter)return false;
    if(histDateFrom&&t.date<histDateFrom)return false;
    if(histDateTo&&t.date>histDateTo)return false;
    if(f.year&&parseDate(t.date).getFullYear()!=f.year)return false;
    if(f.month!==""&&f.month!==undefined&&f.month!==null&&f.month!==""){if(parseDate(t.date).getMonth()!=parseInt(f.month))return false;}
    if(f.cat&&t.category!==f.cat)return false;
    if(search){const desc=String(t.desc||t.description||"").toLowerCase(),cat=(t.category||"").toLowerCase();if(!desc.includes(search)&&!cat.includes(search))return false;}
    return true;
  });
  if(sort==="newest")list.sort((a,b)=>parseDate(b.date)-parseDate(a.date));
  if(sort==="oldest")list.sort((a,b)=>parseDate(a.date)-parseDate(b.date));
  if(sort==="highest")list.sort((a,b)=>b.amount-a.amount);
  if(sort==="lowest")list.sort((a,b)=>a.amount-b.amount);
  const countEl=document.getElementById("hist-count"); if(countEl)countEl.textContent=list.length+" transaction"+(list.length!==1?"s":"");
  const el=document.getElementById("hist-list"); if(!el)return;
  if(!list.length){el.innerHTML='<div class="empty-state">No transactions found</div>';return;}
  // Date grouping
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  // Build render items: group split transactions into one card (unless a category
  // filter is active — then show members individually so the filter stays accurate).
  const groupAllowed = !f.cat;
  const items = [];
  const seenSplit = new Set();
  list.forEach(t => {
    if (groupAllowed && t.splitId) {
      if (seenSplit.has(t.splitId)) return;
      seenSplit.add(t.splitId);
      items.push({ group:true, date:t.date, txs:list.filter(x=>x.splitId===t.splitId) });
    } else {
      items.push({ group:false, date:t.date, tx:t });
    }
  });
  let lastDateKey = null;
  const rows = items.map(it => {
    let hdr = "";
    if (it.date !== lastDateKey) { lastDateKey = it.date; hdr = histDateHeader(it.date, today, yesterday); }
    return hdr + (it.group ? histSplitCard(it.txs) : histSingleRow(it.tx, !!it.tx.splitId));
  });
  el.innerHTML = rows.join("");
  initSwipeToDelete();
}
function histDateHeader(dateStr, today, yesterday) {
  const d = parseDate(dateStr); d.setHours(0,0,0,0);
  let lbl;
  if (d.getTime()===today.getTime()) lbl = "Today";
  else if (d.getTime()===yesterday.getTime()) lbl = "Yesterday";
  else lbl = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()] + " " + d.getDate() + " " + MO[d.getMonth()] + " " + d.getFullYear();
  return '<div class="hist-date-group">'+lbl+'</div>';
}
function histSingleRow(t, isSplitMember) {
  const isInc=t.type==="Income", d=parseDate(t.date), desc=t.desc||t.description||"";
  const isContrib = t.toGoal===true && isGoalSpend(t);
  const amtClass = isContrib ? "transfer" : (isInc ? "pos" : "neg");
  const amtPrefix = isContrib ? "→ " : (isInc ? "+" : "-");
  return '<div class="swipe-container" data-id="'+t.id+'">' +
    '<div class="swipe-del-bg"><i class="ti ti-trash" style="font-size:20px;color:var(--red)"></i></div>' +
    '<div class="hist-tx-row" data-id="'+t.id+'"><div class="tx-icon">'+(t.category||"").split(" ")[0]+'</div><div style="flex:1;min-width:0"><div class="tx-name">'+desc+
    (isContrib?'<span class="goal-contrib-pill-tag">'+goalSpendName(t)+'</span>':(isGoalSpend(t)?'<span class="goal-pill-tag">'+goalSpendName(t)+'</span>':''))+(t.fromInst?'<span class="inst-pill-tag">'+instSpendName(t)+'</span>':'')+(isSplitMember?'<span class="split-pill">Split</span>':'')+
    '</div><div class="tx-sub">'+(t.category||"").replace(/^\S+\s/,"")+" · "+d.getDate()+" "+MO[d.getMonth()]+" "+d.getFullYear()+
    '</div></div><span class="tx-amt '+amtClass+'" style="margin-right:8px">'+amtPrefix+fmt(t.amount)+
    '</span><button class="hist-tx-edit" onclick="openEditTxModal('+t.id+')" aria-label="Edit">'+EDIT_PENCIL+'</button></div>' +
  '</div>';
}
function histSplitCard(members) {
  const m0 = members[0], isInc = m0.type==="Income", d=parseDate(m0.date), desc=m0.desc||m0.description||"";
  const total = members.reduce((s,m)=>s+m.amount,0);
  const breakdown = members.map(m =>
    '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:var(--slate-500)">' +
      '<span>'+(m.category||"")+'</span><span>'+(isInc?"+":"-")+fmt(m.amount)+'</span></div>'
  ).join("");
  return '<div class="hist-split-card">' +
    '<div style="display:flex;align-items:center;gap:10px">' +
      '<div class="tx-icon">🧾</div>' +
      '<div style="flex:1;min-width:0"><div class="tx-name">'+desc+'<span class="split-pill">Split · '+members.length+'</span></div>' +
      '<div class="tx-sub">'+d.getDate()+" "+MO[d.getMonth()]+" "+d.getFullYear()+'</div></div>' +
      '<span class="tx-amt '+(isInc?'pos':'neg')+'" style="margin-right:6px">'+(isInc?"+":"-")+fmt(total)+'</span>' +
      '<button class="rec-edit-btn" style="margin-right:2px" onclick="openEditSplit(\''+m0.splitId+'\')" aria-label="Edit split">'+EDIT_PENCIL+'</button>' +
      '<button class="hist-split-del" onclick="deleteSplitGroup(\''+m0.splitId+'\')" aria-label="Delete split"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
    '</div>' +
    '<div style="margin:8px 0 0 46px;border-top:0.5px solid var(--slate-100);padding-top:6px">'+breakdown+'</div>' +
  '</div>';
}

async function refreshApp() {
  const icon=document.querySelector("#refresh-btn i"); if(icon)icon.classList.add("spin");
  showToast("Refreshing…");
  const [txOk,budgetOk,recOk,instOk,goalOk]=await Promise.all([fetchFromSheets(true),fetchBudgetsFromSheets(true),fetchRecurringFromSheets(true),fetchInstallmentsFromSheets(true),fetchGoalsFromSheets(true),fetchEstBillsFromSheets(true)]);
  if(icon)icon.classList.remove("spin"); renderHome(); renderAnalytics();
  if (document.getElementById("page-installments")?.classList.contains("active")) renderInstallments();
  if (document.getElementById("page-goals")?.classList.contains("active")) renderGoals();
  if (document.getElementById("page-estbills")?.classList.contains("active")) { try { renderEstBillsPage(); } catch(e) { console.warn("renderEstBillsPage:", e); } }
  if(txOk||budgetOk||recOk||instOk||goalOk)showToast("Refreshed ✓"); else showToast("Up to date ✓");
}

let editGoalIdx = -1;
function openEditGoalModal(idx) {
  editGoalIdx=idx; const g=GOALS[idx];
  document.getElementById("eg-name").value=(g.icon&&g.icon!=="🎯"?g.icon+" ":"")+g.name;
  document.getElementById("eg-target").value=g.target||""; document.getElementById("eg-saved").value=g.saved||""; document.getElementById("eg-monthly").value=g.monthly||"";
  const now=new Date(),cy=now.getFullYear(); buildMonthSelect("eg-due-m",1); buildYearSelect("eg-due-y",cy,0,5);
  if(g.due&&g.due!=="—"){const parts=g.due.split(" ");if(parts.length===2){const mIdx=MO.indexOf(parts[0])+1,y=parseInt(parts[1]),mSel=document.getElementById("eg-due-m"),ySel=document.getElementById("eg-due-y");for(let i=0;i<mSel.options.length;i++)if(parseInt(mSel.options[i].value)===mIdx){mSel.selectedIndex=i;break;}for(let i=0;i<ySel.options.length;i++)if(parseInt(ySel.options[i].value)===y){ySel.selectedIndex=i;break;}}}
  const colorVal=g.color+","+(g.bg||"var(--slate-100)"),cSel=document.getElementById("eg-color");
  for(let i=0;i<cSel.options.length;i++)if(cSel.options[i].value===colorVal){cSel.selectedIndex=i;break;}
  const egCatSel=document.getElementById("eg-category");
  catBuildList("eg-category", EXPENSE_CATS);
  const goalCat=GOALS[editGoalIdx].category||"";
  catSetValue("eg-category", goalCat);
  sddEnhance("eg-due-m",{flex:"1.4"}); sddEnhance("eg-due-y",{flex:"1.2"});
  sddEnhance("eg-color",{swatch:true,up:true});
  nkpBind();
  document.getElementById("modal-edit-goal").classList.remove("hidden"); setTimeout(()=>document.getElementById("eg-name").focus(),150);
}
async function confirmEditGoal() {
  if(editGoalIdx<0)return;
  const egCat=document.getElementById("eg-category").value||"💰 Other";
  const name=document.getElementById("eg-name").value.trim(),target=parseFloat(document.getElementById("eg-target").value)||0,saved=parseFloat(document.getElementById("eg-saved").value)||0,monthly=parseFloat(document.getElementById("eg-monthly").value)||0,due=safeDate(getMonthVal("eg-due-m","eg-due-y")),colorVal=document.getElementById("eg-color").value.split(",");
  if(!name){showToast("Enter a goal name");return;} if(!target||target<=0){showToast("Enter a target amount");return;}
  const oldGoal={...GOALS[editGoalIdx]},icon=name.match(/^\p{Emoji}/u)?.[0]||oldGoal.icon||"🎯",cleanName=name.replace(/^\p{Emoji}\s*/u,"");
  GOALS[editGoalIdx]={...oldGoal,icon,name:cleanName,target,saved,monthly,due,color:colorVal[0],bg:colorVal[1]||"var(--slate-100)",category:egCat,spends:oldGoal.spends||[]};
  saveGoals(); closeModal("edit-goal"); renderGoals(); showToast("Goal updated ✓");
  if(settings.sheetsUrl){setSyncStatus("syncing");const ok=await Promise.race([postToSheets("update_goal",{oldName:oldGoal.name,data:{name:icon+" "+cleanName,target,saved,monthly,due,color:colorVal[0]}}),new Promise(r=>setTimeout(()=>r(false),6000))]);if(ok){setSyncStatus("ok");showToast("Goal updated + synced ✓");}else{setSyncStatus("error");showToast("Updated locally — Sheets sync failed");}}
}

let editInstIdx = -1;
function openEditInstModal(idx) {
  editInstIdx=idx; const p=INSTALLMENTS[idx];
  document.getElementById("ei-name").value=(p.icon&&p.icon!=="📦"?p.icon+" ":"")+p.name;
  catBuildList("ei-category", EXPENSE_CATS);
  catSetValue("ei-category", p.cat);
  document.getElementById("ei-total").value=p.total||""; document.getElementById("ei-monthly").value=p.monthly||""; document.getElementById("ei-total-mo").value=p.total_mo||""; document.getElementById("ei-paid").value=p.paid||0;
  const now=new Date(); let sd=p.startDate?parseDate(p.startDate):now; if(isNaN(sd))sd=now;
  buildDaySelect("ei-start-d",sd.getDate()); buildMonthSelect("ei-start-m",sd.getMonth()+1); buildYearSelect("ei-start-y",sd.getFullYear(),2,1);
  sddEnhance("ei-start-d",{flex:"1"}); sddEnhance("ei-start-m",{flex:"1.4"}); sddEnhance("ei-start-y",{flex:"1.2"});
  const colorSel=document.getElementById("ei-color"); for(let i=0;i<colorSel.options.length;i++)if(colorSel.options[i].value===p.color){colorSel.selectedIndex=i;break;}
  sddEnhance("ei-color",{swatch:true,up:true});
  nkpBind();
  document.getElementById("modal-edit-inst").classList.remove("hidden"); setTimeout(()=>document.getElementById("ei-name").focus(),150);
}
async function confirmEditInst() {
  if(editInstIdx<0)return;
  const name=document.getElementById("ei-name").value.trim(),total=parseFloat(document.getElementById("ei-total").value)||0,monthly=parseFloat(document.getElementById("ei-monthly").value)||0,totalMo=parseInt(document.getElementById("ei-total-mo").value)||0,paid=parseInt(document.getElementById("ei-paid").value)||0,cat=document.getElementById("ei-category").value,color=document.getElementById("ei-color").value;
  const startDate=getDateVal("ei-start-d","ei-start-m","ei-start-y");
  if(!name){showToast("Enter an item name");return;} if(!total||total<=0){showToast("Enter a total amount");return;} if(!monthly||monthly<=0){showToast("Enter monthly payment");return;} if(!totalMo||totalMo<=0){showToast("Enter total months");return;}
  const oldInst={...INSTALLMENTS[editInstIdx]},icon=name.match(/^\p{Emoji}/u)?.[0]||oldInst.icon||"📦",cleanName=name.replace(/^\p{Emoji}\s*/u,"");
  INSTALLMENTS[editInstIdx]={...oldInst,icon,name:cleanName,cat,total,monthly,total_mo:totalMo,paid:Math.min(paid,totalMo),color,startDate};
  saveInsts(); closeModal("edit-inst"); renderInstallments(); showToast("Instalment updated ✓");
  if(settings.sheetsUrl){setSyncStatus("syncing");const ok=await Promise.race([postToSheets("update_installment",{oldName:oldInst.name,data:{name:icon+" "+cleanName,category:cat,total,monthly,startDate,totalMonths:totalMo,monthsPaid:Math.min(paid,totalMo),color}}),new Promise(r=>setTimeout(()=>r(false),6000))]);if(ok){setSyncStatus("ok");showToast("Instalment updated + synced ✓");}else{setSyncStatus("error");showToast("Updated locally — Sheets sync failed");}}
}

let editTxId = null, editTxType = "Expense";
function setEditType(type) {
  editTxType=type; const expBtn=document.getElementById("edit-btn-expense"),incBtn=document.getElementById("edit-btn-income");
  if(type==="Expense"){expBtn.style.background="var(--white)";expBtn.style.color="var(--red)";expBtn.style.boxShadow="0 1px 4px rgba(0,0,0,0.08)";incBtn.style.background="none";incBtn.style.color="var(--slate-400)";incBtn.style.boxShadow="none";}
  else{incBtn.style.background="var(--white)";incBtn.style.color="var(--green)";incBtn.style.boxShadow="0 1px 4px rgba(0,0,0,0.08)";expBtn.style.background="none";expBtn.style.color="var(--slate-400)";expBtn.style.boxShadow="none";}
  const cats=type==="Income"?INCOME_CATS:EXPENSE_CATS; catBuildList("edit-category", cats);
}
function openEditTxModal(id) {
  const tx=txs.find(t=>t.id===id); if(!tx)return;
  editTxId=id; editTxType=tx.type||"Expense"; setEditType(editTxType);
  document.getElementById("edit-amount").value=tx.amount||"";
  catSetValue("edit-category", tx.category);
  document.getElementById("edit-desc").value=tx.desc||tx.description||""; document.getElementById("edit-notes").value=tx.notes||"";
  const now=new Date(),cy=now.getFullYear(); buildDaySelect("edit-date-d",1); buildMonthSelect("edit-date-m",1); buildYearSelect("edit-date-y",cy,3,0);
  if(tx.date){const parts=tx.date.split("-");if(parts.length===3){const y=parseInt(parts[0]),m=parseInt(parts[1]),d=parseInt(parts[2]),dSel=document.getElementById("edit-date-d"),mSel=document.getElementById("edit-date-m"),ySel=document.getElementById("edit-date-y");for(let i=0;i<dSel.options.length;i++)if(parseInt(dSel.options[i].value)===d){dSel.selectedIndex=i;break;}for(let i=0;i<mSel.options.length;i++)if(parseInt(mSel.options[i].value)===m){mSel.selectedIndex=i;break;}for(let i=0;i<ySel.options.length;i++)if(parseInt(ySel.options[i].value)===y){ySel.selectedIndex=i;break;}}}
  sddEnhance("edit-date-d",{flex:"1"}); sddEnhance("edit-date-m",{flex:"1.4"}); sddEnhance("edit-date-y",{flex:"1.2"});
  nkpBind();
  document.getElementById("modal-edit-tx").classList.remove("hidden"); /* keypad field: no autofocus (avoids auto-opening keypad over the form) */
}
async function confirmEditTx() {
  if(!editTxId)return;
  const amount=parseFloat(document.getElementById("edit-amount").value),desc=document.getElementById("edit-desc").value.trim(),cat=document.getElementById("edit-category").value,notes=document.getElementById("edit-notes").value.trim(),date=getDateVal("edit-date-d","edit-date-m","edit-date-y");
  if(!amount||amount<=0){showToast("Enter a valid amount");return;} if(!desc){showToast("Enter a description");return;}
  const idx=txs.findIndex(t=>t.id===editTxId); if(idx<0){showToast("Transaction not found");return;}
  const oldTx={...txs[idx]}; txs[idx]={...oldTx,type:editTxType,category:cat,desc,amount,notes,date};
  saveTxs(); closeModal("edit-tx");
  try { renderHistory(); } catch(e) { console.warn("renderHistory:", e); }
  try { renderHome(); } catch(e) { console.warn("renderHome:", e); }
  showToast("Transaction updated ✓");
  if(settings.sheetsUrl){setSyncStatus("syncing");const res=await Promise.race([postToSheetsRaw("update_transaction",{rowId:oldTx.rowId,data:{oldDesc:oldTx.desc||oldTx.description||"",oldAmount:oldTx.amount,date,type:editTxType,category:cat,description:desc,amount,notes,fromGoal:oldTx.fromGoal,toGoal:oldTx.toGoal,goalId:oldTx.goalId,goalName:oldTx.goalName,splitId:oldTx.splitId}}),new Promise(r=>setTimeout(()=>r(null),15000))]);if(res&&!res.error){setSyncStatus("ok");delete pendingEdits[oldTx.rowId];savePendingEdits();showToast("Updated + synced to Sheets ✓");}else{setSyncStatus("error");if(oldTx.rowId){pendingEdits[oldTx.rowId]={type:editTxType,category:cat,desc,amount,notes,date};savePendingEdits();}showToast("Sync failed: "+(res&&res.error?res.error:"timeout")+" — edit saved locally");}}
}

async function deleteTx(id) {
  if(!(await appConfirm({title:"Delete this transaction?", okText:"Delete", danger:true})))return;
  await _doDeleteTx(id);
}
async function deleteTxSilent(id) {
  await _doDeleteTx(id);
}
async function _doDeleteTx(id) {
  const tx=txs.find(t=>t.id===id); txs=txs.filter(t=>t.id!==id); unsyncedIds=unsyncedIds.filter(uid=>uid!==id);
  if(tx&&tx.rowId){deletedRowIds.add(tx.rowId);saveDeletedRows();}
  localStorage.setItem("ft_unsynced",JSON.stringify(unsyncedIds)); saveTxs();
  try { renderHistory(); } catch(e) { console.warn("renderHistory:", e); }
  try { renderHome(); } catch(e) { console.warn("renderHome:", e); }
  if(tx&&settings.sheetsUrl){setSyncStatus("syncing");const ok=await Promise.race([postToSheets("delete_transaction",{rowId:tx.rowId,data:{date:tx.date,desc:tx.desc||tx.description||"",amount:tx.amount}}),new Promise(r=>setTimeout(()=>r(false),15000))]);if(ok){setSyncStatus("ok");deletedRowIds.delete(tx.rowId);saveDeletedRows();showToast("Transaction deleted + synced ✓");}else{setSyncStatus("error");showToast("Deleted locally — Sheets sync pending");}}
  else showToast("Transaction deleted");
}

function normalizeDate(raw) {
  if(!raw)return""; if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  const d=new Date(raw); if(!isNaN(d))return toDateStr(d); return raw;
}
// Single source of truth for turning a stored "YYYY-MM-DD" date string into a Date.
// Built from explicit Y/M/D components (not new Date(str), which parses as UTC
// midnight) so .getDate()/.getMonth()/.getFullYear() always reflect the intended
// calendar date, regardless of the viewer's timezone offset from UTC.
function parseDate(str) {
  if (!str) return new Date(NaN);
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(str);
}
// Inverse of parseDate — formats a Date using its LOCAL Y/M/D into "YYYY-MM-DD".
// Don't use date.toISOString().split("T")[0] for this: it converts through UTC,
// which silently rolls back to "yesterday" for part of the day in timezones
// ahead of UTC (e.g. Bangkok, UTC+7, for anything before ~7am local time).
function toDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// "YYYY-MM" key for a Date — used to track which calendar month an instalment's
// payment was last marked for, so Safe to Spend doesn't keep counting it as still due.
function ymOf(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function monthTxs(mo,yr) { const d=new Date(),m=(mo!==undefined)?mo:d.getMonth(),y=(yr!==undefined)?yr:d.getFullYear(); return txs.filter(t=>{const td=parseDate(t.date);return td.getMonth()===m&&td.getFullYear()===y;}); }
function yearTxs(yr) { return txs.filter(t=>{const td=parseDate(t.date);return td.getFullYear()===yr;}); }
function calcSummary(arr) { const inc=arr.filter(t=>t.type==="Income").reduce((s,t)=>s+t.amount,0),exp=arr.filter(t=>t.type==="Expense").reduce((s,t)=>s+t.amount,0); return {inc,exp,net:inc-exp,rate:inc>0?(inc-exp)/inc:0}; }