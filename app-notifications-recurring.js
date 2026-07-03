// FinTrack — Goal contribution history, Goal spending, In-app notifications, Recurring transactions, Estimated Bills page.
// ══ GOAL CONTRIBUTION HISTORY ════════════════════════════════════
function toggleContribLog(idx) {
  const el  = document.getElementById("contrib-log-" + idx);
  const btn = document.getElementById("goal-hist-btn-" + idx);
  if (!el) return;
  const isOpen = el.style.maxHeight !== "0px" && el.style.maxHeight !== "";
  el.style.maxHeight = isOpen ? "0" : el.scrollHeight + "px";
  if (btn) btn.classList.toggle("open", !isOpen);
}

let editContribGoalIdx = -1, editContribIdx = -1;

function openEditContribModal(goalIdx, contribIdx) {
  editContribGoalIdx = goalIdx;
  editContribIdx     = contribIdx;
  const g = GOALS[goalIdx];
  const c = (g.contributions||[])[contribIdx];
  if (!c) return;
  document.getElementById("edit-contrib-sub").textContent = "Editing contribution for " + g.name;
  document.getElementById("edit-contrib-amount").value = c.amount;
  document.getElementById("edit-contrib-note").value   = c.note || "";
  // Build date dropdowns, preselecting the contribution's existing date — routed
  // through the same parseDate() everything else uses, instead of a separate
  // split("-") + manual option-loop (see openEditTxModal for the same pattern).
  const today = new Date();
  const cd = c.date ? parseDate(c.date) : today, cdValid = !isNaN(cd);
  buildDaySelect("ec-date-d", cdValid ? cd.getDate() : today.getDate());
  buildMonthSelect("ec-date-m", cdValid ? cd.getMonth()+1 : today.getMonth()+1);
  buildYearSelect("ec-date-y", cdValid ? cd.getFullYear() : today.getFullYear(), 5, 1);
  sddEnhance("ec-date-d",{flex:"1",up:true}); sddEnhance("ec-date-m",{flex:"1.4",up:true}); sddEnhance("ec-date-y",{flex:"1.2",up:true});
  document.getElementById("modal-edit-contrib").classList.remove("hidden");
  nkpBind();
  /* keypad field: no autofocus (avoids auto-opening keypad over the form) */
}

async function confirmEditContrib() {
  if (editContribGoalIdx < 0 || editContribIdx < 0) return;
  const g       = GOALS[editContribGoalIdx];
  const contribs = g.contributions || [];
  const old     = contribs[editContribIdx];
  if (!old) return;
  const newAmount = parseFloat(document.getElementById("edit-contrib-amount").value) || 0;
  const newNote   = document.getElementById("edit-contrib-note").value.trim();
  const newDate   = getDateVal("ec-date-d","ec-date-m","ec-date-y") || old.date;
  if (newAmount <= 0) { showToast("Enter a valid amount"); return; }
  // Adjust saved total by difference
  contribs[editContribIdx] = { ...old, amount: newAmount, note: newNote, date: newDate };
  g.contributions = contribs;
  recalcGoalSaved(g);
  saveGoals();
  // Keep the linked transaction in sync with the edit — without this, History
  // and Sheets would keep showing the OLD amount/date forever after an edit,
  // even though the goal's saved total already reflects the new one.
  if (old.txId) {
    const idx = txs.findIndex(t => t.id === old.txId);
    if (idx >= 0) {
      const oldTx = { ...txs[idx] };
      txs[idx] = { ...oldTx, amount: newAmount, date: newDate, notes: newNote };
      saveTxs();
      try { renderHistory(); } catch(e) { console.warn("renderHistory:", e); }
      if (settings.sheetsUrl) {
        setSyncStatus("syncing");
        const res = await Promise.race([postToSheetsRaw("update_transaction",{rowId:oldTx.rowId,data:{oldDesc:oldTx.desc||oldTx.description||"",oldAmount:oldTx.amount,date:newDate,type:oldTx.type,category:oldTx.category,description:oldTx.desc,amount:newAmount,notes:newNote,fromGoal:oldTx.fromGoal,toGoal:oldTx.toGoal,goalId:oldTx.goalId,goalName:oldTx.goalName}}),new Promise(r=>setTimeout(()=>r(null),15000))]);
        setSyncStatus(res && !res.error ? "ok" : "error");
      }
    }
  }
  closeModal("edit-contrib");
  editContribGoalIdx = -1; editContribIdx = -1;
  renderGoals();
  showToast("Contribution updated ✓");
}

