// FinTrack — Instalments (+ payoff simulator, debt-free planner), Add Transaction/Goal/Instalment form, Split transactions.
// ══ INSTALLMENTS ══════════════════════════════════════════════
// ══ PAYOFF SIMULATOR ═════════════════════════════════════════
// "Extra ฿/month" → how many months sooner you're debt-free + cash freed.
// These are 0% plans (balance = monthly × months left), so no interest is modelled.
let _payoffIdx = -1;
function openPayoffSim(idx) {
  const p = INSTALLMENTS[idx]; if (!p) return;
  _payoffIdx = idx;
  document.getElementById("payoff-sub").textContent = (p.icon ? p.icon + " " : "") + p.name + " · " + fmt(p.monthly) + "/mo · 0% plan";
  const slider = document.getElementById("payoff-slider");
  slider.max = Math.max(1000, Math.ceil(p.monthly * 3 / 100) * 100);  // up to ~3× the monthly
  slider.value = 0;
  openModal("payoff");
  updatePayoffSim();
}
function updatePayoffSim() {
  const p = INSTALLMENTS[_payoffIdx]; if (!p) return;
  const rem = Math.max(p.total_mo - p.paid, 0);
  const bal = Math.max(p.total - p.monthly * p.paid, 0);
  const extra = Number(document.getElementById("payoff-slider").value) || 0;
  document.getElementById("payoff-extra-val").textContent = "฿" + extra.toLocaleString();
  const pay = p.monthly + extra;
  const newMonths = pay > 0 ? Math.min(rem, Math.max(1, Math.ceil(bal / pay))) : rem;
  const sooner = rem - newMonths;
  const now = new Date();
  const lbl = n => { const d = new Date(now.getFullYear(), now.getMonth() + n, 1); return MO[d.getMonth()] + " " + d.getFullYear(); };
  document.getElementById("payoff-current").innerHTML =
    '<div class="payoff-row"><span>Balance left</span><b>' + fmt(bal) + '</b></div>' +
    '<div class="payoff-row"><span>Current payoff</span><b>' + rem + (rem === 1 ? ' month · ' : ' months · ') + lbl(rem) + '</b></div>';
  document.getElementById("payoff-result").innerHTML =
    '<div class="payoff-result-main">' + newMonths + (newMonths === 1 ? ' month' : ' months') + '<span>debt-free ' + lbl(newMonths) + '</span></div>' +
    '<div class="payoff-pill' + (sooner > 0 ? '' : ' none') + '">' + (sooner > 0 ? (sooner + (sooner === 1 ? ' month sooner' : ' months sooner')) : 'no change yet') + '</div>' +
    (sooner > 0 ? '<div class="payoff-freed">Frees ' + fmt(p.monthly) + '/mo, ' + sooner + (sooner === 1 ? ' month' : ' months') + ' earlier</div>' : '');
}

// ══ DEBT-FREE SNOWBALL / AVALANCHE PLANNER ══════════════════
// Simulates all active plans together, month by month: extra money targets one plan at a
// time (per strategy order); once that plan finishes, its own monthly payment rolls into
// the pool for the next plan — the classic "snowball" acceleration, even with ฿0 extra.
let _snowStrategy = "snowball";

function setSnowballStrategy(s) {
  _snowStrategy = s;
  document.getElementById("snow-strat-snowball").classList.toggle("active", s === "snowball");
  document.getElementById("snow-strat-avalanche").classList.toggle("active", s === "avalanche");
  updateSnowballPlan();
}

function openSnowballPlanner() {
  const active = INSTALLMENTS.filter(p => p.paid < p.total_mo);
  if (!active.length) { showToast("No active instalments to plan"); return; }
  _snowStrategy = "snowball";
  document.getElementById("snow-strat-snowball").classList.add("active");
  document.getElementById("snow-strat-avalanche").classList.remove("active");
  const maxMonthly = Math.max(...active.map(p => p.monthly), 1000);
  document.getElementById("snow-slider").max = Math.max(2000, Math.ceil(maxMonthly * 3 / 100) * 100);
  document.getElementById("snow-slider").value = 0;
  openModal("snowball");
  updateSnowballPlan();
}

// Pure simulation — month-by-month, no UI side effects, easy to reason about / test.
function simulateSnowball(plans, strategy, extraPerMonth) {
  if (!plans.length) return { order: [] };
  const order = plans.map((p, i) => ({ ...p, idx: i, remaining: p.balance }));
  if (strategy === "snowball") order.sort((a, b) => a.remaining - b.remaining);   // smallest balance first
  else order.sort((a, b) => b.monthly - a.monthly);                               // highest monthly payment first

  let pool = extraPerMonth, month = 0, targetPtr = 0;
  const finishMonth = {};
  const MAX_MONTHS = 600; // safety cap — a few years past any realistic plan length

  while (Object.keys(finishMonth).length < order.length && month < MAX_MONTHS) {
    month++;
    while (targetPtr < order.length && order[targetPtr].remaining <= 0) targetPtr++;
    if (targetPtr >= order.length) break;
    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      if (p.remaining <= 0) continue;
      const payment = (i === targetPtr) ? (p.monthly + pool) : p.monthly;
      p.remaining = Math.max(0, p.remaining - payment);
      if (p.remaining <= 0 && finishMonth[p.idx] === undefined) {
        finishMonth[p.idx] = month;
        pool += p.monthly; // freed payment rolls forward
      }
    }
  }
  order.forEach(p => { p.finishMonth = finishMonth[p.idx] !== undefined ? finishMonth[p.idx] : month; });
  return { order: [...order].sort((a, b) => a.finishMonth - b.finishMonth) };
}

