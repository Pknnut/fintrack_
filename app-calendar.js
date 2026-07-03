// FinTrack — Calendar page, Monthly report card, Add Recurring modal, Calendar search, keyboard delegation, edge swipe-back.
// ══ CALENDAR PAGE ════════════════════════════════════════════
let _calYear = new Date().getFullYear();
let _calMonth = new Date().getMonth();
let _calSelectedDate = null;

const MO_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function calChangePage(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  _calSelectedDate = null;
  renderCalendarPage();
}

function renderCalendarPage() {
  const yr = _calYear, mo = _calMonth;
  document.getElementById("cal-page-month-lbl").textContent = MO[mo] + " " + yr;

  // Build day → txs map
  const dayMap = {};
  txs.forEach(t => {
    const d = parseDate(t.date);
    if (d.getFullYear() !== yr || d.getMonth() !== mo) return;
    const key = d.getDate();
    if (!dayMap[key]) dayMap[key] = [];
    dayMap[key].push(t);
  });

  // Build day → upcoming instalments map ("forward-looking" only: today or later).
  // Instalments don't log transactions automatically, so this is the only place that shows them ahead of time.
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const ghostMap = {};
  INSTALLMENTS.forEach(p => {
    if (p.paid >= p.total_mo) return; // fully paid off — nothing upcoming
    const sd = p.startDate ? parseDate(p.startDate) : null;
    const dueDay = (sd && !isNaN(sd)) ? Math.min(sd.getDate(), new Date(yr, mo+1, 0).getDate()) : 1; // fallback to day 1 if no due date set
    const dueDate = new Date(yr, mo, dueDay);
    if (dueDate < today0) return; // only forward-looking — already-past due dates aren't ghosts
    if (!ghostMap[dueDay]) ghostMap[dueDay] = [];
    ghostMap[dueDay].push({icon:p.icon, name:p.name, amount:p.monthly});
  });
  const hasAnyGhost = Object.keys(ghostMap).length > 0;
  const legendEl = document.getElementById("cal-ghost-legend");
  if (legendEl) legendEl.style.display = hasAnyGhost ? "flex" : "none";

  // Summary
  const monthArr = txs.filter(t => { const d = parseDate(t.date); return d.getFullYear()===yr && d.getMonth()===mo; });
  const sumInc = monthArr.filter(t=>t.type==="Income").reduce((s,t)=>s+t.amount,0);
  const sumExp = monthArr.filter(t=>t.type==="Expense"&&!isGoalSpend(t)).reduce((s,t)=>s+t.amount,0);
  document.getElementById("cal-summ-inc").textContent = fmt(sumInc);
  document.getElementById("cal-summ-exp").textContent = fmt(sumExp);
  document.getElementById("cal-summ-count").textContent = monthArr.length;
  renderUpcomingRecurring(yr, mo);

  // Grid
  const grid = document.getElementById("cal-page-grid");
  grid.innerHTML = "";
  ["M","T","W","T","F","S","S"].forEach(d => {
    const el = document.createElement("div"); el.className = "cal-dow"; el.textContent = d; grid.appendChild(el);
  });
  const firstDay = new Date(yr, mo, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = new Date();
  const isThisMonth = today.getFullYear() === yr && today.getMonth() === mo;

  for (let i = 0; i < offset; i++) {
    const el = document.createElement("div"); el.className = "cal-cell"; grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dayTxs = dayMap[d] || [];
    const ghosts = ghostMap[d] || [];
    const el = document.createElement("div");
    const isSelected = _calSelectedDate === d;
    el.className = "cal-cell" + (dayTxs.length ? " has-tx" : "") + (ghosts.length && !dayTxs.length ? " ghost" : "") + (isSelected ? " selected" : "");

    const numEl = document.createElement("span");
    numEl.className = "cal-cell-num" + (isThisMonth && d === today.getDate() ? " cal-today" : "");
    numEl.textContent = d;
    el.appendChild(numEl);

    if (dayTxs.length) {
      const inc = dayTxs.filter(t=>t.type==="Income").reduce((s,t)=>s+t.amount,0);
      const exp = dayTxs.filter(t=>t.type==="Expense").reduce((s,t)=>s+t.amount,0);
      const net = inc - exp;
      const dotsEl = document.createElement("div"); dotsEl.className = "cal-cell-dots";
      if (exp > 0) { const dot = document.createElement("div"); dot.className="cal-cell-dot"; dot.style.background="var(--red-strong)"; dotsEl.appendChild(dot); }
      if (inc > 0) { const dot = document.createElement("div"); dot.className="cal-cell-dot"; dot.style.background="var(--green-strong)"; dotsEl.appendChild(dot); }
      el.appendChild(dotsEl);
      const netEl = document.createElement("div");
      netEl.className = "cal-cell-net";
      netEl.style.color = net >= 0 ? "var(--green-strong)" : "var(--red-strong)";
      netEl.textContent = (net >= 0 ? "+" : "-") + fmt(Math.abs(net), 0);
      el.appendChild(netEl);
      el.onclick = () => calSelectDay(d, dayTxs);
    } else if (ghosts.length) {
      const dot = document.createElement("div"); dot.className = "cal-cell-ghost-dot";
      el.appendChild(dot);
      el.onclick = () => calSelectGhostDay(d, ghosts);
    }
    grid.appendChild(el);
  }

  // Restore detail if day still selected
  if (_calSelectedDate && dayMap[_calSelectedDate]) {
    calRenderDetail(_calSelectedDate, dayMap[_calSelectedDate]);
  } else if (_calSelectedDate && ghostMap[_calSelectedDate]) {
    calRenderGhostDetail(_calSelectedDate, ghostMap[_calSelectedDate]);
  } else {
    document.getElementById("cal-detail").style.display = "none";
  }
}

// Recurring items have no specific day attached (they're logged whenever during the month),
// so — unlike instalments — they can't be placed on a calendar cell. Shown as a list instead.
// Only meaningful for the actual current month (pending status is always "this month, right now").
function renderUpcomingRecurring(yr, mo) {
  const el = document.getElementById("cal-upcoming-recurring");
  if (!el) return;
  const now = new Date();
  if (yr !== now.getFullYear() || mo !== now.getMonth()) { el.innerHTML = ""; return; }
  const pending = getPendingRecurring();
  if (!pending.length) { el.innerHTML = ""; return; }
  el.innerHTML = '<div class="cal-upcoming-card">' +
    '<div class="cal-upcoming-hd">Recurring not yet logged this month</div>' +
    pending.map(r => '<div class="cal-upcoming-row"><span>' + (r.desc||"") + '</span><span class="cal-upcoming-amt">' + fmt(r.amount) + '</span></div>').join("") +
  '</div>';
}

function calSelectGhostDay(d, ghosts) {
  if (_calSelectedDate === d) { _calSelectedDate = null; document.getElementById("cal-detail").style.display = "none"; renderCalendarPage(); return; }
  _calSelectedDate = d;
  renderCalendarPage();
  calRenderGhostDetail(d, ghosts);
}

// Upcoming-only day: nothing to delete (no transaction exists yet), just a preview of what's due.
function calRenderGhostDetail(d, ghosts) {
  const total = ghosts.reduce((s,g)=>s+g.amount, 0);
  document.getElementById("cal-detail-date").textContent = d + " " + MO[_calMonth] + " " + _calYear;
  const netEl = document.getElementById("cal-detail-net");
  netEl.textContent = "Upcoming";
  netEl.style.color = "var(--amber-strong, var(--amber-strong))";
  document.getElementById("cal-detail-body").innerHTML =
    '<div class="cal-grp-lbl">Expected — not logged yet</div>' +
    ghosts.map(g =>
      '<div class="cal-tx-row"><div class="cal-tx-icon" style="background:var(--amber-bg)">' + g.icon + '</div>' +
      '<div style="flex:1;min-width:0"><div class="cal-tx-desc">' + g.name + '</div><div class="cal-tx-cat">Instalment due</div></div>' +
      '<span class="cal-tx-amt" style="color:var(--slate-500)">' + fmt(g.amount) + '</span></div>'
    ).join("") +
    (ghosts.length > 1 ? '<div class="cal-grp-total" style="gap:6px"><span style="color:var(--slate-400);font-weight:500">Total due</span><span>' + fmt(total) + '</span></div>' : '');
  document.getElementById("cal-detail").style.display = "block";
}

function calSelectDay(d, dayTxs) {
  if (_calSelectedDate === d) {
    _calSelectedDate = null;
    document.getElementById("cal-detail").style.display = "none";
    renderCalendarPage();
    return;
  }
  _calSelectedDate = d;
  renderCalendarPage();
  calRenderDetail(d, dayTxs);
}

function calRenderDetail(d, dayTxs) {
  const inc = dayTxs.filter(t=>t.type==="Income").reduce((s,t)=>s+t.amount,0);
  const exp = dayTxs.filter(t=>t.type==="Expense").reduce((s,t)=>s+t.amount,0);
  const net = inc - exp;
  document.getElementById("cal-detail-date").textContent = d + " " + MO[_calMonth] + " " + _calYear;
  const netEl = document.getElementById("cal-detail-net");
  netEl.textContent = (net >= 0 ? "+" : "-") + fmt(Math.abs(net));
  netEl.style.color = net >= 0 ? "var(--green-strong)" : "var(--red-strong)";

  const incTxs = dayTxs.filter(t=>t.type==="Income");
  const expTxs = dayTxs.filter(t=>t.type==="Expense");

  function txSwipeRow(t, isInc) {
    const catName = (t.category||"").replace(/^\S+\s/,"");
    const bg = CAT_BG[catName] || (isInc ? "var(--tint-green-bg)" : "var(--slate-50)");
    return '<div class="swipe-container cal-swipe-container" data-id="' + t.id + '" style="margin-bottom:0">' +
      '<div class="swipe-del-bg" style="border-radius:0"><i class="ti ti-trash" style="font-size:20px;color:var(--red)"></i></div>' +
      '<div class="cal-tx-row hist-tx-row" style="border-radius:0;border:none;margin-bottom:0;background:var(--white)">' +
        '<div class="cal-tx-icon" style="background:' + bg + '">' + (t.category||"").match(/^\S+/)?.[0] + '</div>' +
        '<div style="flex:1;min-width:0"><div class="cal-tx-desc">' + (t.desc||t.description||"") + '</div><div class="cal-tx-cat">' + catName + '</div></div>' +
        '<span class="cal-tx-amt" style="color:' + (isInc?"var(--green-strong)":"var(--red-strong)") + '">' + (isInc?"+":"-") + fmt(t.amount) + '</span>' +
      '</div>' +
    '</div>';
  }

  let html = "";
  if (incTxs.length) {
    html += '<div class="cal-grp-lbl">Income</div>';
    incTxs.forEach(t => { html += txSwipeRow(t, true); });
  }
  if (expTxs.length) {
    html += '<div class="cal-grp-lbl">Expenses</div>';
    expTxs.forEach(t => { html += txSwipeRow(t, false); });
  }
  document.getElementById("cal-detail-body").innerHTML = html;
  document.getElementById("cal-detail").style.display = "block";
  initCalSwipeToDelete();
}

function initCalSwipeToDelete() {
  initSwipeRows('.cal-swipe-container', id => {
    deleteTx(id);
    const remaining = txs.filter(t => { const dt=parseDate(t.date); return dt.getFullYear()===_calYear && dt.getMonth()===_calMonth && dt.getDate()===_calSelectedDate; });
    if (remaining.length) calRenderDetail(_calSelectedDate, remaining);
    else { document.getElementById("cal-detail").style.display="none"; _calSelectedDate=null; }
    renderCalendarPage();
  });
}

// ══ MONTHLY REPORT CARD ══════════════════════════════════════
function showMonthlyReport() {
  const mo = analyticsMonth, yr = analyticsYear;
  const arr = monthTxs(mo, yr).filter(t => !isGoalSpend(t));
  const incTxs = arr.filter(t => t.type === "Income");
  const expTxs = arr.filter(t => t.type === "Expense");
  const inc = incTxs.reduce((s,t) => s+t.amount, 0);
  const exp = expTxs.reduce((s,t) => s+t.amount, 0);
  const net = inc - exp;
  const rate = inc > 0 ? Math.round((net/inc)*100) : 0;

  // Top category
  const catMap = {};
  expTxs.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
  const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
  const topCatName = topCat ? topCat[0].replace(/^\S+\s/,"") : "—";
  const topCatPct  = topCat && exp > 0 ? Math.round((topCat[1]/exp)*100) : 0;

  // Biggest transactions
  const bigInc = incTxs.sort((a,b)=>b.amount-a.amount)[0];
  const bigExp = expTxs.sort((a,b)=>b.amount-a.amount)[0];

  const card = document.getElementById("report-card-inner");
  if (card) {
    card.classList.remove("rc-dark", "rc-light");
    card.classList.add(settings.darkMode ? "rc-dark" : "rc-light");
  }
  document.getElementById("report-period").textContent = MO[mo] + " " + yr;
  const netEl = document.getElementById("report-net-amt");
  netEl.textContent = (net >= 0 ? "+" : "-") + fmt(Math.abs(net), 0);
  netEl.style.color = net >= 0 ? "var(--teal)" : "var(--red)";
  document.getElementById("report-inc").textContent = fmt(inc);
  document.getElementById("report-inc-sub").textContent = incTxs.length + " source" + (incTxs.length!==1?"s":"");
  document.getElementById("report-exp").textContent = fmt(exp);
  document.getElementById("report-exp-sub").textContent = expTxs.length + " transaction" + (expTxs.length!==1?"s":"");
  document.getElementById("report-rate").textContent = rate + "%";
  document.getElementById("report-rate2").textContent = rate + "%";
  document.getElementById("report-top-cat").textContent = topCatName;
  document.getElementById("report-top-cat-sub").textContent = topCat ? fmt(topCat[1]) + " · " + topCatPct + "%" : "—";
  document.getElementById("report-big-inc").textContent = bigInc ? (bigInc.desc||"") + " · " + fmt(bigInc.amount) : "—";
  document.getElementById("report-big-exp").textContent = bigExp ? (bigExp.desc||"") + " · " + fmt(bigExp.amount) : "—";
  document.getElementById("report-bar").style.width = Math.min(rate, 100) + "%";
  openModal("report");
}

async function saveReportImage() {
  const card = document.getElementById("report-card-inner");
  if (!card || typeof html2canvas === "undefined") { showToast("Saving not available"); return; }
  showToast("Generating image…");
  try {
    const canvas = await html2canvas(card, { backgroundColor: "var(--slate-900)", scale: 2, logging: false, useCORS: true });
    const a = document.createElement("a");
    const mo = analyticsMonth, yr = analyticsYear;
    a.download = "fintrack-report-" + MO[mo].toLowerCase() + "-" + yr + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
    showToast("Report saved ✓");
  } catch(e) { showToast("Could not save image"); }
}

// ══ NATIVE-SELECT ENHANCER ═══════════════════════════════════
// Wraps a native <select> with a styled overlay (matching the app theme) while keeping the
// real <select> as the value source, so existing .value reads/writes keep working. Call
// sddEnhance(id) once; call sddSync(id) after rebuilding the select's <option>s dynamically.

// ══ TEXT DROPDOWN (plain-text filter selects) ════════════════

// ══ CUSTOM DROPDOWN (category selects) ═══════════════════════
// IDs that use the custom dropdown

// Close all dropdowns when clicking outside

// ══ ADD RECURRING MODAL ═════════════════════════════════════
let _recAddType = "Expense";
let _recAddEditIdx = -1;

function _recSetModalMode(isEdit) {
  const titleEl = document.querySelector("#modal-add-recurring .modal-title");
  const subEl   = document.querySelector("#modal-add-recurring .modal-sub");
  const btnEl   = document.getElementById("rec-add-confirm-btn");
  if (titleEl) titleEl.textContent = isEdit ? "Edit recurring" : "Add recurring";
  if (subEl)   subEl.textContent   = isEdit ? "Update this recurring item" : "This will appear on your recurring list every month";
  if (btnEl)   btnEl.textContent   = isEdit ? "Save changes" : "Add recurring";
}

function openAddRecurringModal() {
  _recAddEditIdx = -1;
  _recAddType = "Expense";
  setRecAddType("Expense");
  document.getElementById("rec-add-desc").value = "";
  document.getElementById("rec-add-amount").value = "";
  document.getElementById("rec-add-notes").value = "";
  _recSetModalMode(false);
  openModal("add-recurring");
  nkpBind();
}

function openEditRecurringModal(idx) {
  const r = RECURRING[idx];
  if (!r) return;
  _recAddEditIdx = idx;
  setRecAddType(r.type || "Expense");          // builds the category list for this type
  catSetValue("rec-add-cat", r.category);       // then select the item's category
  document.getElementById("rec-add-desc").value   = r.desc || "";
  document.getElementById("rec-add-amount").value = r.amount || "";
  document.getElementById("rec-add-notes").value  = r.notes || "";
  _recSetModalMode(true);
  openModal("add-recurring");
  nkpBind();
}

function setRecAddType(type) {
  _recAddType = type;
  const expBtn = document.getElementById("rec-add-type-expense");
  const incBtn = document.getElementById("rec-add-type-income");
  const confirmBtn = document.getElementById("rec-add-confirm-btn");
  const cats = type === "Income" ? INCOME_CATS : EXPENSE_CATS;
  catBuildList("rec-add-cat", cats);
  if (type === "Expense") {
    expBtn.style.border = "2px solid var(--red)"; expBtn.style.background = "var(--red-bg)"; expBtn.style.color = "var(--red-text)";
    incBtn.style.border = "1.5px solid var(--slate-200)"; incBtn.style.background = "var(--white)"; incBtn.style.color = "var(--slate-400)";
    confirmBtn.style.background = "var(--teal)";
  } else {
    incBtn.style.border = "2px solid var(--green-strong)"; incBtn.style.background = "#f0fdf4"; incBtn.style.color = "var(--green-text)";
    expBtn.style.border = "1.5px solid var(--slate-200)"; expBtn.style.background = "var(--white)"; expBtn.style.color = "var(--slate-400)";
    confirmBtn.style.background = "var(--green-strong)";
  }
}

function confirmAddRecurring() {
  const desc   = document.getElementById("rec-add-desc").value.trim();
  const amount = parseFloat(document.getElementById("rec-add-amount").value);
  const cat    = document.getElementById("rec-add-cat").value;
  const notes  = document.getElementById("rec-add-notes").value.trim();
  if (!desc)            { showToast("Enter a description"); return; }
  if (!amount || amount <= 0) { showToast("Enter a valid amount"); return; }
  const entry = { desc, category: cat, amount, type: _recAddType, notes };
  // Guard: if the stored edit index is out of bounds (stale from a cancelled edit),
  // treat it as a new add rather than writing to a non-existent slot.
  const isEdit = _recAddEditIdx >= 0 && _recAddEditIdx < RECURRING.length;
  if (isEdit) {
    RECURRING[_recAddEditIdx] = entry;
    _recAddEditIdx = -1;
  } else {
    const existing = RECURRING.findIndex(r => r.desc === desc && r.category === cat);
    if (existing >= 0) RECURRING[existing] = entry; else RECURRING.push(entry);
  }
  saveRecurring();
  closeModal("add-recurring");
  renderRecurringPage();
  showToast(isEdit ? "Recurring updated ✓" : "Added to recurring ✓");
  if (settings.sheetsUrl && settings.autosync) postToSheets("save_recurring", { recurring: RECURRING });
}

// ══ CALENDAR SEARCH ══════════════════════════════════════════
function calOnSearch() {
  const q = (document.getElementById("cal-search").value || "").toLowerCase().trim();
  const resultsEl = document.getElementById("cal-search-results");
  const mainEl = document.getElementById("cal-main-content");
  if (!q) {
    resultsEl.style.display = "none";
    mainEl.style.display = "block";
    return;
  }
  mainEl.style.display = "none";
  resultsEl.style.display = "block";
  const matched = txs.filter(t => {
    const desc = String(t.desc || t.description || "").toLowerCase();
    const cat  = (t.category || "").toLowerCase();
    const notes = String(t.notes || "").toLowerCase();
    return desc.includes(q) || cat.includes(q) || notes.includes(q);
  }).sort((a, b) => parseDate(b.date) - parseDate(a.date));

  if (!matched.length) {
    resultsEl.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--slate-400)">No transactions found</div>';
    return;
  }

  let lastDate = "";
  let html = '<div style="padding:8px 14px 4px;font-size:11px;color:var(--slate-400)">' + matched.length + ' result' + (matched.length!==1?"s":"") + ' for "' + q + '"</div>';
  matched.forEach(t => {
    const dateStr = t.date || "";
    if (dateStr !== lastDate) {
      const d = parseDate(dateStr);
      const label = d.getDate() + " " + MO[d.getMonth()] + " " + d.getFullYear();
      html += '<div style="font-size:10px;font-weight:700;color:var(--slate-400);text-transform:uppercase;letter-spacing:0.06em;padding:8px 14px 2px">' + label + '</div>';
      lastDate = dateStr;
    }
    const catName = (t.category || "").replace(/^\S+\s/, "");
    const bg = CAT_BG[catName] || "var(--slate-50)";
    const isInc = t.type === "Income";
    html += '<div style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:0.5px solid var(--slate-100)">' +
      '<div style="width:28px;height:28px;border-radius:8px;background:' + bg + ';display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">' + (t.category||"").match(/^\S+/)?.[0] + '</div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--slate-800)">' + (t.desc||t.description||"") + '</div><div style="font-size:10px;color:var(--slate-400)">' + catName + '</div></div>' +
      '<span style="font-size:12px;font-weight:700;color:' + (isInc?"var(--green-strong)":"var(--red-strong)") + '">' + (isInc?"+":"-") + fmt(t.amount) + '</span>' +
    '</div>';
  });
  resultsEl.innerHTML = html;
}
// ══ NUMERIC KEYPAD (Option A) ════════════════════════════════
// Any <input inputmode="none"> opens the in-app keypad on focus.
// inputmode="none" stops the native keyboard; focus delegation
// (below) opens our sheet. All existing .value reads keep working.