async function deleteGoalContrib(goalIdx, contribIdx) {
  if (!(await appConfirm({title:"Remove this contribution?", okText:"Remove", danger:true}))) return;
  const g = GOALS[goalIdx];
  if (!g.contributions || !g.contributions[contribIdx]) return;
  const removed = g.contributions[contribIdx];
  g.contributions.splice(contribIdx, 1);
  recalcGoalSaved(g);
  saveGoals(); renderGoals();
  // Remove the linked transaction too (both locally and from Sheets) — reusing
  // the same delete+sync logic as a normal History delete, rather than just
  // splicing txs directly, so it correctly handles the rowId/deletedRowIds
  // bookkeeping and doesn't leave the row behind in the sheet.
  // Older/reset contributions (pre-dating this fix, or a goal pulled from
  // Sheets before it) can be missing txId — fall back to matching by goal +
  // amount + date so the transaction still gets removed instead of orphaned,
  // but only when the match is unambiguous.
  let linkedTx = removed.txId ? txs.find(t => t.id === removed.txId) : null;
  if (!linkedTx) {
    const candidates = txs.filter(t => t.type === "Expense" && t.toGoal === true && t.goalName === g.name && t.amount === removed.amount && t.date === removed.date);
    if (candidates.length === 1) linkedTx = candidates[0];
  }
  if (linkedTx) await _doDeleteTx(linkedTx.id);
  showToast("Contribution removed — " + fmt(removed.amount) + " deducted from saved total");
}

// ══ GOAL SPENDING ═══════════════════════════════════════════════
let spendGoalIdx = -1;

function openSpendGoalModal(idx) {
  spendGoalIdx = idx;
  const g = GOALS[idx];
  const spends = g.spends || [];
  const totalSpent = spends.reduce((s,sp)=>s+sp.amount, 0);
  const remaining = g.saved - totalSpent;
  document.getElementById("spend-goal-title").textContent = "Spend from " + g.name;
  document.getElementById("spend-goal-sub").textContent = (g.category||"") + " · " + fmt(Math.max(remaining,0)) + " remaining";
  document.getElementById("spend-goal-amount").value = "";
  document.getElementById("spend-goal-desc").value = "";
  const today = new Date();
  buildDaySelect("sg-date-d", today.getDate());
  buildMonthSelect("sg-date-m", today.getMonth()+1);
  buildYearSelect("sg-date-y", today.getFullYear(), 2, 1);
  sddEnhance("sg-date-d",{flex:"1",up:true}); sddEnhance("sg-date-m",{flex:"1.4",up:true}); sddEnhance("sg-date-y",{flex:"1.2",up:true});
  document.getElementById("modal-spend-goal").classList.remove("hidden");
  nkpBind();
  /* keypad field: no autofocus (avoids auto-opening keypad over the form) */
}

async function confirmSpendGoal() {
  if (spendGoalIdx < 0) return;
  const g = GOALS[spendGoalIdx];
  const amount = parseFloat(document.getElementById("spend-goal-amount").value) || 0;
  const desc   = document.getElementById("spend-goal-desc").value.trim() || "Spend from goal";
  const date   = getDateVal("sg-date-d","sg-date-m","sg-date-y") || toDateStr(new Date());
  if (!amount || amount <= 0) { showToast("Enter an amount"); return; }

  // Create the tagged transaction first so the spend-log entry can point at its id.
  const txId = Date.now();
  if (!g.spends) g.spends = [];
  const spendEntry = { id: txId, amount, desc, date };
  g.spends.push(spendEntry);
  recalcGoalSaved(g);
  saveGoals();

  const tx = {
    id: txId,
    date,
    type: "Expense",
    category: g.category || "💰 Other",
    desc,
    amount,
    notes: "",
    fromGoal: true,
    goalId: g.id,
    goalName: g.name
  };
  txs.push(tx); saveTxs();

  closeModal("spend-goal");
  spendGoalIdx = -1;
  renderGoals();
  // Home's Current Balance excludes goal-spends, but the card still needs a
  // re-render to reflect that — confirmAddSavings already does this, this path
  // was just missing it, which made Home look temporarily wrong until you
  // navigated away and back.
  renderHome();
  showToast("Spend recorded ✓");

  // Sync to Sheets
  if (settings.sheetsUrl && settings.autosync) {
    setSyncStatus("syncing");
    const ok = await Promise.race([
      postToSheets("add_transaction", { data: { ...tx } }),
      new Promise(r => setTimeout(()=>r(false), 6000))
    ]);
    if (ok) { setSyncStatus("ok"); } else { setSyncStatus("error"); }
  }
}

async function deleteGoalSpend(goalIdx, spendIdx) {
  if (!(await appConfirm({title:"Remove this spend entry?", okText:"Remove", danger:true}))) return;
  const g = GOALS[goalIdx];
  if (!g.spends) return;
  const spend = g.spends[spendIdx];
  // Remove from goal spends
  g.spends.splice(spendIdx, 1);
  recalcGoalSaved(g);
  saveGoals();
  // Remove the linked transaction (locally AND from Sheets) — this used to only
  // filter it out of the local txs array, which is why it vanished from History
  // but stayed in the sheet forever. _doDeleteTx handles the full delete+sync
  // (including rowId/deletedRowIds bookkeeping) the same way a normal History
  // delete does.
  if (spend && txs.some(t => t.id === spend.id)) {
    await _doDeleteTx(spend.id);
  }
  renderGoals();
  showToast("Spend removed ✓");
}