function updateSnowballPlan() {
  const active = INSTALLMENTS.filter(p => p.paid < p.total_mo).map(p => ({
    name: p.name, icon: p.icon, monthly: p.monthly,
    balance: Math.max(p.total - p.monthly * p.paid, 0)
  }));
  if (!active.length) return;
  const extra = Number(document.getElementById("snow-slider").value) || 0;
  document.getElementById("snow-extra-val").textContent = "฿" + extra.toLocaleString();
  const { order } = simulateSnowball(active, _snowStrategy, extra);
  const now = new Date();
  const lbl = n => { const d = new Date(now.getFullYear(), now.getMonth() + n, 1); return MO[d.getMonth()] + " " + d.getFullYear(); };
  document.getElementById("snow-order").innerHTML =
    '<div class="snow-order">' +
      order.map((p, i) =>
        '<div class="snow-order-row"><span class="lbl"><span class="badge">' + (i + 1) + '</span>' + p.icon + ' ' + p.name + '</span><span class="date">paid off ' + lbl(p.finishMonth) + '</span></div>'
      ).join("") +
    '</div>';
  const overallMonths = Math.max(...order.map(p => p.finishMonth));
  document.getElementById("snow-result").innerHTML =
    '<div class="payoff-result-main">' + lbl(overallMonths) + '<span>all instalments paid off</span></div>';
}