// Lift the focused field above the keypad: translate the modal sheet up, or scroll the page.
let _nkpModalEl = null;

// Done button: if inline-editing a recurring amount, confirm it; otherwise just close.

// Delegation — open keypad whenever a no-keyboard input is tapped.
// inputmode="none" alone is unreliable on iOS Safari, so we also mark these
// inputs readonly (which guarantees no native keyboard) and open on click.

// One click handler drives everything. The keypad sheet is bottom-docked and never
// covers the form, so tapping a text field focuses it normally (native keyboard shows)
// and simply closes the keypad as a side effect.
document.addEventListener("click", e => {
  const nkpOv = document.getElementById("nkp-overlay");
  const tkbOv = document.getElementById("tkb-overlay");
  // taps inside either keyboard are handled by the keys themselves
  if (nkpOv && nkpOv.contains(e.target)) return;
  if (tkbOv && tkbOv.contains(e.target)) return;
  if (_nkpIsTarget(e.target)) { tkbClose(); nkpOpen(e.target); return; } // numeric field → keypad
  if (_tkbIsTarget(e.target)) { nkpClose(); tkbOpen(e.target); return; } // text field → keyboard
  // tapped elsewhere — close whichever keyboard is open
  if (nkpOv && nkpOv.classList.contains("open")) nkpClose();
  if (tkbOv && tkbOv.classList.contains("open")) tkbClose();
});