// ══ IN-APP NOTIFICATIONS ════════════════════════════════════════
function checkInAppNotifications() {
  try {
  const el = document.getElementById("notif-banners");
  if (!el) return;
  const banners = [];
  const now = new Date();
  const curMo = now.getMonth(), curYr = now.getFullYear();
  const dismissed = JSON.parse(sessionStorage.getItem("dismissed_notifs") || "[]");

  // Budget alerts (80% / 100%)
  if (settings.notifBudget && BUDGETS.length) {
    const monthArr = txs.filter(t => {
      const d = parseDate(t.date);
      return d.getMonth()===curMo && d.getFullYear()===curYr && t.type==="Expense" && !isGoalSpend(t);
    });
    BUDGETS.forEach(b => {
      const catName = b.cat.replace(/^\S+\s/, "");
      const spent = monthArr.filter(t=>(t.category||"").includes(catName)).reduce((s,t)=>s+t.amount,0);
      const pct = b.limit > 0 ? Math.round(spent/b.limit*100) : 0;
      const id = "budget_" + b.cat;
      if (pct >= 100 && !dismissed.includes(id+"_100")) {
        banners.push({id:id+"_100", type:"alert", icon:"ti-alert-triangle", iconBg:"var(--red-border)",
          title:"Over budget — " + b.cat.replace(/^\S+\s/,""),
          sub:"You've spent " + fmt(spent) + " of your " + fmt(b.limit) + " limit (" + pct + "%)"});
      } else if (pct >= 80 && !dismissed.includes(id+"_80")) {
        banners.push({id:id+"_80", type:"warn", icon:"ti-alert-triangle", iconBg:"var(--amber-border)",
          title:"Budget alert — " + b.cat.replace(/^\S+\s/,""),
          sub:"You've spent " + fmt(spent) + " of your " + fmt(b.limit) + " limit (" + pct + "%). " + fmt(b.limit - spent) + " remaining."});
      }
    });
  }

  // Log reminder — no tx in last 2 days
  if (settings.notifLog) {
    const id = "log_reminder";
    if (!dismissed.includes(id)) {
      const sortedTxs = txs.filter(t=>t.type==="Expense").map(t=>parseDate(t.date)).sort((a,b)=>b-a);
      const lastTx = sortedTxs[0];
      const daysSince = lastTx ? Math.floor((now - lastTx) / 86400000) : 999;
      if (daysSince >= 2) {
        banners.push({id, type:"warn", icon:"ti-clock", iconBg:"var(--amber-border)",
          title:"No expenses logged recently",
          sub:"It's been " + daysSince + " day" + (daysSince!==1?"s":"") + " since your last transaction. Don't forget to log your expenses."});
      }
    }
  }

  // Goal savings reminder + progress milestones
  if (settings.notifGoal && GOALS.length) {
    GOALS.forEach(g => {
      const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0;

      // 100% — goal reached
      if (pct >= 100) {
        const id = "goal_done_" + g.name;
        if (!dismissed.includes(id)) {
          banners.push({id, type:"alert", icon:"ti-trophy", iconBg:"var(--green-border)",
            title:"Goal reached! — " + g.name,
            sub:"You've hit your target of " + fmt(g.target) + ". Well done!"});
        }
        return;
      }

      // 75% milestone
      if (pct >= 75) {
        const id = "goal_75_" + g.name;
        if (!dismissed.includes(id)) {
          banners.push({id, type:"info", icon:"ti-flag", iconBg:"var(--green-border)",
            title:"75% there — " + g.name,
            sub:fmt(g.saved) + " of " + fmt(g.target) + " saved. " + fmt(g.target - g.saved) + " to go!"});
        }
      }

      // 50% milestone
      else if (pct >= 50) {
        const id = "goal_50_" + g.name;
        if (!dismissed.includes(id)) {
          banners.push({id, type:"info", icon:"ti-flag", iconBg:"var(--green-border)",
            title:"Halfway there — " + g.name,
            sub:fmt(g.saved) + " of " + fmt(g.target) + " saved. Keep it up!"});
        }
      }

      // No contribution this month reminder
      else {
        const id = "goal_" + g.name;
        if (!dismissed.includes(id)) {
          const contribs = g.contributions || [];
          const addedThisMonth = contribs.some(c => {
            const d = parseDate(c.date);
            return d.getMonth()===curMo && d.getFullYear()===curYr;
          });
          if (!addedThisMonth) {
            banners.push({id, type:"info", icon:"ti-flag", iconBg:"var(--green-border)",
              title:"Goal reminder — " + g.name,
              sub:"No savings added this month yet. Monthly target: " + fmt(g.monthly || 0) + "."});
          }
        }
      }
    });
  }

  if (!banners.length) { el.innerHTML = ""; return; }
  el.innerHTML = banners.map(b =>
    '<div class="notif-banner notif-' + b.type + '" id="notif-' + b.id + '">' +
      '<div class="notif-icon-wrap" style="background:' + b.iconBg + '">' +
        '<i class="ti ' + b.icon + '" style="font-size:14px" aria-hidden="true"></i>' +
      '</div>' +
      '<div class="notif-body">' +
        '<div class="notif-title">' + b.title + '</div>' +
        '<div class="notif-sub">' + b.sub + '</div>' +
      '</div>' +
      '<button class="notif-dismiss" onclick="dismissNotif(&quot;' + b.id + '&quot;)" aria-label="Dismiss">×</button>' +
    '</div>'
  ).join("");
  } catch(e) { console.warn("Notification check failed:", e); }
}