function renderInstallments() {
  const active=INSTALLMENTS.filter(p=>p.paid<p.total_mo),monthly=active.reduce((s,p)=>s+p.monthly,0),balance=INSTALLMENTS.reduce((s,p)=>s+Math.max(p.total-p.monthly*p.paid,0),0);
  document.getElementById("inst-monthly").textContent=fmt(monthly); document.getElementById("inst-balance").textContent=fmt(balance); document.getElementById("inst-count").textContent=active.length;
  // Income commitment warning
  const now=new Date(), incomeThisMonth=monthTxs(now.getMonth(),now.getFullYear()).filter(t=>t.type==="Income").reduce((s,t)=>s+t.amount,0);
  const warnEl=document.getElementById("inst-income-warning");
  if (warnEl && incomeThisMonth>0 && monthly>0) {
    const pct=Math.round((monthly/incomeThisMonth)*100);
    const color=pct>=50?"var(--red-text)":pct>=30?"var(--amber-text)":"var(--green-text)";
    const bg=pct>=50?"var(--red-bg)":pct>=30?"var(--amber-bg)":"var(--green-bg)";
    warnEl.style.display="block"; warnEl.style.background=bg; warnEl.style.color=color;
    warnEl.textContent="⚠ Monthly instalments are "+pct+"% of your income ("+fmt(monthly)+" of "+fmt(incomeThisMonth)+")";
  } else if (warnEl) { warnEl.style.display="none"; }
  // ── Option B Timeline ─────────────────────────────────────────
  const tlEl = document.getElementById("inst-timeline");
  const activeForTl = INSTALLMENTS.filter(p => p.paid < p.total_mo);
  if (tlEl && activeForTl.length) {
    // Sort by months remaining ascending
    const sorted = [...activeForTl].sort((a,b)=>(a.total_mo-a.paid)-(b.total_mo-b.paid));
    const maxRem = Math.max(...sorted.map(p=>p.total_mo-p.paid), 1);
    const rows = sorted.map(p => {
      const rem = p.total_mo - p.paid;
      const pct = Math.min(Math.round((rem/maxRem)*100), 100);
      const bal = Math.max(p.total - p.monthly*p.paid, 0);
      // End date
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + rem);
      const endLbl = MO[endDate.getMonth()].slice(0,3) + " " + String(endDate.getFullYear()).slice(2);
      // Badge color based on months left
      const badgeBg = rem<=3?"#fee2e2":rem<=6?"#fef3c7":"#dcfce7";
      const badgeColor = rem<=3?"#991b1b":rem<=6?"#78350f":"#166534";
      // Bar width = percentage already PAID (progress bar style)
      const paidPct = Math.min(Math.round((p.paid / p.total_mo) * 100), 100);
      return '<div class="inst-tl-row">' +
        '<div class="inst-tl-name">' + p.icon + ' ' + p.name + '</div>' +
        '<div class="inst-tl-track">' +
          '<div class="inst-tl-bar" style="width:' + paidPct + '%;background:' + p.color + '">' +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0;min-width:88px">' +
          '<div style="font-size:10px;font-weight:600;color:' + badgeColor + ';background:' + badgeBg + ';padding:2px 8px;border-radius:20px;display:inline-block;white-space:nowrap">' + rem + ' m left</div>' +
          '<div style="font-size:9px;color:var(--slate-400);margin-top:2px">' + endLbl + ' · ' + fmt(bal) + '</div>' +
        '</div>' +
      '</div>';
    }).join("");
    tlEl.innerHTML =
      '<div class="inst-tl-hd"><span>Payoff order — soonest first</span>' +
        '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--slate-400)">' +
          '<div style="width:8px;height:3px;background:var(--red);border-radius:1px"></div> further right = longer remaining' +
        '</div>' +
      '</div>' + rows;
  } else if (tlEl) {
    tlEl.innerHTML = '<div style="font-size:11px;color:var(--slate-400);text-align:center;padding:8px 0">No active instalments</div>';
  }

  // Read filter + sort values
  const fStatus = document.getElementById("inst-filter-status")?.value || "active";
  const fSort   = document.getElementById("inst-filter-sort")?.value || "soonest";

  // Filter
  let filtered = INSTALLMENTS.map((p,idx)=>({p,idx})).filter(({p})=>{
    const isDone = p.paid >= p.total_mo;
    if (fStatus === "active") return !isDone;
    if (fStatus === "done")   return isDone;
    return true;
  });

  // Sort
  filtered.sort((a,b)=>{
    if (fSort === "monthly") return b.p.monthly - a.p.monthly;
    if (fSort === "balance")  return Math.max(b.p.total-b.p.monthly*b.p.paid,0) - Math.max(a.p.total-a.p.monthly*a.p.paid,0);
    if (fSort === "name")     return (a.p.icon+' '+a.p.name).localeCompare(b.p.icon+' '+b.p.name);
    // soonest: by months remaining ascending
    return (a.p.total_mo-a.p.paid) - (b.p.total_mo-b.p.paid);
  });

  // Hide timeline when showing paid off only
  const tlEl2 = document.getElementById("inst-timeline");
  if (tlEl2) tlEl2.style.display = fStatus === "done" ? "none" : "block";

  // Result count
  const rcEl = document.getElementById("inst-result-count");
  if (rcEl) {
    const label = fStatus==="done"?"paid off":fStatus==="active"?"active":"total";
    rcEl.textContent = "Showing "+filtered.length+" "+label+" plan"+(filtered.length!==1?"s":"");
  }

  document.getElementById("inst-list").innerHTML=filtered.map(({p,idx})=>{
    const pct=Math.round(p.paid/p.total_mo*100),rem=p.total_mo-p.paid,bal=Math.max(p.total-p.monthly*p.paid,0),isDone=rem<=0;
    return '<div class="inst-card"><div class="inst-top"><div><div class="inst-name">'+p.icon+' '+p.name+'</div><div class="inst-cat">'+p.cat+'</div></div><span class="inst-badge '+(isDone?'badge-done':'badge-active')+'">'+(isDone?'Paid off':'Active')+'</span></div><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--slate-400);margin-bottom:4px"><span>'+p.paid+' of '+p.total_mo+' months paid</span><span style="font-weight:600;color:'+p.color+'">'+pct+'%</span></div><div class="inst-track"><div class="inst-fill" style="width:'+pct+'%;background:'+p.color+'"></div></div>'+
      (isDone
        ? '<div class="inst-stats"><div><div style="font-size:9px;color:var(--slate-400)">Monthly</div><div class="inst-stat-val">'+fmt(p.monthly)+'</div></div><div style="text-align:center"><div style="font-size:9px;color:var(--slate-400)">Months left</div><div class="inst-stat-val">'+rem+'</div></div><div style="text-align:right"><div style="font-size:9px;color:var(--slate-400)">Balance</div><div class="inst-stat-val" style="color:var(--slate-400)">'+fmt(bal)+'</div></div></div>'
        : '<div class="inst-sim-box" onclick="openPayoffSim('+idx+')"><div class="inst-stats"><div><div class="inst-sim-lbl">Monthly</div><div class="inst-sim-val">'+fmt(p.monthly)+'</div></div><div style="text-align:center"><div class="inst-sim-lbl">Months left</div><div class="inst-sim-val">'+rem+'</div></div><div style="text-align:right"><div class="inst-sim-lbl">Balance</div><div class="inst-sim-val" style="color:var(--red)">'+fmt(bal)+'</div></div></div><div class="inst-sim-hint">'+SIM_BOLT+'<span>Tap to simulate payoff</span><span>›</span></div></div>')+
      '<div class="inst-actions"><button class="inst-action-btn inst-pay-btn" onclick="openInstModal('+idx+')"'+(isDone?' disabled':'')+'>Paid This Month</button><button class="inst-action-btn" style="background:var(--green-bg);color:var(--green-text);border-color:var(--green-border);font-size:10px" onclick="confirmEarlyPayoff('+idx+')"'+(isDone?' disabled':'')+'>Pay off</button><button class="inst-action-btn inst-edit-btn" onclick="openEditInstModal('+idx+')" aria-label="Edit">'+EDIT_PENCIL+'</button><button class="inst-action-btn inst-delete-btn" onclick="deleteInst('+idx+')">🗑️</button></div></div>';
  }).join("");
}
async function confirmEarlyPayoff(idx) {
  const p = INSTALLMENTS[idx];
  if (!p) return;
  const rem = p.total_mo - p.paid;
  if (rem <= 0) { showToast("Already fully paid off"); return; }
  if (!(await appConfirm({title:'Mark "' + p.icon + ' ' + p.name + '" as paid off?', message:rem + ' payment' + (rem!==1?'s':'') + ' remaining will be marked as paid.\n\nThis also logs one expense transaction for the remaining balance.', okText:"Mark paid"}))) return;
  const bal = Math.max(p.total - p.monthly * p.paid, 0);
  const now = new Date();
  INSTALLMENTS[idx].paid = p.total_mo;
  INSTALLMENTS[idx].lastPaidYM = ymOf(now);
  saveInsts();
  // One lump-sum transaction for the remaining balance — same linking as a normal Mark as paid.
  const tx = { id: Date.now(), date: toDateStr(now), type: "Expense", category: p.cat,
    desc: (p.icon ? p.icon + " " : "") + p.name + " instalment payoff", amount: bal,
    notes: "", fromInst: true, instId: p.id };
  txs.push(tx); saveTxs();
  renderInstallments(); renderHome();
  showToast(p.name + " marked as fully paid off + logged ✓");
  if (settings.sheetsUrl) {
    setSyncStatus("syncing");
    const [instOk, txOk] = await Promise.all([
      Promise.race([postToSheets("update_installment_paid",{planName:p.name,monthsPaid:p.total_mo}), new Promise(r=>setTimeout(()=>r(false),6000))]),
      Promise.race([postToSheets("add_transaction",{data:{...tx}}), new Promise(r=>setTimeout(()=>r(false),6000))])
    ]);
    if (instOk && txOk) { setSyncStatus("ok"); }
    else {
      setSyncStatus("error");
      if (!txOk) { unsyncedIds.push(tx.id); localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds)); }
      showToast("Synced partially — check connection");
    }
  }
}