// Back-compat shims for older call sites — also (re)mark inputs readonly,
// so dynamically-rendered fields (e.g. recurring amount editor) are covered.

// ══ TEXT KEYBOARD (EN / TH) ══════════════════════════════════
// A custom on-screen keyboard for text fields, in the app's sheet style.
// English (QWERTY) + Thai (Kedmanee) layouts + a 123 symbol layer, with a
// teal language-switch key. Replaces the native keyboard on all text inputs.

// Lift the focused field above the keyboard (mirror of nkpReveal)

// ── Shared focus state: active-field ring + blinking caret ──
let _kbRingEl = null, _kbCaretCanvas = null, _kbCaretScroll = null;

// Position the blinking caret at the END of the field's text (keyboards only insert at end).

// Add temporary bottom scroll-room so the active field can always lift above the keyboard,
// even when it sits near the bottom of the page (otherwise there's nothing below to scroll into).
let _kbScrollPadEl = null, _kbScrollPadPrev = "";

// Mark every text input to use the custom keyboard (skip numeric ones → numeric keypad).

// App-styled confirmation dialog (replaces native confirm()). Returns Promise<boolean>.

// ══ EDGE SWIPE-BACK ══════════════════════════════════════════
// Swipe right from the left edge to go back, on pages that have a back button.
// Starts only from the very left edge so it never clashes with row swipe-to-delete.
const SWIPE_BACK_PAGES = new Set(["history","budget","calendar","recurring","estbills","forecast","goals","installments","analytics","settings"]);
(function initSwipeBack() {
  let dragging = false, startX = 0, startY = 0, pageEl = null;
  const EDGE = 28, THRESHOLD = 80, MAX_PULL = 130;

  function cancel() {
    if (pageEl) { pageEl.style.transition = "transform 0.2s ease, opacity 0.2s ease"; pageEl.style.transform = ""; pageEl.style.opacity = ""; }
    dragging = false; pageEl = null;
  }

  document.addEventListener("touchstart", e => {
    // Don't intercept while a keyboard, modal or dialog is open
    if (document.querySelector(".modal-overlay:not(.hidden), .report-modal-overlay:not(.hidden), .confirm-overlay:not(.hidden), .nkp-overlay.open, .tkb-overlay.open")) return;
    const t = e.touches[0];
    if (t.clientX > EDGE) return;
    const ap = document.querySelector(".page.active");
    if (!ap || !SWIPE_BACK_PAGES.has(ap.id.replace("page-", ""))) return;
    dragging = true; pageEl = ap; startX = t.clientX; startY = t.clientY;
  }, {passive:true});

  document.addEventListener("touchmove", e => {
    if (!dragging) return;
    const t = e.touches[0], dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { cancel(); return; } // vertical scroll — let go
    if (dx > 0) {
      e.preventDefault(); // block native edge gesture + scroll during our drag
      const pull = Math.min(dx, MAX_PULL);
      pageEl.style.transition = "none";
      pageEl.style.transform = "translateX(" + pull + "px)";
      pageEl.style.opacity = String(1 - (pull / MAX_PULL) * 0.25);
    }
  }, {passive:false});

  document.addEventListener("touchend", e => {
    if (!dragging) return;
    const dx = e.changedTouches[0].clientX - startX;
    const el = pageEl;
    dragging = false; pageEl = null;
    if (el) { el.style.transition = "transform 0.2s ease, opacity 0.2s ease"; el.style.transform = ""; el.style.opacity = ""; }
    if (dx > THRESHOLD) goTo(_prevPage || "home");
  });
})();