function dismissNotif(id) {
  const el = document.getElementById("notif-" + id);
  if (el) el.remove();
  const dismissed = JSON.parse(sessionStorage.getItem("dismissed_notifs") || "[]");
  dismissed.push(id);
  sessionStorage.setItem("dismissed_notifs", JSON.stringify(dismissed));
}

// ══ RECURRING TRANSACTIONS ═══════════════════════════════════
function toggleRecurring() {
  isRecurring = !isRecurring;
  const btn = document.getElementById("toggle-recurring");
  if (btn) btn.className = "toggle" + (isRecurring ? " on" : "");
}

function getPendingRecurring() {
  const loggedKeys = buildLoggedKeysThisMonth();
  return RECURRING.filter(r => !isLoggedThisMonth(loggedKeys, r.desc, r.type));
}

function checkRecurringSuggestions() {
  const banner = document.getElementById("recurring-banner");
  const sugEl  = document.getElementById("recurring-suggestions");
  if (!banner || !sugEl) return;
  // Only show banner on the 1st day of the month
  const now = new Date();
  if (now.getDate() !== 1 || !RECURRING.length) { banner.classList.remove("show"); return; }
  const due = getPendingRecurring();
  if (!due.length) { banner.classList.remove("show"); return; }
  const total = due.reduce((s, r) => s + (r.amount||0), 0);
  sugEl.innerHTML = due.map(r =>
    '<div class="recurring-item">' +
      '<div><div class="recurring-item-name">' + (r.desc||"") + '</div>' +
      '<div class="recurring-item-amt">' + (r.category||"").replace(/^\S+\s/,"") + ' · ' + fmt(r.amount) + '</div></div>' +
      '<button class="recurring-add-btn" onclick="addRecurringNow(' + JSON.stringify(r).replace(/"/g,"&quot;") + ')">+ Add</button>' +
    '</div>'
  ).join("") +
  '<div style="margin-top:8px;display:flex;gap:6px">' +
    '<button class="recurring-add-btn" style="flex:1;padding:6px 0" onclick="logAllRecurringFromBanner()">Log all · ' + fmt(total) + '</button>' +
    '<button onclick="dismissRecurringSuggestions()" style="font-size:10px;background:none;border:none;color:var(--indigo);cursor:pointer;padding:4px 8px">Dismiss</button>' +
  '</div>';
  banner.classList.add("show");
}

async function addRecurringNow(r, overrideAmt) {
  // Re-entrancy guard: the Log button had no disabled/loading state, so tapping it
  // multiple times while the first tap was still in flight (no visible feedback made
  // this easy to do by accident) pushed a separate local transaction per tap — the
  // "3 duplicate transactions" from 3 taps. Key it on desc+category so double-tapping
  // Log on the SAME item is blocked, but logging two different items stays independent.
  const guardKey = (r.type||"Expense") + "|" + (r.desc||"").toLowerCase() + "|" + (r.category||"");
  if (!window._recurringLogInFlight) window._recurringLogInFlight = new Set();
  if (window._recurringLogInFlight.has(guardKey)) { showToast("Already logging " + r.desc + "…"); return; }
  window._recurringLogInFlight.add(guardKey);
  try {
  const now = new Date();
  const date = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
  const amount = overrideAmt !== undefined ? overrideAmt : r.amount;
  const notes = r.notes ? r.notes + " · recurring" : "recurring";
  const tx = {id:Date.now(), date, type:r.type||"Expense", category:r.category, desc:r.desc, amount:amount, notes:notes};
  txs.push(tx); saveTxs();
  _loggedRecurringCache.add((tx.type||"Expense") + "|" + (tx.desc||"").toLowerCase());
  // These two used to run unguarded — if either threw, the whole function stopped right
  // here, before ever reaching the sync attempt below. That looked like "nothing happens
  // at all" (no toast, no sync, no error), because an unhandled throw inside an async
  // function just silently rejects the promise with nothing watching it. Guard each one
  // individually (same pattern as _doDeleteTx) so a render hiccup can never block syncing,
  // and surface the real error as a toast so it's visible without needing DevTools.
  try { checkRecurringSuggestions(); } catch(e) { console.warn("checkRecurringSuggestions:", e); showToast("Render error: " + e.message); }
  try { renderHome(); } catch(e) { console.warn("renderHome:", e); showToast("Render error: " + e.message); }
  // This used to show "Logged: X ✓" immediately, before the sync attempt even started,
  // and never followed up — so a silent sync failure looked identical to a success in
  // the UI. Now it waits for the real outcome and reports it honestly, same wording
  // pattern as the manual Add form, so a failure is never invisible again.
  if (settings.sheetsUrl && settings.autosync) {
    setSyncStatus("syncing");
    const res = await Promise.race([postToSheetsRaw("add_transaction",{data:{...tx}}), new Promise(r=>setTimeout(()=>r(null),6000))]);
    if (res && !res.error) {
      setSyncStatus("ok");
      // Backfill rowId so future deletes can find the right Sheets row.
      if (res.rowId) {
        const local = txs.find(t => t.id === tx.id);
        if (local) { local.rowId = res.rowId; saveTxs(); }
      }
      showToast("Logged + synced: " + r.desc + " ✓");
    } else {
      setSyncStatus("error");
      unsyncedIds.push(tx.id);
      localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds));
      showToast("Sync failed (" + (res && res.error ? res.error : "timeout") + ") — " + r.desc + " saved locally");
    }
  } else {
    showToast("Logged: " + r.desc + " ✓");
  }
  } catch(e) {
    // Last-resort net: whatever this catches is the real answer to "why did nothing
    // happen" — console.warn for anyone with DevTools access, plus a toast so it's
    // visible on-device without needing them.
    console.warn("addRecurringNow:", e);
    showToast("Error logging " + (r&&r.desc||"item") + ": " + e.message);
  } finally {
    window._recurringLogInFlight.delete(guardKey);
  }
}

