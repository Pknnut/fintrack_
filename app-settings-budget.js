// FinTrack — Sheets sync engine, Settings page, Budget.
// ══ SHEETS SYNC ═══════════════════════════════════════════════
async function postToSheets(action,payload) {
  if(!settings.sheetsUrl)return false;
  try { const res=await fetch(settings.sheetsUrl,{method:"POST",body:JSON.stringify({action,...payload}),headers:{"Content-Type":"text/plain"}}); const data=await res.json(); return !data.error; } catch{return false;}
}
// Like postToSheets but returns the raw response object so callers can read rowId,
// success fields, etc. Returns null on network/parse failure.
async function postToSheetsRaw(action,payload) {
  if(!settings.sheetsUrl)return null;
  try { const res=await fetch(settings.sheetsUrl,{method:"POST",body:JSON.stringify({action,...payload}),headers:{"Content-Type":"text/plain"}}); return await res.json(); } catch{return null;}
}
async function rebuildInstallmentLog() {
  if(!settings.sheetsUrl){showToast("Add Sheets URL in Settings first");return;}
  const sub=document.getElementById("rebuild-log-sub"); const prev=sub?sub.textContent:"";
  if(sub)sub.textContent="Rebuilding…";
  setSyncStatus("syncing");
  const ok=await Promise.race([postToSheets("rebuild_installment_log",{}),new Promise(r=>setTimeout(()=>r(false),10000))]);
  if(ok){setSyncStatus("ok");showToast("Instalment log rebuilt ✓");if(sub)sub.textContent="Regenerate the log sheet & clear orphan rows";}
  else{setSyncStatus("error");showToast("Rebuild failed — check your URL");if(sub)sub.textContent=prev;}
}
async function manualSync() {
  if(!settings.sheetsUrl){showToast("Add Sheets URL in Settings first");goTo("settings");return;}
  // This used to be push-only despite being labeled "Sync now" — it never pulled anything
  // back down, so it could never clear stale state (like the Recurring "Logged" cache) or
  // pick up changes made elsewhere (e.g. editing the Sheet directly, or a delete that
  // hadn't been reflected locally yet). Only the small refresh icon (refreshApp) or a full
  // app restart actually pulled fresh data — which is exactly why a "sync" often looked
  // like it silently did nothing. Now this button does both directions, matching what its
  // label has always implied.
  const pending=txs.filter(t=>unsyncedIds.includes(t.id));
  if(pending.length){
    setSyncStatus("syncing"); showToast("Syncing "+pending.length+" transactions…");
    const ok=await postToSheets("add_transactions_bulk",{data:pending});
    if(ok){unsyncedIds=[];localStorage.setItem("ft_unsynced",JSON.stringify([]));settings.lastSync=new Date().toISOString();saveSettings();document.getElementById("last-sync-label").textContent="Last pushed: just now";}
    else{setSyncStatus("error");showToast("Push failed — check your URL");return;} // don't attempt a pull if the push itself couldn't reach Sheets
  }
  setSyncStatus("syncing");
  const [txOk] = await Promise.all([fetchFromSheets(true), fetchBudgetsFromSheets(true), fetchRecurringFromSheets(true), fetchInstallmentsFromSheets(true), fetchGoalsFromSheets(true), fetchEstBillsFromSheets(true)]);
  try { renderHome(); } catch(e) { console.warn("renderHome:", e); }
  if (document.getElementById("page-recurring")?.classList.contains("active")) { try { renderRecurringPage(); } catch(e) { console.warn("renderRecurringPage:", e); } }
  if (document.getElementById("page-estbills")?.classList.contains("active")) { try { renderEstBillsPage(); } catch(e) { console.warn("renderEstBillsPage:", e); } }
  setSyncStatus(txOk ? "ok" : "error");
  showToast(pending.length ? (pending.length+" synced + refreshed ✓") : (txOk ? "Synced ✓" : "Refresh failed — check your URL"));
}
async function testConnection() {
  const url=document.getElementById("sheets-url").value.trim(); if(!url){document.getElementById("conn-status").textContent="Enter a URL first";return;}
  settings.sheetsUrl=url; saveSettings(); document.getElementById("conn-status").textContent="Testing…";
  try{const res=await fetch(url+"?action=ping"),data=await res.json();if(data.status==="ok"){document.getElementById("conn-status").textContent="✓ Connected — "+data.timestamp;setSyncStatus("ok");}else document.getElementById("conn-status").textContent="✗ Unexpected response";}
  catch{document.getElementById("conn-status").textContent="✗ Connection failed — check URL";}
}
function setSyncStatus(status) {
  const bar=document.getElementById("sync-bar"),dot=document.getElementById("sync-dot"),msg=document.getElementById("sync-msg");
  if(!settings.sheetsUrl){bar.classList.add("hidden");return;}
  bar.classList.remove("hidden","error"); dot.classList.remove("pulse","red");
  if(status==="ok")msg.textContent="Synced with Google Sheets";
  else if(status==="syncing"){dot.classList.add("pulse");msg.textContent="Syncing…";}
  else if(status==="error"){bar.classList.add("error");dot.classList.add("red");msg.textContent="Sync failed — tap to retry";}
}
function updateSyncBar() { setSyncStatus(unsyncedIds.length?"error":"ok"); }