async function deleteInst(idx) {
  const inst = INSTALLMENTS[idx];
  if(!(await appConfirm({title:'Delete "'+inst.name+'"?', okText:"Delete", danger:true})))return;
  // Check for linked Mark-as-paid transactions (fromInst, matched by instId — see confirmMarkPaid)
  const linkedTxs = txs.filter(t => t.fromInst && t.instId === inst.id);
  let deleteLinked = false;
  if (linkedTxs.length > 0) {
    deleteLinked = await appConfirm({
      title: "Delete linked transactions?",
      message: linkedTxs.length + ' transaction' + (linkedTxs.length > 1 ? 's' : '') +
        ' from "' + inst.name + '" exist in History (total: ' + fmt(linkedTxs.reduce((s,t)=>s+t.amount,0)) + ').',
      okText: "Delete them",
      cancelText: "Keep them",
      danger: true
    });
  }
  if (deleteLinked) {
    for (const t of linkedTxs) {
      txs = txs.filter(x => x.id !== t.id);
      unsyncedIds = unsyncedIds.filter(uid => uid !== t.id);
      if (t.rowId && settings.sheetsUrl) {
        await Promise.race([postToSheets("delete_transaction", {rowId:t.rowId, data:{date:t.date,desc:t.desc||"",amount:t.amount}}), new Promise(r=>setTimeout(()=>r(false),4000))]);
      }
    }
    localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds));
    saveTxs();
  }
  INSTALLMENTS.splice(idx,1); saveInsts(); renderInstallments(); renderHome();
  const linkedNote = deleteLinked ? " + " + linkedTxs.length + " transaction(s) removed" : "";
  if(inst&&settings.sheetsUrl){setSyncStatus("syncing");const ok=await Promise.race([postToSheets("delete_installment",{name:inst.name}),new Promise(r=>setTimeout(()=>r(false),6000))]);if(ok){setSyncStatus("ok");showToast("Instalment deleted"+linkedNote+" + synced ✓");}else{setSyncStatus("error");showToast("Deleted locally — Sheets sync failed");}}
  else showToast("Instalment deleted"+linkedNote);
}