async function logAllRecurringFromBanner() {
  const due = getPendingRecurring();
  if (!due.length) return;
  const ok = await bulkLogRecurring(due);
  dismissRecurringSuggestions();
  if (ok) showToast(due.length + " recurring items logged ✓");
}

function dismissRecurringSuggestions() {
  const banner = document.getElementById("recurring-banner");
  if (banner) banner.classList.remove("show");
}

function removeRecurring(desc, category) {
  RECURRING = RECURRING.filter(r => !(r.desc===desc && r.category===category));
  saveRecurring();
  showToast("Removed from recurring");
  checkRecurringSuggestions();
  renderRecurringPage();
}

async function removeRecurringByIdx(idx) {
  const r = RECURRING[idx];
  if (!r) return;
  if (!(await appConfirm({title:"Remove recurring item?", message:'"'+(r.desc||"This item")+'" will stop appearing on your recurring list.', okText:"Remove", danger:true}))) return;
  RECURRING.splice(idx, 1);
  saveRecurring();
  showToast("Removed from recurring");
  checkRecurringSuggestions();
  renderRecurringPage();
}

// ── Recurring Page ────────────────────────────────────────────
let _recEditIdx = null; // index of item currently being amount-edited
// Session cache of recurring items logged this month. Keyed as "type|desc_lower".
// Updated immediately when we log, so renderRecurringPage shows "Logged" right away
// regardless of any txs scanning issues.
const _loggedRecurringCache = new Set();