// ══ SETTINGS ══════════════════════════════════════════════════
function renderSettings() {
  document.getElementById("sheets-url").value=settings.sheetsUrl||"";
  document.getElementById("toggle-autosync").className="toggle"+(settings.autosync?" on":"");
  document.getElementById("toggle-pin").className="toggle"+(settings.pinEnabled?" on":"");
  document.getElementById("toggle-notif").className="toggle"+(settings.notif?" on":"");
  const tnb=document.getElementById("toggle-notif-budget"); if(tnb) tnb.className="toggle"+(settings.notifBudget?" on":"");
  const tnl=document.getElementById("toggle-notif-log");    if(tnl) tnl.className="toggle"+(settings.notifLog?" on":"");
  const tng=document.getElementById("toggle-notif-goal");   if(tng) tng.className="toggle"+(settings.notifGoal?" on":"");
  applyDarkMode();
  if(settings.lastSync)document.getElementById("last-sync-label").textContent="Last pushed: "+new Date(settings.lastSync).toLocaleString();
  if(settings.lastPull)document.getElementById("last-pull-label").textContent="Last pulled: "+new Date(settings.lastPull).toLocaleString();
  if(Notification.permission==="granted")document.getElementById("notif-status").textContent="✓ Notifications enabled";
}
function toggleSetting(key) {
  if(key==="autosync")settings.autosync=!settings.autosync;
  if(key==="pin")settings.pinEnabled=!settings.pinEnabled;
  if(key==="notif"){settings.notif=!settings.notif;if(settings.notif)requestNotifPermission();}
  if(key==="notifBudget") settings.notifBudget = !settings.notifBudget;
  if(key==="notifLog")    settings.notifLog    = !settings.notifLog;
  if(key==="notifGoal")   settings.notifGoal   = !settings.notifGoal;
  saveSettings(); renderSettings();
}
async function requestNotifPermission() {
  if(!("Notification" in window)){document.getElementById("notif-status").textContent="Not supported";return;}
  const perm=await Notification.requestPermission(); document.getElementById("notif-status").textContent=perm==="granted"?"✓ Notifications enabled":"✗ Permission denied";
}
function exportData() {
  const blob=new Blob([JSON.stringify({transactions:txs,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="fintrack_export.json";a.click();
}
function exportCSV() {
  const esc = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const headers = ["Date","Type","Category","Description","Amount","Notes","From Goal","Goal Name","Split ID"];
  const lines = [headers.map(esc).join(",")];
  txs.forEach(t => {
    lines.push([
      esc(t.date || ""),
      esc(t.type || ""),
      esc((t.category || "").replace(/^\S+\s/, "")),
      esc(t.desc || t.description || ""),
      (Number(t.amount) || 0),                 // unquoted → spreadsheets read it as a number
      esc(t.notes || ""),
      esc(t.fromGoal ? "Yes" : "No"),
      esc(t.goalName || ""),
      esc(t.splitId || "")
    ].join(","));
  });
  // Lead with a UTF-8 BOM so Excel renders Thai text, emoji and ฿ correctly
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const now = new Date();
  const stamp = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fintrack_transactions_" + stamp + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast("CSV exported ✓ (" + txs.length + " transactions)");
}
async function confirmClearGoals() { if(await appConfirm({title:"Delete all goals?", message:"Every goal will be removed. This does not affect Google Sheets.", okText:"Delete all", danger:true})){GOALS.length=0;localStorage.removeItem("ft_goals");showToast("Goals cleared");goTo("goals");} }
async function confirmClearInsts() { if(await appConfirm({title:"Delete all instalments?", message:"Every instalment plan will be removed. This does not affect Google Sheets.", okText:"Delete all", danger:true})){INSTALLMENTS.length=0;localStorage.removeItem("ft_insts");showToast("Instalments cleared");goTo("installments");} }
async function confirmClear() { if(await appConfirm({title:"Delete all local transactions?", message:"All transactions stored on this device will be erased. Your Google Sheets data is safe.", okText:"Delete all", danger:true})){localStorage.removeItem("ft_txs");localStorage.removeItem("ft_unsynced");txs=[];unsyncedIds=[];saveTxs();showToast("Local data cleared");goTo("home");} }
document.getElementById("sheets-url").addEventListener("blur",function(){settings.sheetsUrl=this.value.trim();saveSettings();updateSyncBar();});

// ── Re-lock on return from background ───────────────────────
// Uses a 60-second grace period — switching tabs briefly won't re-lock
let _hiddenAt = null;
const LOCK_GRACE_MS = 60000; // 60 seconds

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    _hiddenAt = Date.now();
  } else {
    if (!settings.pinEnabled) return;
    if (_hiddenAt === null) return;
    const away = Date.now() - _hiddenAt;
    _hiddenAt = null;
    if (away >= LOCK_GRACE_MS) {
      // Re-lock: show PIN screen
      pinBuffer = "";
      pinMode = "enter";
      document.getElementById("pin-sub").textContent = "Enter your PIN";
      document.getElementById("pin-error").textContent = "";
      updatePinDots();
      document.getElementById("pin-screen").classList.remove("hidden");
    }
  }
});

function setChartPeriod(period, btn) {
  chartPeriod = period;
  document.querySelectorAll('.period-pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  renderSpendingChart();
}

// ══ BUDGET ════════════════════════════════════════════════════
let BUDGETS = JSON.parse(localStorage.getItem("ft_budgets") || "[]");
if (!BUDGETS.length) BUDGETS = [];
function saveBudgets() { localStorage.setItem("ft_budgets", JSON.stringify(BUDGETS)); }

async function fetchBudgetsFromSheets(silent = false) {
  if(!settings.sheetsUrl)return false;
  try{const res=await fetch(settings.sheetsUrl+"?action=get_budgets"),data=await res.json();if(data.budgets&&Array.isArray(data.budgets)&&data.budgets.length){BUDGETS=data.budgets;saveBudgets();return true;}return false;}
  catch{return false;}
}
async function syncBudgetsToSheets() {
  if(!settings.sheetsUrl)return false;
  return await Promise.race([postToSheets("save_budgets",{budgets:BUDGETS}),new Promise(r=>setTimeout(()=>r(false),6000))]);
}

let budgetYear = new Date().getFullYear();
let budgetMonth = new Date().getMonth();
let editBudgetIdx = -1;
let budgetDropdownOpen = false;

// ── Budget period picker ──────────────────────────────────────
function toggleBudgetDropdown() {
  budgetDropdownOpen = !budgetDropdownOpen;
  const picker = document.getElementById("budget-picker");
  const chip   = document.getElementById("budget-filter-chip");
  picker.classList.toggle("hidden", !budgetDropdownOpen);
  chip.classList.toggle("open", budgetDropdownOpen);
  if (budgetDropdownOpen) { buildPeriodSelects("budget-sel-month", "budget-sel-year", budgetMonth, budgetYear); sddEnhance("budget-sel-year"); sddEnhance("budget-sel-month"); }
}
function closeBudgetDropdown() {
  budgetDropdownOpen = false;
  document.getElementById("budget-picker").classList.add("hidden");
  document.getElementById("budget-filter-chip").classList.remove("open");
}
function applyBudgetPicker() {
  budgetYear  = parseInt(document.getElementById("budget-sel-year").value);
  budgetMonth = parseInt(document.getElementById("budget-sel-month").value);
  closeBudgetDropdown();
  renderBudget();
}
function budgetGoToday() {
  const now = new Date();
  budgetMonth = now.getMonth();
  budgetYear  = now.getFullYear();
  closeBudgetDropdown();
  renderBudget();
}

function renderBudget() {
  const label = MO[budgetMonth] + " " + budgetYear;
  document.getElementById("budget-filter-label").textContent  = label;
  document.getElementById("budget-viewing-label").textContent = "Viewing " + label;

  const monthTxArr = txs.filter(t => {
    const d = parseDate(t.date);
    return d.getMonth() === budgetMonth && d.getFullYear() === budgetYear && t.type === "Expense" && !isGoalSpend(t);
  });
  const totalSpent  = monthTxArr.reduce((s, t) => s + t.amount, 0);
  const totalBudget = BUDGETS.reduce((s, b) => s + b.limit, 0);
  const totalPct    = totalBudget > 0 ? Math.min(Math.round(totalSpent / totalBudget * 100), 100) : 0;
  const ovColor     = totalPct >= 100 ? "var(--red)" : totalPct >= 80 ? "var(--amber)" : "var(--teal)";
  document.getElementById("budget-overview").innerHTML =
    '<div class="budget-ov-row"><span class="budget-ov-lbl">Total spent</span><span class="budget-ov-val">' + fmt(totalSpent) + '</span></div>' +
    '<div class="budget-ov-row"><span class="budget-ov-lbl">Total budget</span><span class="budget-ov-val">' + fmt(totalBudget) + '</span></div>' +
    '<div class="budget-total-bar"><div class="budget-total-fill" style="width:' + totalPct + '%;background:' + ovColor + '"></div></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--slate-400);margin-top:5px"><span>' + totalPct + '% used</span><span>' + fmt(Math.max(totalBudget - totalSpent, 0)) + ' remaining</span></div>';
  if (!BUDGETS.length) {
    document.getElementById("budget-grid").innerHTML = '<div class="empty-state">No budgets set — tap below to add one</div>';
    return;
  }
  document.getElementById("budget-grid").innerHTML = BUDGETS.map((b, idx) => {
    const spent = monthTxArr.filter(t => (t.category || "").includes(b.cat.replace(/^\S+\s/, ""))).reduce((s, t) => s + t.amount, 0);
    const pct   = b.limit > 0 ? Math.min(Math.round(spent / b.limit * 100), 100) : 0;
    const color = pct >= 100 ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--teal)";
    const emoji = b.cat.split(" ")[0];
    const catName = b.cat.replace(/^\S+\s/, "");
    // Sparkline: last 6 months of spending for this category
    const sparkData = [], sparkLabels = [];
    for (let i=5;i>=0;i--) {
      const d=new Date(budgetYear,budgetMonth-i,1);
      const mo=d.getMonth(),yr=d.getFullYear();
      sparkLabels.push(MO[mo].slice(0,3)+" "+String(yr).slice(2));
      sparkData.push(txs.filter(t=>{const td=parseDate(t.date);return td.getMonth()===mo&&td.getFullYear()===yr&&t.type==="Expense"&&!isGoalSpend(t)&&(t.category||"").includes(catName);}).reduce((s,t)=>s+t.amount,0));
    }
    const sparkMax=Math.max(...sparkData,1);
    const sparkW=80,sparkH=24,barW=9,barGap=4;
    const sparkUid = "sp-"+idx+"-"+budgetYear+budgetMonth;
    const sparkSvg='<div class="spark-bars" id="'+sparkUid+'" style="position:relative;display:inline-block;width:'+sparkW+'px;height:'+sparkH+'px">'+
      sparkData.map((v,i)=>{
        const h=Math.max(2,Math.round((v/sparkMax)*(sparkH-2)));
        const x=i*(barW+barGap), y=sparkH-h;
        const isLast=(i===sparkData.length-1);
        const tipId = sparkUid+"-t"+i;
        return '<div style="position:absolute;left:'+x+'px;bottom:0;width:'+barW+'px;height:'+sparkH+'px;display:flex;flex-direction:column;justify-content:flex-end" onclick="showSparkTip(\"'+tipId+'\")">'+
          '<div class="spark-tip" id="'+tipId+'">'+sparkLabels[i]+'\n'+fmt(v)+'</div>'+
          '<div style="width:'+barW+'px;height:'+h+'px;border-radius:2px;background:'+( isLast?color:"var(--slate-300)")+'"></div>'+
        '</div>';
      }).join("")+'</div>';
    return '<div class="budget-card">' +
      '<div class="budget-card-top">' +
        '<div class="budget-cat">' + emoji + ' ' + b.cat.replace(/^\S+\s/, "") + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span class="budget-pct" style="color:' + color + '">' + pct + '%</span>' +
          '<button class="budget-edit-btn" onclick="openBudgetEditModal(' + idx + ')" aria-label="Edit">' + EDIT_PENCIL_SM + '</button>' +
          '<button style="background:var(--red-bg);border:none;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:600;color:var(--red);cursor:pointer" onclick="deleteBudget(' + idx + ')">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="budget-bar"><div class="budget-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="budget-amounts"><span class="budget-spent">' + fmt(spent) + ' spent</span><span>limit: ' + fmt(b.limit) + '</span></div>' +
      '<div class="sparkline-wrap"><div class="sparkline-lbl"><span>Last 6 months</span><span>'+MO[(budgetMonth+11)%12]+' → '+MO[budgetMonth]+'</span></div>'+sparkSvg+'</div>' +
      (pct >= 80 ? '<div style="margin-top:8px;font-size:10px;font-weight:600;color:' + color + ';background:' + (pct>=100?'var(--red-bg)':'var(--amber-bg)') + ';padding:5px 8px;border-radius:6px">' + (pct>=100?'⚠️ Over budget!':'⚠️ Approaching limit') + '</div>' : '') +
    '</div>';
  }).join("");
  renderBudgetTrend();
}

let budgetTrendMo = 6;

function setBudgetTrendMo(n, btn) {
  budgetTrendMo = n;
  btn.parentElement.querySelectorAll("button").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
  renderBudgetTrend();
}

function renderBudgetTrend() {
  const wrap = document.getElementById("budget-trend-wrap");
  const el   = document.getElementById("budget-trend-lines");
  if (!wrap || !el || !BUDGETS.length) { if(wrap) wrap.style.display="none"; return; }
  wrap.style.display = "block";
  const n = budgetTrendMo;
  const W = 260, H = 72, padT = 16, padB = 16;
  const chartH = H - padT - padB;

  el.innerHTML = BUDGETS.map(b => {
    const catName = b.cat.replace(/^\S+\s/, "");
    const emoji   = b.cat.split(" ")[0];
    // Collect n months of data
    const months = [], amounts = [], labels = [];
    for (let i = n - 1; i >= 0; i--) {
      const d  = new Date(budgetYear, budgetMonth - i, 1);
      const mo = d.getMonth(), yr = d.getFullYear();
      labels.push(MO[mo].slice(0,3));
      amounts.push(txs.filter(t => {
        const td = parseDate(t.date);
        return td.getMonth()===mo && td.getFullYear()===yr && t.type==="Expense" && !isGoalSpend(t) && (t.category||"").includes(catName);
      }).reduce((s,t)=>s+t.amount, 0));
    }
    const maxAmt = Math.max(...amounts, b.limit, 1);
    const limitY = padT + (1 - b.limit/maxAmt) * chartH;
    // Build SVG points
    const pts = amounts.map((v,i) => {
      const x = (i/(n-1)) * W;
      const y = padT + (1 - v/maxAmt) * chartH;
      return {x, y, v};
    });
    const lineStr = pts.map((p,i) => (i===0?'M':'L') + p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    const areaStr = pts.map((p,i) => (i===0?'M':'L') + p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')
      + ' L'+W.toFixed(1)+','+(padT+chartH)+' L0,'+(padT+chartH)+' Z';
    // Color of last point
    const lastPct = b.limit > 0 ? Math.round(amounts[amounts.length-1]/b.limit*100) : 0;
    const lineColor = lastPct>=100?"var(--red)":lastPct>=80?"var(--amber)":"var(--teal)";
    // Axis labels — show first, middle, last only
    // Format label: full amount for last, short (k) for others
    function fmtLbl(v, isLast) {
      if (isLast) return '฿' + (v>=1000?(v/1000).toFixed(v%1000===0?0:1)+'k':Math.round(v));
      return v>=1000?(v/1000).toFixed(v%1000===0?0:1)+'k':Math.round(v);
    }
    // Per-point dot color
    function dotColor(v) {
      const p2 = b.limit>0?Math.round(v/b.limit*100):0;
      return p2>=100?"var(--red)":p2>=80?"var(--amber)":lineColor;
    }
    const axisLabels = labels.map((l,i) => {
      const isLast = i===n-1;
      const show = n<=6 || i===0 || i===Math.floor((n-1)/2) || isLast;
      return '<text x="'+(i/(n-1)*W).toFixed(1)+'" y="'+(H-1)+'" font-size="7.5" fill="'+(isLast?lineColor:'var(--slate-400)')+'" font-weight="'+(isLast?'bold':'normal')+'" text-anchor="middle">'+(show?l:'')+'</text>';
    }).join('');
    const dataLabels = pts.map((p,i) => {
      const isLast = i===n-1;
      const dc = dotColor(p.v);
      const lbl = fmtLbl(p.v, isLast);
      const labelY = (p.y - 6).toFixed(1);
      return '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+(isLast?3.5:2.5)+'" fill="'+dc+'" opacity="'+(isLast?1:0.7)+'"/>' +
        (isLast ? '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="1.5" fill="var(--white)"/>' : '') +
        '<text x="'+p.x.toFixed(1)+'" y="'+labelY+'" font-size="'+(isLast?8:7)+'" font-weight="'+(isLast?'bold':'normal')+'" fill="'+(isLast?dc:'var(--slate-400)')+'" text-anchor="middle">'+lbl+'</text>';
    }).join('');
    return '<div class="budget-line-row">' +
      '<div class="budget-line-hd">' +
        '<span class="budget-line-name">' + emoji + ' ' + catName + '</span>' +
        '<span class="budget-line-limit">limit ' + fmt(b.limit) + '</span>' +
      '</div>' +
      '<svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" style="display:block;overflow:visible">' +
        '<defs><linearGradient id="btg'+b.cat.replace(/\W/g,'')+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+lineColor+'" stop-opacity="0.15"/><stop offset="100%" stop-color="'+lineColor+'" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="'+areaStr+'" fill="url(#btg'+b.cat.replace(/\W/g,'')+')"/>' +
        '<line x1="0" y1="'+limitY.toFixed(1)+'" x2="'+W+'" y2="'+limitY.toFixed(1)+'" stroke="var(--red)" stroke-width="1" stroke-dasharray="4,3" opacity="0.5"/>' +
        '<text x="2" y="'+(limitY-2).toFixed(1)+'" font-size="7" fill="var(--red)" opacity="0.7">limit</text>' +
        '<path d="'+lineStr+'" fill="none" stroke="'+lineColor+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        dataLabels +
        axisLabels +
      '</svg>' +
    '</div>';
  }).join('<div style="height:1px;background:var(--slate-100);margin:2px 0 14px"></div>');
}

function openBudgetEditModal(idx) {
  editBudgetIdx=idx; const b=BUDGETS[idx];
  document.getElementById("modal-budget-title").textContent="Edit budget — "+b.cat.replace(/^\S+\s/,"");
  document.getElementById("modal-budget-sub").textContent="Current limit: "+fmt(b.limit);
  document.getElementById("modal-budget-amount").value=b.limit;
  document.getElementById("modal-budget").classList.remove("hidden");
  nkpBind();
  /* keypad field: no autofocus (avoids auto-opening keypad over the form) */
}
async function confirmSetBudget() {
  if(editBudgetIdx<0)return; const val=parseFloat(document.getElementById("modal-budget-amount").value)||0;
  if(val<=0){showToast("Enter a valid amount");return;}
  BUDGETS[editBudgetIdx].limit=val; saveBudgets(); closeModal("budget"); renderBudget();
  const ok = await syncBudgetsToSheets();
  if (ok) showToast("Budget updated + synced ✓"); else showToast("Saved locally — Sheets sync failed");
}
function openBudgetAddModal() {
  const existing=BUDGETS.map(b=>b.cat),available=EXPENSE_CATS.filter(c=>!existing.includes(c.e+" "+c.n));
  if(!available.length){showToast("All categories already have a budget");return;}
  catBuildList("modal-budget-cat", available);
  document.getElementById("modal-budget-new-amount").value="";
  document.getElementById("modal-budget-add").classList.remove("hidden");
  nkpBind();
  /* keypad field: no autofocus (avoids auto-opening keypad over the form) */
}
async function confirmAddBudget() {
  const cat=document.getElementById("modal-budget-cat").value,val=parseFloat(document.getElementById("modal-budget-new-amount").value)||0;
  if(val<=0){showToast("Enter a valid amount");return;}
  BUDGETS.push({cat,limit:val}); saveBudgets(); closeModal("budget-add"); renderBudget();
  const ok = await syncBudgetsToSheets();
  if (ok) showToast("Budget added + synced ✓"); else showToast("Saved locally — Sheets sync failed");
}
async function deleteBudget(idx) {
  if(await appConfirm({title:'Remove this budget?', message:'Budget for "'+BUDGETS[idx].cat.replace(/^\S+\s/,"")+'" will be removed.', okText:"Remove", danger:true})){
    BUDGETS.splice(idx,1); saveBudgets(); renderBudget();
    const ok = await syncBudgetsToSheets();
    if (ok) showToast("Budget removed + synced ✓"); else showToast("Removed locally — Sheets sync failed");
  }
}