// ══ ADD FORM ══════════════════════════════════════════════════
let currentEntryType = "tx", currentType = "Expense";
function setEntryType(type) {
  currentEntryType=type;
  ["tx","goal","inst"].forEach(t=>{document.getElementById("etbtn-"+t).classList.toggle("active",t===type);document.getElementById("form-"+t).style.display=t===type?"block":"none";});
  const titles={tx:"New Transaction",goal:"New Goal",inst:"New Instalment"};
  document.getElementById("add-page-title").textContent=titles[type];
}
function setType(type) {
  currentType=type;
  document.getElementById("btn-expense").className="type-btn"+(type==="Expense"?" active-exp":"");
  document.getElementById("btn-income").className="type-btn"+(type==="Income"?" active-inc":"");
  updateCats();
  if (_splitOn) refreshSplitCats();
}
function buildDaySelect(id,day) { const el=document.getElementById(id);if(!el)return;el.innerHTML=Array.from({length:31},(_,i)=>`<option value="${i+1}"${i+1===day?' selected':''}>${i+1}</option>`).join(""); }
function buildMonthSelect(id,month) { const el=document.getElementById(id);if(!el)return;el.innerHTML=MO.map((m,i)=>`<option value="${i+1}"${i+1===month?' selected':''}>${m}</option>`).join(""); }
function buildYearSelect(id,year,back,fwd) { const el=document.getElementById(id);if(!el)return;const cur=new Date().getFullYear();let html="";for(let y=cur-(back||0);y<=cur+(fwd||3);y++)html+=`<option value="${y}"${y===year?' selected':''}>${y}</option>`;el.innerHTML=html; }
function getDateVal(dId,mId,yId) { const d=document.getElementById(dId)?.value||"1",m=document.getElementById(mId)?.value,y=document.getElementById(yId)?.value;if(!m||!y)return"";return y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0"); }
function getMonthVal(mId,yId) { const m=document.getElementById(mId)?.value,y=document.getElementById(yId)?.value;if(!m||!y)return"";return y+"-"+String(m).padStart(2,"0")+"-01"; }
function setupAdd() {
  currentEntryType="tx"; setEntryType("tx");
  const now=new Date(),d=now.getDate(),mo=now.getMonth()+1,y=now.getFullYear();
  buildDaySelect("f-date-d",d);buildMonthSelect("f-date-m",mo);buildYearSelect("f-date-y",y,1,0);
  buildMonthSelect("g-due-m",mo);buildYearSelect("g-due-y",y,0,5);
  buildDaySelect("i-start-d",d);buildMonthSelect("i-start-m",mo);buildYearSelect("i-start-y",y,1,0);
  ["f-amount","f-desc","f-notes","g-name","g-target","g-saved","g-monthly","i-name","i-total","i-monthly","i-total-mo"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("i-paid").value="0"; updateCats(); updateInstCats();
  const gCatSel=document.getElementById("g-category");
  catBuildList("g-category", EXPENSE_CATS);
  // App-styled dropdowns for date + colour selects (replaces native iOS wheel)
  sddEnhance("f-date-d",{flex:"1"}); sddEnhance("f-date-m",{flex:"1.4"}); sddEnhance("f-date-y",{flex:"1.2"});
  sddEnhance("g-due-m",{flex:"1.4"}); sddEnhance("g-due-y",{flex:"1.2"});
  sddEnhance("i-start-d",{flex:"1"}); sddEnhance("i-start-m",{flex:"1.4"}); sddEnhance("i-start-y",{flex:"1.2"});
  sddEnhance("g-color",{swatch:true,up:true}); sddEnhance("i-color",{swatch:true,up:true});
  isRecurring = false;
  const togRec = document.getElementById("toggle-recurring");
  if (togRec) togRec.className = "toggle";
  resetSplit();
  const fAmt = document.getElementById("f-amount");
  if (fAmt && !fAmt._splitBound) { fAmt.addEventListener("input", updateSplitRemainder); fAmt._splitBound = true; }
  const hasUrl=!!settings.sheetsUrl;
  document.getElementById("add-sync-dot").style.background=hasUrl?"var(--green)":"var(--slate-300)";
  document.getElementById("add-sync-label").textContent=hasUrl&&settings.autosync?"Will sync to Google Sheets":"Will save locally only";
  nkpBind();
}
function updateCats() { const cats=currentType==="Income"?INCOME_CATS:EXPENSE_CATS; catBuildList("f-category", cats); }
function updateInstCats() { catBuildList("i-category", EXPENSE_CATS); }

// Shared swipe-to-delete engine for any rows wrapped in `selector` containers
// (history + calendar). onDelete(id) runs when the revealed bin is tapped.
function initSwipeRows(selector, onDelete) {
  let openRow = null;
  // Tap outside the open row snaps it closed
  document.addEventListener('touchstart', e => {
    if (!openRow) return;
    if (!openRow.closest(selector).contains(e.target)) {
      openRow.classList.remove('no-transition');
      openRow.style.transform = '';
      openRow = null;
    }
  }, {passive:true});

  document.querySelectorAll(selector).forEach(container => {
    const row = container.querySelector('.hist-tx-row');
    const bg  = container.querySelector('.swipe-del-bg');
    if (!row || !bg) return;
    const id = parseInt(container.dataset.id);
    let startX=0, currentX=0, isDragging=false;
    const THRESHOLD = 72;

    row.addEventListener('touchstart', e => {
      if (openRow && openRow !== row) { // close any other open row first
        openRow.classList.remove('no-transition');
        openRow.style.transform = '';
        openRow = null;
      }
      startX = e.touches[0].clientX;
      currentX = row.style.transform ? -THRESHOLD : 0; // preserve open state
      isDragging = true;
      row.classList.add('no-transition');
    }, {passive:true});

    row.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - startX;
      const newX = currentX + dx;
      if (newX > 0) return; // can't swipe right past origin
      row.style.transform = 'translateX(' + Math.max(newX, -THRESHOLD - 16) + 'px)';
    }, {passive:true});

    row.addEventListener('touchend', () => {
      isDragging = false;
      row.classList.remove('no-transition');
      const finalX = parseFloat(row.style.transform.replace('translateX(','')) || 0;
      if (finalX < -THRESHOLD / 2) { row.style.transform = 'translateX(-' + THRESHOLD + 'px)'; openRow = row; }
      else { row.style.transform = ''; openRow = null; }
    });

    bg.addEventListener('click', () => {
      row.style.transform = '';
      openRow = null;
      onDelete(id);
    });
  });
}

function initSwipeToDelete() {
  initSwipeRows('.swipe-container', id => deleteTx(id)); // confirm() runs inside deleteTx
}

function setBtn(id,loading,label,bg) { const btn=document.getElementById(id);if(!btn)return;btn.disabled=loading;btn.style.opacity=loading?"0.6":"1";btn.textContent=loading?"Saving…":label;if(bg)btn.style.background=bg; }
function flashBtn(id,label,bg) { const btn=document.getElementById(id);if(!btn)return;btn.disabled=false;btn.style.opacity="1";btn.textContent="✓ Saved!";btn.style.background="var(--green)";setTimeout(()=>{btn.textContent=label;btn.style.background=bg||"";},1400); }