function renderRecurringPage() {
  try {
  const list = document.getElementById("rec-page-list");
  const pendingLabel = document.getElementById("rec-pending-label");
  const logAllBtn = document.getElementById("rec-log-all-btn");
  if (!list) return;
  if (!RECURRING.length) {
    list.innerHTML = '<div class="rec-empty">No recurring items yet.<br>Mark a transaction as recurring when adding it.</div>';
    if (pendingLabel) pendingLabel.textContent = "";
    if (logAllBtn) logAllBtn.disabled = true;
    return;
  }
  // Build logged-keys inline with null guard so corrupt txs entries never crash the render.
  const loggedKeys = new Set();
  try {
    const _n = new Date(), _mo = _n.getMonth(), _yr = _n.getFullYear();
    (Array.isArray(txs) ? txs : []).forEach(t => {
      if (!t || typeof t !== "object") return;
      const d = parseDate(t.date);
      if (d.getMonth() === _mo && d.getFullYear() === _yr)
        loggedKeys.add((t.type||"Expense") + "|" + String(t.desc||t.description||"").toLowerCase());
    });
  } catch(e) { console.warn("loggedKeys error:", e); }
  RECURRING = RECURRING.filter(r => r && typeof r === "object" && r.desc);
  const pending = RECURRING.filter(r => !isLoggedThisMonth(loggedKeys, r.desc, r.type)
                                      && !_loggedRecurringCache.has((r.type||"Expense") + "|" + (r.desc||"").toLowerCase()));
  const pendingTotal = pending.reduce((s, r) => s + (r.amount||0), 0);
  if (pendingLabel) pendingLabel.textContent = pending.length ? pending.length + " pending · " + fmt(pendingTotal) : "All logged this month ✓";
  if (logAllBtn) logAllBtn.disabled = pending.length === 0;
  list.innerHTML = RECURRING.map((r, idx) => {
      const isLogged = isLoggedThisMonth(loggedKeys, r.desc, r.type)
                    || _loggedRecurringCache.has((r.type||"Expense") + "|" + (r.desc||"").toLowerCase());
      const isIncome = (r.type||"Expense") === "Income";
      const isEditing = (_recEditIdx === idx);
      const catName = (r.category||"").replace(/^\S+\s/,"");
      const icon = (r.category||"").match(/^\S+/)?.[0] || (isIncome ? "💰" : "🔄");
      return '<div class="rec-page-item" id="rec-item-' + idx + '">' +
        '<div class="rec-page-icon' + (isIncome?" income":"") + '">' + icon + '</div>' +
        '<div class="rec-page-info">' +
          '<div class="rec-page-name">' + (r.desc||"") + '</div>' +
          '<div class="rec-page-cat">' + (r.category||"").replace(/^\S+\s/,"") + ' · monthly</div>' +
        '</div>' +
        '<div class="rec-page-right">' +
          (isEditing ?
            '<div class="rec-amt-edit-row">' +
              '<span style="font-size:12px;color:var(--slate-400)">฿</span>' +
              '<input class="rec-amt-input" id="rec-amt-input-' + idx + '" type="text" inputmode="none" readonly value="' + r.amount + '" />' +
              '<button class="rec-amt-confirm" onclick="confirmRecurringAmt(' + idx + ')" aria-label="confirm"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--white)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' +
              '<button class="rec-amt-cancel" onclick="cancelRecurringAmt()" aria-label="cancel"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>' +
            '<span class="rec-was-hint">was ' + fmt(r.amount) + '</span>'
          :
            '<span class="rec-amt-display' + (isIncome?" income":"") + '" onclick="editRecurringAmt(' + idx + ')" title="Tap to edit amount">' + fmt(r.amount) + '</span>' +
            (isLogged ?
              '<span class="rec-status-logged"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Logged</span>'
            :
              '<div style="display:flex;gap:5px;align-items:center">' +
                '<span class="rec-status-pending">Pending</span>' +
                '<button class="rec-log-btn" onclick="logRecurringItem(' + idx + ')">Log</button>' +
              '</div>'
            )
          ) +
        '</div>' +
        '<button class="rec-edit-btn" onclick="openEditRecurringModal(' + idx + ')" title="Edit">' + EDIT_PENCIL + '</button>' +
        '<button class="rec-del-btn" onclick="removeRecurringByIdx(' + idx + ')" title="Remove">×</button>' +
      '</div>';
    }).join("");
  } catch(e) {
    console.error("renderRecurringPage error:", e);
    RECURRING = RECURRING.filter(r => r && typeof r === "object" && r.desc);
    try { saveRecurring(); } catch(_) {}
    const _l = document.getElementById("rec-page-list");
    const _b = document.getElementById("rec-log-all-btn");
    const _p = document.getElementById("rec-pending-label");
    if (_l) _l.innerHTML = '<div class="rec-empty">Recurring list had an error — please re-add items using + Add.</div>';
    if (_p) _p.textContent = "";
    if (_b) _b.disabled = true;
  }
  // Open the keypad directly when editing (programmatic focus alone no longer opens it)
  if (_recEditIdx !== null) {
    const inp = document.getElementById("rec-amt-input-" + _recEditIdx);
    if (inp) { nkpBindRecInput(_recEditIdx); nkpOpen(inp); }
  }
}

function editRecurringAmt(idx) {
  _recEditIdx = idx;
  renderRecurringPage();
}

function cancelRecurringAmt() {
  _recEditIdx = null;
  renderRecurringPage();
}

function confirmRecurringAmt(idx) {
  const inp = document.getElementById("rec-amt-input-" + idx);
  if (!inp) return;
  const newAmt = parseFloat(inp.value);
  if (isNaN(newAmt) || newAmt <= 0) { showToast("Enter a valid amount"); return; }
  RECURRING[idx].amount = newAmt;
  saveRecurring();
  _recEditIdx = null;
  renderRecurringPage();
  showToast("Amount updated ✓");
}

async function logRecurringItem(idx) {
  const r = RECURRING[idx];
  if (!r) return;
  await addRecurringNow(r);
  renderRecurringPage();
}

async function bulkLogRecurring(items) {
  const now = new Date();
  const date = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
  const newTxs = items.map(r => ({
    id: Date.now() + Math.random(), date,
    type: r.type||"Expense", category: r.category,
    desc: r.desc, amount: r.amount, notes: r.notes ? r.notes + " · recurring" : "recurring"
  }));
  // Save all to localStorage first
  newTxs.forEach(tx => txs.push(tx));
  saveTxs();
  renderHome();
  // Push to Sheets as one bulk request
  if (settings.sheetsUrl && settings.autosync) {
    setSyncStatus("syncing");
    const ok = await Promise.race([
      postToSheets("add_transactions_bulk", { data: newTxs }),
      new Promise(res => setTimeout(() => res(false), 10000))
    ]);
    if (ok) {
      setSyncStatus("ok");
      return true;
    } else {
      setSyncStatus("error");
      // Mark as unsynced so manual push can catch them
      newTxs.forEach(tx => { if (!unsyncedIds.includes(tx.id)) unsyncedIds.push(tx.id); });
      localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds));
      showToast("Saved locally — sync when online");
      return false;
    }
  }
  return true; // no Sheets configured — local save above already succeeded, nothing to sync
}

async function logAllRecurring() {
  const due = getPendingRecurring();
  if (!due.length) return;
  const ok = await bulkLogRecurring(due);
  renderRecurringPage();
  if (ok) showToast(due.length + " items logged ✓");
}

// ── Estimated Bills Page ──────────────────────────────────────
let _estEditIdx = null;   // index of bill currently being amount-edited inline
let _estAddEditIdx = -1;  // index of bill being edited in the add/edit modal, -1 = adding new