// ══ SPLIT TRANSACTION ════════════════════════════════════════
// One purchase divided across categories. Each line becomes its own normal
// transaction sharing a splitId, so Analytics/Budget see the real per-category
// amounts automatically. History groups them back into a single card.
let _splitOn = false, _splitSeq = 0, _splitEditId = null;
function _splitSetSel(id, val) { const s = document.getElementById(id); if (!s) return; s.value = String(val); if (SDD_ENHANCED.has(id)) sddSync(id); }
// Edit an existing split by reusing the Add-transaction form in "edit split" mode.
function openEditSplit(splitId) {
  const members = txs.filter(t => t.splitId === splitId);
  if (!members.length) return;
  goTo("add"); // runs setupAdd() (resets the form + split state) synchronously
  requestAnimationFrame(() => {
    setEntryType("tx");
    _splitEditId = splitId;
    const m0 = members[0], total = members.reduce((s,m)=>s+m.amount,0), d = parseDate(m0.date);
    setType(m0.type);
    document.getElementById("f-amount").value = String(total);
    document.getElementById("f-desc").value = m0.desc || m0.description || "";
    _splitSetSel("f-date-d", d.getDate()); _splitSetSel("f-date-m", d.getMonth()+1); _splitSetSel("f-date-y", d.getFullYear());
    if (!_splitOn) toggleSplit();           // turn split editor on
    const rowsEl = document.getElementById("split-rows");
    [...rowsEl.querySelectorAll(".split-row")].forEach(r => SDD_ENHANCED.delete("split-cat-"+r.id.replace("split-row-","")));
    rowsEl.innerHTML = "";                   // replace default rows with one per member
    members.forEach(m => { addSplitRow(m.category); const amt = document.getElementById("split-amt-"+(_splitSeq-1)); if (amt) amt.value = String(m.amount); });
    updateSplitRemainder();
    document.getElementById("add-page-title").textContent = "Edit Split";
    setBtn("btn-add-tx", false, "Save Split");
  });
}
function toggleSplit() {
  _splitOn = !_splitOn;
  document.getElementById("toggle-split").className = "toggle" + (_splitOn ? " on" : "");
  document.getElementById("split-editor").style.display = _splitOn ? "block" : "none";
  const catField = document.getElementById("f-category-field");
  if (catField) catField.style.display = _splitOn ? "none" : "block";
  if (_splitOn && !document.querySelector("#split-rows .split-row")) { addSplitRow(); addSplitRow(); }
  updateSplitRemainder();
}
function _splitCatOptions() {
  const cats = currentType === "Income" ? INCOME_CATS : EXPENSE_CATS;
  return cats.map(c => '<option value="' + c.e + " " + c.n + '">' + c.e + " " + c.n + '</option>').join("");
}
function addSplitRow(presetCat) {
  const i = _splitSeq++;
  const rowsEl = document.getElementById("split-rows");
  if (!rowsEl) return;
  const row = document.createElement("div");
  row.className = "split-row"; row.id = "split-row-" + i;
  row.innerHTML =
    '<select id="split-cat-' + i + '">' + _splitCatOptions() + '</select>' +
    '<input id="split-amt-' + i + '" class="split-amt" type="text" inputmode="none" placeholder="0">' +
    '<button type="button" class="split-del" onclick="removeSplitRow(' + i + ')" aria-label="Remove">×</button>';
  rowsEl.appendChild(row);
  sddEnhance("split-cat-" + i, {flex:"1", icon:true});
  if (presetCat) { const s = document.getElementById("split-cat-"+i); if (s && [...s.options].some(o=>o.value===presetCat)) { s.value = presetCat; sddSync("split-cat-"+i); } }
  const amt = document.getElementById("split-amt-" + i);
  if (amt) amt.addEventListener("input", updateSplitRemainder);
  nkpMarkInputs();
  updateSplitRemainder();
}
function removeSplitRow(i) {
  const row = document.getElementById("split-row-" + i);
  if (row) row.remove();
  SDD_ENHANCED.delete("split-cat-" + i);
  updateSplitRemainder();
}
function _splitRows() {
  return [...document.querySelectorAll("#split-rows .split-row")].map(r => {
    const i = r.id.replace("split-row-","");
    return { cat: document.getElementById("split-cat-"+i)?.value || "", amount: parseFloat(document.getElementById("split-amt-"+i)?.value) || 0 };
  });
}
function updateSplitRemainder() {
  const total = parseFloat(document.getElementById("f-amount")?.value) || 0;
  const sum = _splitRows().reduce((s,it)=>s+it.amount,0);
  const rem = Math.round((total - sum) * 100) / 100;
  const totEl = document.getElementById("split-total"); if (totEl) totEl.textContent = "฿" + fmt(total);
  const el = document.getElementById("split-remainder"); if (!el) return;
  if (Math.abs(rem) < 0.005 && total > 0) { el.className = "split-remainder ok"; el.textContent = "✓ Fully allocated — ฿0 left"; }
  else if (rem >= 0) { el.className = "split-remainder warn"; el.textContent = "฿" + fmt(rem) + " left to allocate"; }
  else { el.className = "split-remainder warn"; el.textContent = "฿" + fmt(-rem) + " over the total"; }
}
function refreshSplitCats() {
  [...document.querySelectorAll("#split-rows .split-row")].forEach(r => {
    const i = r.id.replace("split-row-","");
    const sel = document.getElementById("split-cat-"+i); if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = _splitCatOptions();
    if ([...sel.options].some(o=>o.value===prev)) sel.value = prev;
    sddSync("split-cat-"+i);
  });
}
function resetSplit() {
  _splitOn = false; _splitEditId = null;
  const rowsEl = document.getElementById("split-rows");
  if (rowsEl) { [...rowsEl.querySelectorAll(".split-row")].forEach(r => SDD_ENHANCED.delete("split-cat-"+r.id.replace("split-row-",""))); rowsEl.innerHTML = ""; }
  const ed = document.getElementById("split-editor"); if (ed) ed.style.display = "none";
  const tog = document.getElementById("toggle-split"); if (tog) tog.className = "toggle";
  const catField = document.getElementById("f-category-field"); if (catField) catField.style.display = "block";
  const btn = document.getElementById("btn-add-tx"); if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "Add Transaction"; }
}
async function submitSplitTx() {
  const total = parseFloat(document.getElementById("f-amount").value) || 0;
  const desc = document.getElementById("f-desc").value.trim();
  const date = getDateVal("f-date-d","f-date-m","f-date-y");
  const notes = document.getElementById("f-notes").value.trim();
  if (!total || total <= 0) { showToast("Enter a valid amount"); return; }
  if (!desc) { showToast("Enter a description"); return; }
  const items = _splitRows().filter(it => it.amount > 0 && it.cat);
  if (items.length < 2) { showToast("Add at least 2 split categories"); return; }
  const sum = items.reduce((s,it)=>s+it.amount,0);
  if (Math.abs(sum - total) > 0.01) { showToast("Splits must add up to ฿"+fmt(total)); return; }
  setBtn("btn-add-tx",true,"Add Transaction");
  const editing = !!_splitEditId;
  const splitId = editing ? _splitEditId : ("split-" + Date.now());
  const oldMembers = editing ? txs.filter(t => t.splitId === splitId) : [];
  const base = Date.now();
  const newTxs = items.map((it,idx) => ({ id: base + idx, date, type: currentType, category: it.cat, desc, amount: it.amount, notes, splitId }));
  if (editing) { const oldIds = new Set(oldMembers.map(m=>m.id)); txs = txs.filter(t => !oldIds.has(t.id)); unsyncedIds = unsyncedIds.filter(uid => !oldIds.has(uid)); }
  newTxs.forEach(t => txs.push(t)); saveTxs();
  if (settings.sheetsUrl && settings.autosync) {
    setSyncStatus("syncing");
    if (editing) {
      for (const m of oldMembers) { if (m.rowId) { deletedRowIds.add(m.rowId); saveDeletedRows(); } }
      for (const m of oldMembers) {
        const ok = await Promise.race([postToSheets("delete_transaction",{rowId:m.rowId,data:{desc:m.desc||"",amount:m.amount}}), new Promise(r=>setTimeout(()=>r(false),12000))]);
        if (ok && m.rowId) { deletedRowIds.delete(m.rowId); saveDeletedRows(); }
      }
    }
    const ok = await Promise.race([postToSheets("add_transactions_bulk",{data:newTxs}), new Promise(r=>setTimeout(()=>r(false),12000))]);
    if (ok) { showToast(editing?"Split updated + synced ✓":"Split added + synced ✓"); setSyncStatus("ok"); }
    else { newTxs.forEach(t=>unsyncedIds.push(t.id)); showToast("Saved locally — will sync later"); setSyncStatus("error"); }
  } else showToast(editing ? "Split updated ✓" : ("Split saved ✓ ("+items.length+" categories)"));
  localStorage.setItem("ft_unsynced",JSON.stringify(unsyncedIds));
  const wasEditing = editing; _splitEditId = null;
  flashBtn("btn-add-tx","Add Transaction","var(--slate-900)"); await delay(900); goTo(wasEditing ? "history" : "home");
}
async function deleteSplitGroup(splitId) {
  const members = txs.filter(t => t.splitId === splitId);
  if (!members.length) return;
  const total = members.reduce((s,m)=>s+m.amount,0);
  if (!(await appConfirm({title:"Delete this split?", message:members.length+" linked transactions (฿"+fmt(total)+") will be removed.", okText:"Delete all", cancelText:"Cancel", danger:true}))) return;
  const ids = new Set(members.map(m=>m.id));
  txs = txs.filter(t => !ids.has(t.id));
  unsyncedIds = unsyncedIds.filter(uid => !ids.has(uid));
  localStorage.setItem("ft_unsynced", JSON.stringify(unsyncedIds));
  saveTxs(); renderHistory(); renderHome();
  if (settings.sheetsUrl) {
    setSyncStatus("syncing");
    let allOk = true;
    for (const m of members) { const ok = await Promise.race([postToSheets("delete_transaction",{rowId:m.rowId,data:{date:m.date,desc:m.desc||"",amount:m.amount}}), new Promise(r=>setTimeout(()=>r(false),5000))]); if(!ok) allOk=false; }
    setSyncStatus(allOk?"ok":"error");
  }
  showToast("Split deleted");
}

async function submitTx() {
  if(document.getElementById("btn-add-tx").disabled)return;
  if (_splitOn) { return submitSplitTx(); }
  const amount=parseFloat(document.getElementById("f-amount").value),desc=document.getElementById("f-desc").value.trim(),date=getDateVal("f-date-d","f-date-m","f-date-y"),cat=document.getElementById("f-category").value,notes=document.getElementById("f-notes").value.trim();
  if(!amount||amount<=0){showToast("Enter a valid amount");return;} if(!desc){showToast("Enter a description");return;}
  setBtn("btn-add-tx",true,"Add Transaction");
  const tx={id:Date.now(),date,type:currentType,category:cat,desc,amount,notes}; txs.push(tx); saveTxs();
  if (isRecurring) {
    const existing = RECURRING.findIndex(r => r.desc === desc && r.category === cat);
    const recEntry = {id:tx.id, desc, category:cat, amount, type:currentType, notes};
    if (existing >= 0) RECURRING[existing] = recEntry; else RECURRING.push(recEntry);
    saveRecurring();
    showToast("Added as recurring ✓");
  }
  if(settings.sheetsUrl&&settings.autosync){setSyncStatus("syncing");const res=await Promise.race([postToSheetsRaw("add_transaction",{data:{...tx}}),new Promise(r=>setTimeout(()=>r(null),6000))]);if(res&&!res.error){if(res.rowId){const local=txs.find(t=>t.id===tx.id);if(local){local.rowId=res.rowId;saveTxs();}}showToast("Added + synced ✓");setSyncStatus("ok");}else{unsyncedIds.push(tx.id);localStorage.setItem("ft_unsynced",JSON.stringify(unsyncedIds));showToast("Saved locally — will sync later");setSyncStatus("error");}}
  else showToast("Transaction added ✓");
  flashBtn("btn-add-tx","Add Transaction","var(--slate-900)"); await delay(900); goTo("home");
}