// A bill only shows "since [month]" when its current amount was set before the
// forecast month (i.e. it's carrying forward unchanged) — if it was just set for
// next month specifically, that's the normal/expected state and doesn't need
// calling out.
function estSinceLabel(ym) {
  if (!ym || typeof ym !== "string") return "";
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth()+1, 1);
  const nextYM = next.getFullYear() + "-" + String(next.getMonth()+1).padStart(2,"0");
  if (ym >= nextYM) return "";
  return " · since " + MO[parseInt(m[2],10)-1] + " " + m[1];
}
function renderEstBillsPage() {
  const list = document.getElementById("est-page-list");
  const pendingLabel = document.getElementById("est-pending-label");
  const incVal = document.getElementById("est-income-val");
  const expVal = document.getElementById("est-expense-val");
  const netVal = document.getElementById("est-net-val");
  if (!list) return;
  const now = new Date();
  const nextMonthLabel = MO[(now.getMonth()+1) % 12] + " " + (now.getMonth() === 11 ? now.getFullYear()+1 : now.getFullYear());
  if (!ESTIMATES.length) {
    list.innerHTML = '<div class="rec-empty">No bills forecasted yet.<br>Add bills or income you expect next month — like electric, credit card, or irregular freelance pay — so you can see it coming.</div>';
    if (pendingLabel) pendingLabel.textContent = "";
    if (incVal) incVal.textContent = fmt(0);
    if (expVal) expVal.textContent = fmt(0);
    if (netVal) netVal.textContent = fmt(0);
    return;
  }
  const totalIncome  = ESTIMATES.filter(b => b && b.type === "Income").reduce((s,b)=>s+(b.amount||0), 0);
  const totalExpense = ESTIMATES.filter(b => b && (b.type||"Expense") !== "Income").reduce((s,b)=>s+(b.amount||0), 0);
  const net = totalIncome - totalExpense;
  if (incVal) incVal.textContent = "+" + fmt(totalIncome);
  if (expVal) expVal.textContent = "−" + fmt(totalExpense);
  if (netVal) { netVal.textContent = (net>=0?"+":"") + fmt(net); netVal.style.color = net>=0 ? "var(--green-strong)" : "var(--red-strong)"; }
  if (pendingLabel) pendingLabel.textContent = "Forecast for " + nextMonthLabel;
  list.innerHTML = ESTIMATES.map((b, idx) => {
    if (!b) return "";
    const isInc = b.type === "Income";
    const isEditing = (_estEditIdx === idx);
    const icon = (b.category||"").match(/^\S+/)?.[0] || "🔄";
    const catName = (b.category||"").replace(/^\S+\s/, "");
    return '<div class="rec-page-item" id="est-item-' + idx + '">' +
      '<div class="rec-page-icon' + (isInc?" income":"") + '">' + icon + '</div>' +
      '<div class="rec-page-info">' +
        '<div class="rec-page-name">' + (b.desc||"") + '</div>' +
        '<div class="rec-page-cat">' + catName + ' · ' + (b.repeats !== false ? "repeats monthly" : "one-off estimate") + estSinceLabel(b.since) + '</div>' +
      '</div>' +
      '<div class="rec-page-right">' +
        (isEditing ?
          '<div class="rec-amt-edit-row">' +
            '<span style="font-size:12px;color:var(--slate-400)">฿</span>' +
            '<input class="rec-amt-input" id="est-amt-input-' + idx + '" type="text" inputmode="none" readonly value="' + b.amount + '" />' +
            '<button class="rec-amt-confirm" onclick="confirmEstAmt(' + idx + ')" aria-label="confirm"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--white)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' +
            '<button class="rec-amt-cancel" onclick="cancelEstAmt()" aria-label="cancel"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
          '</div>' +
          '<span class="rec-was-hint">was ' + fmt(b.amount) + '</span>'
        :
          '<span class="rec-amt-display' + (isInc?" income":"") + '" onclick="editEstAmt(' + idx + ')" title="Tap to edit amount">' + (isInc?'+':'−') + fmt(b.amount) + '</span>'
        ) +
      '</div>' +
      '<button class="rec-edit-btn" onclick="openEditEstBillModal(' + idx + ')" title="Edit">' + EDIT_PENCIL + '</button>' +
      '<button class="rec-del-btn" onclick="removeEstBill(' + idx + ')" title="Remove">×</button>' +
    '</div>';
  }).join("");
  if (_estEditIdx !== null) {
    const inp = document.getElementById("est-amt-input-" + _estEditIdx);
    if (inp) { nkpBind(); nkpOpen(inp); }
  }
}

function editEstAmt(idx) { _estEditIdx = idx; renderEstBillsPage(); }
function cancelEstAmt() { _estEditIdx = null; renderEstBillsPage(); }
function confirmEstAmt(idx) {
  const inp = document.getElementById("est-amt-input-" + idx);
  if (!inp) return;
  const newAmt = parseFloat(inp.value);
  if (isNaN(newAmt) || newAmt <= 0) { showToast("Enter a valid amount"); return; }
  ESTIMATES[idx].amount = newAmt;
  saveEstBills();
  _estEditIdx = null;
  renderEstBillsPage();
  renderHome();
  showToast("Amount updated ✓");
}