async function submitGoal() {
  if(document.getElementById("btn-add-goal").disabled)return;
  const name=document.getElementById("g-name").value.trim(),target=parseFloat(document.getElementById("g-target").value)||0,saved=parseFloat(document.getElementById("g-saved").value)||0,monthly=parseFloat(document.getElementById("g-monthly").value)||0,due=safeDate(getMonthVal("g-due-m","g-due-y")),colorVal=document.getElementById("g-color").value.split(",");
  if(!name){showToast("Enter a goal name");return;} if(!target||target<=0){showToast("Enter a target amount");return;}
  setBtn("btn-add-goal",true,"Add Goal","var(--green)");
  const category=document.getElementById("g-category").value||"💰 Other";
  const newGoal={id:Date.now(),icon:name.match(/^\p{Emoji}/u)?.[0]||"🎯",name:name.replace(/^\p{Emoji}\s*/u,""),saved,target,monthly,color:colorVal[0],bg:colorVal[1]||"var(--slate-100)",due,category,spends:[]};
  GOALS.push(newGoal); saveGoals();
  if(settings.sheetsUrl&&settings.autosync){setSyncStatus("syncing");const ok=await Promise.race([postToSheets("add_goal",{data:{name,target,saved,monthly,due,color:colorVal[0]}}),new Promise(r=>setTimeout(()=>r(false),6000))]);if(ok){showToast("Goal added + synced ✓");setSyncStatus("ok");}else{showToast("Saved locally — sync timed out");setSyncStatus("error");}}
  else showToast("Goal saved ✓");
  flashBtn("btn-add-goal","Add Goal","var(--green)"); await delay(900); goTo("goals");
}

async function submitInst() {
  if(document.getElementById("btn-add-inst").disabled)return;
  const name=document.getElementById("i-name").value.trim(),total=parseFloat(document.getElementById("i-total").value)||0,monthly=parseFloat(document.getElementById("i-monthly").value)||0,totalMo=parseInt(document.getElementById("i-total-mo").value)||0,paid=parseInt(document.getElementById("i-paid").value)||0,cat=document.getElementById("i-category").value,color=document.getElementById("i-color").value;
  if(!name){showToast("Enter an item name");return;} if(!total||total<=0){showToast("Enter a total amount");return;} if(!monthly||monthly<=0){showToast("Enter monthly payment");return;} if(!totalMo||totalMo<=0){showToast("Enter total months");return;}
  setBtn("btn-add-inst",true,"Add Instalment","var(--indigo)");
  const startDate=getDateVal("i-start-d","i-start-m","i-start-y");
  INSTALLMENTS.push({id:Date.now(),icon:name.match(/^\p{Emoji}/u)?.[0]||"📦",name:name.replace(/^\p{Emoji}\s*/u,""),cat,total,monthly,paid:Math.min(paid,totalMo),total_mo:totalMo,color,startDate}); saveInsts();
  if(settings.sheetsUrl&&settings.autosync){setSyncStatus("syncing");const ok=await Promise.race([postToSheets("add_installment",{data:{name,category:cat,total,monthly,startDate,totalMonths:totalMo,monthsPaid:paid}}),new Promise(r=>setTimeout(()=>r(false),6000))]);if(ok){showToast("Instalment added + synced ✓");setSyncStatus("ok");}else{showToast("Saved locally — sync timed out");setSyncStatus("error");}}
  else showToast("Instalment saved ✓");
  flashBtn("btn-add-inst","Add Instalment","var(--indigo)"); await delay(900); goTo("installments");
}