async function removeEstBill(idx) {
  const b = ESTIMATES[idx];
  if (!b) return;
  if (!(await appConfirm({title:"Remove from forecast?", message:'"'+(b.desc||"This item")+'" will no longer show in next month\'s forecast.', okText:"Remove", danger:true}))) return;
  ESTIMATES.splice(idx, 1);
  saveEstBills();
  renderEstBillsPage();
  renderHome();
  showToast("Removed");
}

let _estAddRepeats = true; // state for the modal's "Repeats monthly" toggle
let _estAddType = "Expense"; // state for the modal's Expense/Income toggle

function toggleEstRepeats() {
  _estAddRepeats = !_estAddRepeats;
  const t = document.getElementById("est-add-repeats-toggle");
  if (t) t.className = "toggle" + (_estAddRepeats ? " on" : "");
}

function setEstAddType(type) {
  _estAddType = type;
  const expBtn = document.getElementById("est-add-type-expense");
  const incBtn = document.getElementById("est-add-type-income");
  const confirmBtn = document.getElementById("est-add-confirm-btn");
  const cats = type === "Income" ? INCOME_CATS : EXPENSE_CATS;
  catBuildList("est-add-cat", cats);
  if (type === "Expense") {
    expBtn.style.border = "2px solid var(--red)"; expBtn.style.background = "var(--red-bg)"; expBtn.style.color = "var(--red-text)";
    incBtn.style.border = "1.5px solid var(--slate-200)"; incBtn.style.background = "var(--white)"; incBtn.style.color = "var(--slate-400)";
    if (confirmBtn) confirmBtn.style.background = "var(--teal)";
  } else {
    incBtn.style.border = "2px solid var(--green-strong)"; incBtn.style.background = "#f0fdf4"; incBtn.style.color = "var(--green-text)";
    expBtn.style.border = "1.5px solid var(--slate-200)"; expBtn.style.background = "var(--white)"; expBtn.style.color = "var(--slate-400)";
    if (confirmBtn) confirmBtn.style.background = "var(--green-strong)";
  }
}

function openAddEstBillModal() {
  _estAddEditIdx = -1;
  setEstAddType("Expense");
  document.getElementById("est-add-desc").value = "";
  document.getElementById("est-add-amount").value = "";
  _estAddRepeats = true;
  const t = document.getElementById("est-add-repeats-toggle");
  if (t) t.className = "toggle on";
  document.querySelector("#modal-add-estbill .modal-title").textContent = "Add estimated bill";
  document.getElementById("est-add-confirm-btn").textContent = "Add bill";
  openModal("add-estbill");
  nkpBind();
}

function openEditEstBillModal(idx) {
  const b = ESTIMATES[idx];
  if (!b) return;
  _estAddEditIdx = idx;
  setEstAddType(b.type === "Income" ? "Income" : "Expense");
  catSetValue("est-add-cat", b.category);
  document.getElementById("est-add-desc").value = b.desc || "";
  document.getElementById("est-add-amount").value = b.amount || "";
  _estAddRepeats = b.repeats !== false;
  const t = document.getElementById("est-add-repeats-toggle");
  if (t) t.className = "toggle" + (_estAddRepeats ? " on" : "");
  document.querySelector("#modal-add-estbill .modal-title").textContent = "Edit estimated bill";
  document.getElementById("est-add-confirm-btn").textContent = "Save changes";
  openModal("add-estbill");
  nkpBind();
}

function confirmAddEstBill() {
  const desc = document.getElementById("est-add-desc").value.trim();
  const amount = parseFloat(document.getElementById("est-add-amount").value);
  const cat = document.getElementById("est-add-cat").value;
  if (!desc) { showToast("Enter a description"); return; }
  if (!amount || amount <= 0) { showToast("Enter a valid amount"); return; }
  const entry = { desc, category: cat, amount, repeats: _estAddRepeats, type: _estAddType };
  const isEdit = _estAddEditIdx >= 0;
  if (isEdit) ESTIMATES[_estAddEditIdx] = entry;
  else ESTIMATES.push(entry);
  saveEstBills();
  closeModal("add-estbill");
  renderEstBillsPage();
  renderHome();
  showToast(isEdit ? "Bill updated ✓" : "Added ✓");
  _estAddEditIdx = -1;
}
// Temporary recovery function — clears corrupt recurring localStorage and re-fetches from Sheets.
// Accessible via Settings → "Reset recurring list".
async function resetRecurringData() {
  if (!(await appConfirm({title:"Reset recurring list?", message:"This clears local recurring data and pulls fresh from Google Sheets.", okText:"Reset", danger:true}))) return;
  RECURRING = [];
  localStorage.removeItem("ft_recurring");
  showToast("Clearing…");
  const ok = await fetchRecurringFromSheets(true);
  renderRecurringPage();
  if (ok) showToast("Recurring restored from Sheets ✓");
  else showToast("Cleared — no Sheets data found. Re-add items manually.");
}