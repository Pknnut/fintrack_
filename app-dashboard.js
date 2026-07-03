// FinTrack — Dashboard: dark mode toggle, Home, Safe to Spend (+ Estimated Bills card), Net Worth, Goals, Analytics.
// ══ DARK MODE ════════════════════════════════════════════════
function showSparkTip(tipId) {
  // Hide all other tips
  document.querySelectorAll(".spark-tip").forEach(t => t.style.display="none");
  const el = document.getElementById(tipId);
  if (!el) return;
  el.style.display = "block";
  // Auto-hide after 2 seconds
  setTimeout(() => { if(el) el.style.display="none"; }, 2000);
}
document.addEventListener("click", e => {
  if (!e.target.closest(".spark-bars")) {
    document.querySelectorAll(".spark-tip").forEach(t => t.style.display="none");
  }
});

function toggleDarkMode() {
  settings.darkMode = !settings.darkMode;
  saveSettings(); applyDarkMode(); renderSettings();
}
function applyDarkMode() {
  document.body.classList.toggle('dark', !!settings.darkMode);
  const btn = document.getElementById('toggle-dark');
  if (btn) btn.className = 'toggle' + (settings.darkMode ? ' on' : '');
}

// ══ HOME ═════════════════════════════════════════════════════
let chartPeriod = '1W';

function renderHome() {
  const arr=monthTxs();
  // Stat figures exclude goal-spends (funded from goals, not income) — matches Analytics & Budget.
  const {inc,exp}=calcSummary(arr.filter(t=>!isGoalSpend(t)));
  // "Current balance" is the running cash balance — sum of every transaction ever,
  // Goal contributions (toGoal) DO count here — that's real cash leaving spendable
  // balance the moment you set it aside. Spend-from-goal (fromGoal) does NOT count
  // here anymore — that same cash already left the balance when it was originally
  // contributed, so subtracting it again when spent would double-count the same
  // money. isGoalSpend() now matches both directions, so exclude only fromGoal here.
  const { net: allTimeBalance } = calcSummary(txs.filter(t => !(t.fromGoal===true && isGoalSpend(t))));
  document.getElementById("home-balance").textContent=fmt(allTimeBalance);
  document.getElementById("home-inc").textContent=fmt(inc);
  document.getElementById("home-exp").textContent=fmt(exp);
  renderSpendingChart();
  renderNetWorth();
  renderEstBillsHomeCard();
  // Recent list still shows every transaction (goal-spends included — they appear in History too).
  const recent=[...arr].sort((a,b)=>parseDate(b.date)-parseDate(a.date)).slice(0,5);
  const el=document.getElementById("home-tx-list");
  el.innerHTML=recent.length?recent.map(txRowHTML).join(''):'<div class="empty-state">No transactions this month</div>';
}

// ══ CASH FLOW FORECAST (multi-month projection) ══════════════
// Safe to Spend stretched across many months instead of one. Reuses the exact
// same sources: Recurring income/expenses (assumed to repeat indefinitely),
// Instalments (drop off automatically the month after their final payment — same
// math as the payoff timeline), and Estimated Bills flagged as repeating monthly
// (current amount used as a placeholder guess; one-off estimates are excluded —
// there's no signal for what a future month's one-time cost would be).
let forecastHorizon = 6;

function setForecastHorizon(n, btn) {
  forecastHorizon = n;
  if (btn) { btn.parentElement.querySelectorAll("button").forEach(b => b.classList.remove("on")); btn.classList.add("on"); }
  renderForecastPage();
}

// Pure calc, no DOM — returns one object per projected month, easy to reason about independently.
function calcForecastMonths(n) {
  const recurringIncome  = RECURRING.filter(r => (r.type||"Expense") === "Income").reduce((s,r)=>s+(r.amount||0), 0);
  const recurringExpense = RECURRING.filter(r => (r.type||"Expense") === "Expense").reduce((s,r)=>s+(r.amount||0), 0);
  const estRepeatingExpense = estBillsRepeatingExpenseTotal();
  const estRepeatingIncome  = estBillsRepeatingIncomeTotal();
  // Starting balance must exclude fromGoal spends, same as Home's Current Balance —
  // that cash already left spendable balance when it was originally contributed to
  // the goal (toGoal), so subtracting it again here when it's spent double-counts it.
  let balance = calcSummary(txs.filter(t => !(t.fromGoal===true && isGoalSpend(t)))).net; // today's actual all-time running balance
  const now = new Date();
  const months = [];
  for (let m = 1; m <= n; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    // Active by month m if its final payment hasn't happened yet: paid + (m-1) < total_mo.
    // m=1, 1 month left (paid=9,total_mo=10): 9<10 → included (this is the final payment).
    // m=2 for the same plan: 10<10 → false → dropped off, freeing that money going forward.
    const instExpense = INSTALLMENTS.filter(p => (p.paid + (m - 1)) < p.total_mo).reduce((s,p)=>s+(p.monthly||0), 0);
    const income  = recurringIncome + estRepeatingIncome;
    const expense = recurringExpense + instExpense + estRepeatingExpense;
    const net = income - expense;
    balance += net;
    months.push({ label: MO[d.getMonth()] + " " + d.getFullYear(), income, recurringExpense, instExpense, estRepeatingExpense, estRepeatingIncome, expense, net, balance });
  }
  return months;
}

function renderForecastPage() {
  const tableEl = document.getElementById("forecast-table");
  if (!tableEl) return;
  const months = calcForecastMonths(forecastHorizon);

  const hintEl = document.getElementById("forecast-hint");
  const hasIncomeSource = RECURRING.some(r => (r.type||"Expense")==="Income") || estBillsRepeatingIncomeTotal() > 0;
  if (hintEl) hintEl.style.display = hasIncomeSource ? "none" : "block";

  const avgNet = months.reduce((s,m)=>s+m.net, 0) / months.length;
  const avgEl = document.getElementById("forecast-avg-net");
  if (avgEl) { avgEl.textContent = (avgNet>=0?"+":"") + fmt(avgNet); avgEl.style.color = avgNet>=0 ? "var(--green-strong)" : "var(--red-strong)"; }
  const finalBalance = months[months.length-1].balance;
  const lblEl = document.getElementById("forecast-end-balance-label");
  if (lblEl) lblEl.textContent = "In " + forecastHorizon + " month" + (forecastHorizon!==1?"s":"");
  const balEl = document.getElementById("forecast-end-balance");
  if (balEl) { balEl.textContent = fmt(finalBalance); balEl.style.color = finalBalance>=0 ? "var(--slate-900)" : "var(--red-strong)"; }

  renderForecastChart(months);

  tableEl.innerHTML = months.map((m,i) => {
    const droppedOff = i>0 && m.instExp < months[i-1].instExp;
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:0.5px solid var(--slate-100)">' +
      '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--slate-800)">' + m.label + '</div>' +
      (droppedOff ? '<div style="font-size:9px;color:var(--green-text);margin-top:1px">an instalment finished — expenses dropped</div>' : '') + '</div>' +
      '<div style="text-align:right;min-width:70px;margin-right:8px"><div style="font-size:10px;color:var(--green-text)">+' + fmt(m.income,0) + '</div><div style="font-size:10px;color:var(--red-text)">−' + fmt(m.expense,0) + '</div></div>' +
      '<div style="text-align:right;min-width:72px;font-size:13px;font-weight:700;color:' + (m.balance>=0?'var(--slate-900)':'var(--red-strong)') + '">' + fmt(m.balance,0) + '</div>' +
    '</div>';
  }).join("");
}

// Hand-rolled inline SVG — bars for each month's net, a line for the running balance.
// No chart library: matches every other chart already in this app (Spending, Budget trend, Savings rate).
function renderForecastChart(months) {
  const svg = document.getElementById("forecast-chart-svg");
  if (!svg) return;
  const W = 300, H = 110, padT = 8, padB = 16, padX = 4;
  const chartH = H - padT - padB;
  const n = months.length;
  const lane = (W - padX*2) / n;
  const barW = Math.min(26, lane - 6);
  const maxNet = Math.max(...months.map(m=>Math.abs(m.net)), 1);
  const minBal = Math.min(...months.map(m=>m.balance), 0);
  const maxBal = Math.max(...months.map(m=>m.balance), 1);
  const balRange = Math.max(maxBal - minBal, 1);
  const zeroY = padT + chartH * 0.62;
  const barScale = (chartH * 0.55) / maxNet;

  const bars = months.map((m,i) => {
    const cx = padX + (i + 0.5) * lane;
    const bh = Math.max(Math.abs(m.net) * barScale, 1.5);
    const y = m.net >= 0 ? zeroY - bh : zeroY;
    const color = m.net >= 0 ? "var(--green-strong)" : "var(--red-strong)";
    return '<rect x="' + (cx-barW/2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + color + '" opacity="0.55"/>';
  }).join("");

  const pts = months.map((m,i) => {
    const x = padX + (i + 0.5) * lane;
    const y = padT + chartH - ((m.balance - minBal) / balRange) * chartH;
    return { x, y };
  });
  const lineStr = pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const dots = pts.map(p=>'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="2.5" fill="var(--indigo)"/>').join('');
  const labels = months.map((m,i) => {
    const x = padX + (i + 0.5) * lane;
    const show = n<=6 || i===0 || i===n-1 || i===Math.floor(n/2);
    return '<text x="'+x.toFixed(1)+'" y="'+(H-3)+'" font-size="8" fill="var(--slate-400)" text-anchor="middle">'+(show?m.label.split(" ")[0]:'')+'</text>';
  }).join("");

  svg.innerHTML =
    '<line x1="0" y1="' + zeroY.toFixed(1) + '" x2="' + W + '" y2="' + zeroY.toFixed(1) + '" stroke="var(--slate-200)" stroke-width="1"/>' +
    bars +
    '<path d="' + lineStr + '" fill="none" stroke="var(--indigo)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    dots + labels;
}

// Estimated bills get their own card on Home — same tier as Net Worth below —
// so the feature is visible without ever opening Settings. Shows the pending
// total plus a short preview list; "Manage" opens the full page.
function renderEstBillsHomeCard() {
  const el = document.getElementById("home-estbills-card");
  if (!el) return;
  if (!ESTIMATES.length) {
    el.innerHTML =
      '<div class="nw-card">' +
        '<div class="nw-card-hd"><span class="nw-card-title">Next month\'s forecast</span></div>' +
        '<p style="font-size:11px;color:var(--slate-400);margin:0 0 10px;line-height:1.5">Add bills or income you expect next month — like electric or credit card — to see them coming.</p>' +
        '<button onclick="openAddEstBillModal()" style="width:100%;padding:9px;border:1.5px dashed var(--slate-200);border-radius:var(--radius-sm);background:none;color:var(--slate-400);font-size:11px;font-weight:600;font-family:inherit;cursor:pointer">+ Add bill</button>' +
      '</div>';
    return;
  }
  const preview = ESTIMATES.filter(b => b).slice(0, 3);
  const extra = ESTIMATES.length - preview.length;
  const rowsHtml = preview.map(b => {
    const icon = (b.category||"").match(/^\S+/)?.[0] || "🔄";
    const isInc = b.type === "Income";
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:0.5px solid var(--slate-100);font-size:12px">' +
      '<span style="color:var(--slate-700)">' + icon + ' ' + (b.desc||"") + '</span>' +
      '<span style="font-weight:600;color:' + (isInc?'var(--green-strong)':'var(--slate-900)') + '">' + (isInc?'+':'−') + fmt(b.amount) + '</span>' +
    '</div>';
  }).join("") + (extra > 0 ? '<div style="font-size:10px;color:var(--slate-400);padding:5px 0 0">+' + extra + ' more</div>' : '');
  const totalIncome  = ESTIMATES.filter(b => b && b.type === "Income").reduce((s,b)=>s+(b.amount||0), 0);
  const totalExpense = ESTIMATES.filter(b => b && (b.type||"Expense") !== "Income").reduce((s,b)=>s+(b.amount||0), 0);
  const net = totalIncome - totalExpense;
  el.innerHTML =
    '<div class="nw-card">' +
      '<div class="nw-card-hd">' +
        '<span class="nw-card-title">Next month\'s forecast</span>' +
        '<span style="font-size:11px;font-weight:600;color:var(--teal);cursor:pointer" onclick="goTo(\'estbills\')">Manage →</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
        '<span style="font-size:9px;color:var(--slate-400)">Net forecast</span>' +
        '<span style="font-size:18px;font-weight:700;color:' + (net>=0?'var(--green-strong)':'var(--red-strong)') + '">' + (net>=0?'+':'') + fmt(net) + '</span>' +
      '</div>' +
      rowsHtml +
      '<button onclick="openAddEstBillModal()" style="width:100%;margin-top:8px;padding:8px;border:1.5px dashed var(--slate-200);border-radius:var(--radius-sm);background:none;color:var(--slate-400);font-size:11px;font-weight:600;font-family:inherit;cursor:pointer">+ Add bill</button>' +
    '</div>';
}

function renderNetWorth() {
  const el = document.getElementById("home-nw-card");
  if (!el) return;
  const goalSavings = GOALS.reduce((s,g)=>s+(g.saved||0), 0);
  const instDebt    = INSTALLMENTS.reduce((s,p)=>s+Math.max(p.total-p.monthly*p.paid,0), 0);
  const netWorth    = goalSavings - instDebt;
  const nwColor     = netWorth >= 0 ? "var(--green-strong)" : "var(--red-strong)";
  el.innerHTML =
    '<div class="nw-card">' +
      '<div class="nw-card-hd">' +
        '<span class="nw-card-title">Net worth snapshot</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">' +
        '<div style="background:#f0fdf4;border-radius:var(--radius-sm);padding:8px 10px">' +
          '<div style="font-size:9px;color:var(--green-text);margin-bottom:3px">Goal savings</div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--green-strong)">+'+fmt(goalSavings)+'</div>' +
        '</div>' +
        '<div style="background:var(--red-bg);border-radius:var(--radius-sm);padding:8px 10px">' +
          '<div style="font-size:9px;color:var(--red-text);margin-bottom:3px">Instalment debt</div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--red-strong)">−'+fmt(instDebt)+'</div>' +
        '</div>' +
      '</div>' +
      '<div style="height:1px;background:var(--slate-100);margin-bottom:8px"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<span style="font-size:11px;font-weight:600;color:var(--slate-500)">= Net worth</span>' +
        '<span style="font-size:18px;font-weight:700;color:'+nwColor+'">' + (netWorth>=0?"+":"") + fmt(netWorth) + '</span>' +
      '</div>' +
    '</div>';
}

function renderSpendingChart() {
  const today=new Date();
  let points=[], labels=[], avgPoints=null, tapRanges=[];
  if (chartPeriod==='1W') {
    points=Array(7).fill(0); labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    // Real calendar week (Monday–Sunday containing today), not a trailing 7 days
    // ending today. The old version showed the last 7 days but slapped fixed
    // Mon–Sun labels on them regardless of actual weekday — harmless when the
    // chart was just a picture, but wrong once taps navigate somewhere (tapping
    // "Mon" could land on a Saturday). getDay(): Sun=0..Sat=6; convert to how many
    // days back Monday is (Sun needs 6 days back, everything else needs day-1).
    const dow = today.getDay();
    const backToMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today); monday.setDate(today.getDate() - backToMonday);
    for(let i=0;i<7;i++){
      const d=new Date(monday); d.setDate(monday.getDate()+i); const ds=toDateStr(d);
      // Days later this week than today haven't happened yet — leave at 0 rather
      // than showing a misleading "nothing spent" for a day that just hasn't
      // arrived, but still include them so the week's shape is visible as it fills in.
      points[i] = d <= today ? txs.filter(t=>t.date===ds&&t.type==='Expense'&&!isGoalSpend(t)).reduce((s,t)=>s+t.amount,0) : 0;
      tapRanges[i]=[ds,ds];
    }
    document.querySelector('.chart-sub').textContent='Total spent this week';
    // Average line: same weekday, previous 4 calendar weeks — now a genuine
    // apples-to-apples comparison (this Monday vs the last 4 Mondays) since the
    // main series above is a real calendar week too.
    avgPoints=Array(7).fill(0);
    for(let i=0;i<7;i++){
      let sum=0;
      for(let w=1;w<=4;w++){const d=new Date(monday);d.setDate(monday.getDate()+i-(7*w));const ds=toDateStr(d);sum+=txs.filter(t=>t.date===ds&&t.type==='Expense'&&!isGoalSpend(t)).reduce((s,t)=>s+t.amount,0);}
      avgPoints[i]=sum/4;
    }
  } else if (chartPeriod==='1M') {
    points=Array(4).fill(0); labels=['Wk 1','Wk 2','Wk 3','Wk 4'];
    const weekStart=[null,null,null,null], weekEnd=[null,null,null,null];
    for(let i=29;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);const ds=toDateStr(d);const wi=Math.min(Math.floor((29-i)/7),3);points[wi]+=txs.filter(t=>t.date===ds&&t.type==='Expense'&&!isGoalSpend(t)).reduce((s,t)=>s+t.amount,0);if(!weekStart[wi])weekStart[wi]=ds;weekEnd[wi]=ds;}
    tapRanges=weekStart.map((s,i)=>[s,weekEnd[i]]);
    document.querySelector('.chart-sub').textContent='Total spent this month';
    // Same idea, one 30-day cycle back: each week-bucket compared to the same
    // bucket position 3 prior 30-day cycles (~3 months), averaged.
    avgPoints=Array(4).fill(0);
    for(let i=29;i>=0;i--){
      const wi=Math.min(Math.floor((29-i)/7),3);
      let sum=0;
      for(let c=1;c<=3;c++){const d=new Date(today);d.setDate(today.getDate()-i-(30*c));const ds=toDateStr(d);sum+=txs.filter(t=>t.date===ds&&t.type==='Expense'&&!isGoalSpend(t)).reduce((s,t)=>s+t.amount,0);}
      avgPoints[wi]+=sum/3;
    }
  } else {
    points=Array(3).fill(0);
    for(let i=2;i>=0;i--){const d=new Date(today.getFullYear(),today.getMonth()-i,1);labels.push(MO[d.getMonth()]);points[2-i]=txs.filter(t=>{const td=parseDate(t.date);return td.getMonth()===d.getMonth()&&td.getFullYear()===d.getFullYear()&&t.type==='Expense'&&!isGoalSpend(t);}).reduce((s,t)=>s+t.amount,0);const monthEnd=new Date(d.getFullYear(),d.getMonth()+1,0);tapRanges[2-i]=[toDateStr(d),toDateStr(monthEnd)];}
    document.querySelector('.chart-sub').textContent='Spending last 3 months';
    // No average line here — quarter-over-quarter comparison needs roughly a
    // year of history to mean anything, and most users won't have that yet.
  }
  document.getElementById("chart-amount").textContent=fmt(points.reduce((a,b)=>a+b,0));
  const dayRow=document.querySelector('.chart-section .chart-wrap > div:last-child');
  // Each label is tappable — jumps to History pre-filtered to that exact day
  // (1W), week (1M), or month (3M), so "what happened on that spike" is one tap
  // away instead of manually scrolling History to find it.
  if(dayRow) dayRow.innerHTML=labels.map((l,i)=>{
    const r=tapRanges[i];
    const onclick=r ? " onclick=\"goToHistoryForRange('"+r[0]+"','"+r[1]+"')\" style=\"cursor:pointer\"" : "";
    return '<span'+onclick+'>'+l+'</span>';
  }).join("");
  const W=300,H=60,pad=4,max=Math.max(...points,...(avgPoints||[0]),1);
  const pts=points.map((v,i)=>`${(i/(points.length-1))*(W-pad*2)+pad},${pad+(1-v/max)*(H-pad*2)}`);
  document.getElementById("chart-line").setAttribute("points",pts.join(" "));
  document.getElementById("chart-area").setAttribute("points",[...pts,`${W-pad},${H}`,`${pad},${H}`].join(" "));
  const avgLine=document.getElementById("chart-avg-line");
  const avgLegend=document.getElementById("chart-avg-legend");
  if (avgPoints && avgPoints.some(v=>v>0)) {
    const avgPts=avgPoints.map((v,i)=>`${(i/(avgPoints.length-1))*(W-pad*2)+pad},${pad+(1-v/max)*(H-pad*2)}`);
    avgLine.setAttribute("points",avgPts.join(" "));
    avgLine.style.display="";
    if (avgLegend) avgLegend.style.display="flex";
  } else {
    avgLine.setAttribute("points","");
    avgLine.style.display="none";
    if (avgLegend) avgLegend.style.display="none";
  }
}
function txRowHTML(t) {
  const isInc=t.type==="Income",d=parseDate(t.date),desc=t.desc||t.description||"";
  return '<div class="tx-row"><div class="tx-icon">'+(t.category||"").split(" ")[0]+'</div><div style="flex:1;min-width:0"><div class="tx-name">'+desc+'</div><div class="tx-sub">'+(t.category||"").replace(/^\S+\s/,"")+" · "+d.getDate()+" "+MO[d.getMonth()]+'</div></div><span class="tx-amt '+(isInc?'pos':'neg')+'">'+(isInc?"+":"-")+fmt(t.amount)+'</span></div>';
}

// ══ GOALS ═════════════════════════════════════════════════════
function toggleGoalsFilter() { const panel=document.getElementById("goals-filter-panel"),btn=document.getElementById("goals-filter-btn"); const isOpen=panel.classList.toggle("open"); btn.classList.toggle("active",isOpen); if(isOpen)buildGoalsYearDropdown(); }
function buildGoalsYearDropdown() {
  const years=[...new Set(GOALS.map(g=>g.due?g.due.split(" ")[1]:null).filter(Boolean))].sort();
  const sel=document.getElementById("goals-filter-year"),cur=sel.value;
  sel.innerHTML='<option value="">Any target year</option>'+years.map(y=>'<option value="'+y+'"'+(y===cur?' selected':'')+'>'+y+'</option>').join("");
  if (typeof sddSync==="function" && SDD_ENHANCED.has("goals-filter-year")) sddSync("goals-filter-year");
}
function clearGoalsFilters() { document.getElementById("goals-filter-status").value="all"; document.getElementById("goals-filter-year").value=""; if(SDD_ENHANCED.has("goals-filter-status"))sddSync("goals-filter-status"); if(SDD_ENHANCED.has("goals-filter-year"))sddSync("goals-filter-year"); renderGoals(); }
function clearGoalsTag(key) { if(key==="status"){document.getElementById("goals-filter-status").value="all";if(SDD_ENHANCED.has("goals-filter-status"))sddSync("goals-filter-status");} if(key==="year"){document.getElementById("goals-filter-year").value="";if(SDD_ENHANCED.has("goals-filter-year"))sddSync("goals-filter-year");} renderGoals(); }
// Calculate actual avg monthly savings toward a goal from tx history
function calcActualMonthlyContrib(g) {
  const contribs = g.contributions || [];
  if (!contribs.length) return 0;
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const dates = contribs.map(c => parseDate(c.date)).filter(d => !isNaN(d));
  if (!dates.length) return 0;
  const earliest = new Date(Math.min(...dates));
  const windowStart = earliest > sixMonthsAgo ? earliest : sixMonthsAgo;
  const recent = contribs.filter(c => { const d = parseDate(c.date); return !isNaN(d) && d >= windowStart; });
  const total = recent.reduce((s,c) => s + c.amount, 0);
  const monthsSpan = Math.max(1, (now.getFullYear()-windowStart.getFullYear())*12 + (now.getMonth()-windowStart.getMonth()) + 1);
  return total / monthsSpan;
}

function renderGoalsFilterTags(status,year) {
  const tags=[]; if(status!=="all")tags.push({label:status==="active"?"Active":"Completed",key:"status"}); if(year)tags.push({label:year,key:"year"});
  const btnLabel=document.getElementById("goals-filter-btn-label"); if(btnLabel)btnLabel.textContent=tags.length>0?"Filter ("+tags.length+")":"Filter";
  const btn=document.getElementById("goals-filter-btn"); if(btn)btn.classList.toggle("active",tags.length>0||document.getElementById("goals-filter-panel").classList.contains("open"));
  const el=document.getElementById("goals-active-filters"); if(!el)return;
  el.innerHTML=tags.map(t=>'<div class="goals-filter-tag">'+t.label+'<button onclick="clearGoalsTag(\''+t.key+'\')" aria-label="Remove filter">×</button></div>').join("");
}
function renderGoals() {
  const statusFilter=document.getElementById("goals-filter-status")?.value||"all",yearFilter=document.getElementById("goals-filter-year")?.value||"";
  renderGoalsFilterTags(statusFilter,yearFilter);
  const totalSaved=GOALS.reduce((s,g)=>s+g.saved,0),activeCount=GOALS.filter(g=>g.saved<g.target).length,avgPct=GOALS.length?Math.round(GOALS.reduce((s,g)=>s+(g.saved/g.target*100),0)/GOALS.length):0;
  document.getElementById("goals-total-saved").textContent=fmt(totalSaved); document.getElementById("goals-active").textContent=activeCount; document.getElementById("goals-avg-pct").textContent=avgPct+"%";
  if(!GOALS.length){document.getElementById("goals-list").innerHTML='<div class="empty-state">No goals yet — tap + to add one</div>';return;}
  let filtered=GOALS.map((g,idx)=>({g,idx}));
  if(statusFilter==="active")filtered=filtered.filter(({g})=>g.saved<g.target);
  if(statusFilter==="completed")filtered=filtered.filter(({g})=>g.saved>=g.target);
  if(yearFilter)filtered=filtered.filter(({g})=>g.due&&g.due.includes(yearFilter));
  if(!filtered.length){document.getElementById("goals-list").innerHTML='<div class="empty-state">No goals match this filter</div>';return;}
  document.getElementById("goals-list").innerHTML=filtered.map(({g,idx})=>{
    const pct=Math.min(Math.round(g.saved/g.target*100),100),isDone=g.saved>=g.target;
    // Dynamic projected completion based on actual avg monthly contribution
    let projLabel='';
    if (!isDone) {
      const actualMonthly = calcActualMonthlyContrib(g);
      if (actualMonthly > 0) {
        const monthsLeft = Math.ceil((g.target - g.saved) / actualMonthly);
        const projDate = new Date(); projDate.setMonth(projDate.getMonth() + monthsLeft);
        projLabel = 'On track: ' + MO[projDate.getMonth()] + ' ' + projDate.getFullYear();
      } else if (g.monthly > 0) {
        const monthsLeft = Math.ceil((g.target - g.saved) / g.monthly);
        const projDate = new Date(); projDate.setMonth(projDate.getMonth() + monthsLeft);
        projLabel = 'Est: ' + MO[projDate.getMonth()] + ' ' + projDate.getFullYear();
      }
    }
        // Build spend log rows (embedded directly into the history panel below —
        // previously this was built as a separate wrapped-in-its-own-div block and
        // then "unwrapped" via .replace('<div class="spend-log">','').replace('</div>','')
        // to embed it — but .replace() only removes the FIRST </div> match, which is
        // whichever inner row's closing tag happened to come first, not the actual
        // wrapper's matching close. That corrupted the DOM nesting and caused the
        // header text to visually overlap the rows below it. Building the rows
        // directly with no separate wrapper avoids the unwrap entirely.
    const spends = g.spends || [];
    const totalSpent = spends.reduce((s,sp)=>s+sp.amount,0);
    const spendLogRowsHtml = spends.map((sp,si)=>'<div class="spend-log-row"><div><div class="spend-log-desc">'+sp.desc+'</div><div class="spend-log-date">'+sp.date+'</div></div><div style="display:flex;align-items:center"><span class="spend-log-amt">−'+fmt(sp.amount)+'</span><button class="spend-log-del" onclick="deleteGoalSpend('+idx+','+si+')" aria-label="Delete spend">✕</button></div></div>'
      ).join('');
    const spendLogHtml = spends.length ?
      '<div class="spend-log-hd"><span>Spending log</span><span class="spend-log-bal">'+fmt(totalSpent)+' spent</span></div>' +
      spendLogRowsHtml +
      '<div class="spend-log-total"><span style="color:var(--slate-500)">Total spent</span><span style="color:var(--red-strong)">'+fmt(totalSpent)+'</span></div>'
      : '';
    // Build contribution log
    const contribs = g.contributions || [];
    const contribLogHtml = '<div class="contrib-log" id="contrib-log-'+idx+'" style="max-height:0">' +
      '<div style="height:1px;background:var(--slate-100);margin:10px 0"></div>' +
      '<div class="contrib-log-hd"><span>Savings contributions</span><span>'+contribs.length+' entries</span></div>' +
      (contribs.length ? contribs.slice().reverse().map((c,ci)=>{
        const realIdx = contribs.length - 1 - ci;
        return '<div class="contrib-log-row"><div><div class="contrib-log-note">'+(c.note||'—')+'</div><div class="contrib-log-date">'+c.date+'</div></div><div style="display:flex;align-items:center;gap:4px"><span class="contrib-log-amt">+'+fmt(c.amount)+'</span><button class="contrib-log-del" onclick="openEditContribModal('+idx+','+realIdx+')" aria-label="Edit contribution" style="color:var(--blue)">'+EDIT_PENCIL_SM+'</button><button class="contrib-log-del" onclick="deleteGoalContrib('+idx+','+realIdx+')" aria-label="Delete contribution"><i class="ti ti-x" style="font-size:11px"></i></button></div></div>';
      }).join('') : '<div style="font-size:11px;color:var(--slate-400);padding:8px 0;text-align:center">No contributions yet</div>') +
      // "Total saved" is g.saved itself — now always contributions minus spends
      // (see recalcGoalSaved), so this correctly nets out spending automatically
      // instead of showing the gross ever-contributed amount.
      (contribs.length ? '<div class="contrib-log-total"><span style="color:var(--slate-500)">Total saved (net)</span><span style="color:var(--green-strong)">'+fmt(g.saved)+'</span></div>' : '') +
      (spendLogHtml ? '<div style="height:1px;background:var(--slate-100);margin:10px 0"></div>'+spendLogHtml : '') +
    '</div>';
    return '<div class="goal-card"><div class="goal-top"><div style="display:flex;align-items:center;gap:8px"><div class="goal-icon-wrap" style="background:'+(g.bg||'var(--slate-100)')+'">'+(g.icon||'🎯')+'</div><div><div class="goal-name">'+g.name+'</div><div class="goal-saved">'+fmt(g.saved)+' saved of '+fmt(g.target)+(g.category?' · <span style="color:var(--slate-500)">'+g.category+'</span>':'')+( isDone?' · <span style="color:var(--green-strong);font-weight:600">Goal reached!</span>':'' )+'</div></div></div><div class="goal-pct" style="color:'+g.color+'">'+pct+'%</div></div><div class="goal-track"><div class="goal-fill" style="width:'+pct+'%;background:'+g.color+'"></div></div><div class="goal-footer"><span>'+(isDone?'🎉 Goal reached!':fmt(g.target-g.saved)+' remaining')+'</span><span style="color:'+(projLabel?'var(--teal)':'var(--slate-400)')+'">'+( isDone?'':projLabel||('Target: '+g.due) )+'</span></div><div class="goal-actions"><button class="goal-action-btn goal-save-btn" onclick="openGoalModal('+idx+')"'+(isDone?' disabled style="opacity:0.4"':'')+'>+ Add savings</button><button class="goal-action-btn goal-spend-btn" onclick="openSpendGoalModal('+idx+')"'+(isDone?'':' style="opacity:0.7"')+'>💸 Spend</button><button class="goal-action-btn goal-hist-btn" id="goal-hist-btn-'+idx+'" onclick="toggleContribLog('+idx+')">History</button><button class="goal-action-btn goal-edit-btn" onclick="openEditGoalModal('+idx+')" aria-label="Edit">'+EDIT_PENCIL+'</button><button class="goal-action-btn goal-delete-btn" onclick="deleteGoal('+idx+')">🗑️</button></div>'+contribLogHtml+'</div>';
  }).join("");
}
async function deleteGoal(idx) {
  const goal = GOALS[idx];
  if (!(await appConfirm({title:'Delete "' + goal.name + '"?', message:"This goal will be removed.", okText:"Delete", danger:true}))) return;
  // Check for linked goal-spend transactions
  const linkedTxs = txs.filter(t => t.fromGoal && t.goalName === goal.name);
  let deleteLinked = false;
  if (linkedTxs.length > 0) {
    deleteLinked = await appConfirm({
      title: "Delete linked transactions?",
      message: linkedTxs.length + ' transaction' + (linkedTxs.length > 1 ? 's' : '') +
        ' from "' + goal.name + '" exist in History (total: ' + fmt(linkedTxs.reduce((s,t)=>s+t.amount,0)) + ').',
      okText: "Delete them",
      cancelText: "Keep them",
      danger: true
    });
  }
  if (deleteLinked) {
    // Delete linked txs from local + Sheets
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
  GOALS.splice(idx, 1); saveGoals(); renderGoals();
  if (settings.sheetsUrl) {
    setSyncStatus("syncing");
    const ok = await Promise.race([postToSheets("delete_goal", {name:goal.name}), new Promise(r=>setTimeout(()=>r(false),6000))]);
    if (ok) { setSyncStatus("ok"); showToast("Goal deleted" + (deleteLinked ? " + " + linkedTxs.length + " transaction(s) removed" : "") + " ✓"); }
    else { setSyncStatus("error"); showToast("Deleted locally — Sheets sync failed"); }
  } else {
    showToast("Goal deleted" + (deleteLinked ? " + " + linkedTxs.length + " transaction(s) removed" : ""));
  }
}

// ══ ANALYTICS ════════════════════════════════════════════════
let _analyticsNow = new Date();
let analyticsMonth = _analyticsNow.getMonth(), analyticsYear = _analyticsNow.getFullYear(), analyticsPickerOpen = false;

function buildPeriodSelects(moSelId, yrSelId, curMo, curYr) {
  // Month select — all 12
  const moSel = document.getElementById(moSelId);
  if (moSel) moSel.innerHTML = MO.map((m, i) =>
    '<option value="' + i + '"' + (i === curMo ? ' selected' : '') + '>' + m + '</option>'
  ).join("");
  // Year select — all years with data + current + next
  const allYears = [...new Set(txs.map(t => parseDate(t.date).getFullYear()))];
  const nowYr = new Date().getFullYear();
  if (!allYears.includes(nowYr))     allYears.push(nowYr);
  if (!allYears.includes(nowYr + 1)) allYears.push(nowYr + 1);
  if (!allYears.includes(curYr))     allYears.push(curYr);
  allYears.sort();
  const yrSel = document.getElementById(yrSelId);
  if (yrSel) yrSel.innerHTML = allYears.map(y =>
    '<option value="' + y + '"' + (y === curYr ? ' selected' : '') + '>' + y + '</option>'
  ).join("");
}

function toggleAnalyticsDropdown() {
  analyticsPickerOpen = !analyticsPickerOpen;
  const picker = document.getElementById("an-picker");
  const chip   = document.getElementById("an-filter-chip");
  picker.classList.toggle("hidden", !analyticsPickerOpen);
  chip.classList.toggle("open", analyticsPickerOpen);
  if (analyticsPickerOpen) { buildPeriodSelects("an-sel-month", "an-sel-year", analyticsMonth, analyticsYear); sddEnhance("an-sel-year"); sddEnhance("an-sel-month"); }
}
function closeAnalyticsDropdown() {
  analyticsPickerOpen = false;
  document.getElementById("an-picker").classList.add("hidden");
  document.getElementById("an-filter-chip").classList.remove("open");
}
function applyAnalyticsPicker() {
  analyticsYear  = parseInt(document.getElementById("an-sel-year").value);
  analyticsMonth = parseInt(document.getElementById("an-sel-month").value);
  closeAnalyticsDropdown();
  renderAnalytics();
}
function analyticsGoToday() {
  const now = new Date();
  analyticsMonth = now.getMonth();
  analyticsYear  = now.getFullYear();
  closeAnalyticsDropdown();
  renderAnalytics();
}

let _activeDonutIdx = -1;
function handleDonutSvgTap(e) {
  const sorted=window._anSorted||[]; if(!sorted.length)return;
  const svg=document.getElementById("an-donut-svg"),rect=svg.getBoundingClientRect();
  const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,dx=e.clientX-cx,dy=e.clientY-cy,dist=Math.sqrt(dx*dx+dy*dy),R=rect.width*0.38;
  if(dist<R*0.55||dist>R*1.45){if(_activeDonutIdx>=0)closeDonutDetail();return;}
  const totalExp=window._anTotalExp||0; let angle=Math.atan2(dy,dx)+Math.PI/2; if(angle<0)angle+=2*Math.PI;
  let cumAngle=0;
  for(let i=0;i<sorted.length;i++){const arcAngle=(sorted[i][1]/totalExp)*2*Math.PI;if(angle<=cumAngle+arcAngle){toggleDonutDetail(i);return;}cumAngle+=arcAngle;}
}
function toggleDonutDetail(idx) { if(_activeDonutIdx===idx&&document.getElementById("an-donut-detail").classList.contains("visible")){closeDonutDetail();return;} openDonutDetail(idx); }
function openDonutDetail(idx) {
  const sorted=window._anSorted||[],arr=window._anArr||[],totalExp=window._anTotalExp||0; if(!sorted[idx])return;
  _activeDonutIdx=idx; const [cat,amt]=sorted[idx],color=CAT_COLORS[idx%CAT_COLORS.length],pct=totalExp>0?Math.round((amt/totalExp)*100):0,catName=cat.replace(/^\S+\s/,"");
  const txs_=arr.filter(t=>t.type==="Expense"&&t.category===cat).sort((a,b)=>b.amount-a.amount);
  document.getElementById("an-detail-dot").style.background=color; document.getElementById("an-detail-name").textContent=catName; document.getElementById("an-detail-amt").textContent=fmt(amt); document.getElementById("an-detail-pct").textContent=pct+"%"; document.getElementById("an-detail-count").textContent=txs_.length;
  document.getElementById("an-detail-txlist").innerHTML=txs_.map(t=>{const d=parseDate(t.date),desc=t.desc||t.description||"";return '<div class="an-detail-tx"><span class="an-detail-tx-desc">'+desc+'</span><span class="an-detail-tx-date">'+d.getDate()+' '+MO[d.getMonth()]+'</span><span class="an-detail-tx-amt">-'+fmt(t.amount)+'</span></div>';}).join("")||'<div style="font-size:11px;color:var(--slate-400);padding:6px 0">No transactions</div>';
  document.getElementById("an-donut-center-pct").textContent=pct+"%"; document.getElementById("an-donut-center-pct").setAttribute("fill",color); document.getElementById("an-donut-center-lbl").textContent=catName.length>9?catName.slice(0,9)+"…":catName; document.getElementById("an-donut-center-lbl").setAttribute("fill","var(--slate-700)");
  const arcEls=document.getElementById("an-donut-arcs").querySelectorAll("circle"); arcEls.forEach((el,i)=>{el.style.opacity=i===idx?"1":"0.25";});
  document.querySelectorAll(".an-donut-item").forEach((el,i)=>{el.classList.toggle("selected",i===idx);el.classList.toggle("dimmed",i!==idx);});
  const seeAllLbl = document.getElementById("an-detail-see-all-lbl");
  if (seeAllLbl) seeAllLbl.textContent = "See all " + catName + " in History";
  document.getElementById("an-donut-detail").classList.add("visible");
}
function donutGoToHistory() {
  const sorted = window._anSorted || [];
  if (_activeDonutIdx < 0 || !sorted[_activeDonutIdx]) return;
  const cat = sorted[_activeDonutIdx][0];
  const mo = analyticsMonth, yr = analyticsYear;
  closeDonutDetail();
  // Set history filters: Expense type, this category, analytics month+year
  goTo("history");
  // Apply filters AFTER goTo (which resets the History page on entry)
  histFilter = "Expense";
  const typeEl = document.getElementById("hist-filter-type");
  const catEl  = document.getElementById("hist-filter-cat");
  const moEl   = document.getElementById("hist-filter-month");
  const yrEl   = document.getElementById("hist-filter-year");
  if (typeEl) typeEl.value = "Expense";
  buildHistCategoryDropdown();
  if (catEl)  catEl.value  = cat;
  if (moEl)   moEl.value   = String(mo);
  if (yrEl)   yrEl.value   = String(yr);
  ["hist-filter-type","hist-filter-cat","hist-filter-month","hist-filter-year"].forEach(id=>{ if(SDD_ENHANCED.has(id)) sddSync(id); });
  // Open the advanced filter panel so the pill is visible
  const panel = document.getElementById("hist-adv-panel");
  const btn   = document.getElementById("hist-adv-btn");
  if (panel) panel.classList.add("open");
  if (btn)   btn.classList.add("active");
  renderHistory();
}

function closeDonutDetail() {
  _activeDonutIdx=-1; document.getElementById("an-donut-detail").classList.remove("visible");
  const savedPctEl=document.getElementById("an-donut-center-pct"),savedLblEl=document.getElementById("an-donut-center-lbl");
  if(savedPctEl)savedPctEl.setAttribute("fill","var(--slate-900)"); if(savedLblEl){savedLblEl.textContent="saved";savedLblEl.setAttribute("fill","var(--slate-400)");}
  const arcEls=document.getElementById("an-donut-arcs").querySelectorAll("circle"); arcEls.forEach(el=>{el.style.opacity="1";});
  document.querySelectorAll(".an-donut-item").forEach(el=>{el.classList.remove("selected","dimmed");});
}
// A goal-related transaction that shouldn't count as real spending — either a
// "spend from goal" (fromGoal: withdrawing already-saved money to actually use
// it) or a "goal contribution" (toGoal: money moving from spendable balance into
// a goal). Both are still typed Expense so Current Balance correctly reflects
// money leaving spendable cash, but neither should inflate Analytics/Budget
// "spending" stats — setting money aside isn't consumption, and spending money
// you'd already set aside isn't NEW spending either. The name stays isGoalSpend
// (not renamed to something broader) so all 19 existing call sites across the
// app automatically pick up contributions too, with zero changes needed at
// each site.
// Prefer goalId (rename-proof); fall back to goalName for legacy rows not yet backfilled.
function isGoalSpend(t) {
  if (t.type !== "Expense" || (t.fromGoal !== true && t.toGoal !== true)) return false;
  if (t.goalId != null) return GOALS.some(g => g.id === t.goalId);
  return !!t.goalName && GOALS.some(g => g.name === t.goalName);
}
// Current display name for a goal-spend — looked up by id so it never goes stale.
function goalSpendName(t) {
  if (t.goalId != null) { const g = GOALS.find(g => g.id === t.goalId); if (g) return g.name; }
  return t.goalName || "Goal";
}
// Current display name for an instalment-paid transaction — looked up by id (set in
// confirmMarkPaid/confirmEarlyPayoff), mirrors goalSpendName so it survives plan renames.
function instSpendName(t) {
  const p = INSTALLMENTS.find(p => p.id === t.instId);
  return p ? p.name : "Instalment";
}
function renderAnalytics() {
  const mo=analyticsMonth,yr=analyticsYear,allArr=monthTxs(mo,yr);
  // Goal transactions (contributions and spends) are excluded from the headline
  // stats below — saving money isn't spending it, and spending already-saved
  // money isn't new spending either. See isGoalSpend() in this file.
  const arr = allArr.filter(t => !isGoalSpend(t));
  const {inc,exp,net,rate}=calcSummary(arr);
  document.getElementById("an-filter-label").textContent=MO[mo]+" "+yr; document.getElementById("an-year-label").textContent="Yearly overview";
  const netEl=document.getElementById("an-net"); document.getElementById("an-inc").textContent=fmt(inc); document.getElementById("an-exp").textContent=fmt(exp); netEl.textContent=fmt(net); netEl.style.color=net>=0?"var(--green-strong)":"var(--red-strong)"; document.getElementById("an-rate").textContent=Math.round(rate*100)+"%";
  const catMap={}; arr.filter(t=>t.type==="Expense").forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
  const sorted=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8),totalExp=sorted.reduce((s,[,v])=>s+v,0),savedPct=inc>0?Math.round((net/inc)*100):0;
  document.getElementById("an-donut-center-pct").textContent=savedPct+"%";
  const R=42,CX=55,CY=55,CIRCUMFERENCE=2*Math.PI*R,arcsEl=document.getElementById("an-donut-arcs");
  if(sorted.length===0){arcsEl.innerHTML='<circle cx="55" cy="55" r="42" fill="none" stroke="var(--slate-200)" stroke-width="16"/>';}
  else{let offset=-CIRCUMFERENCE/4;arcsEl.innerHTML=sorted.map(([cat,amt],i)=>{const pct=amt/totalExp,dash=pct*CIRCUMFERENCE,gap=CIRCUMFERENCE-dash,arc='<circle cx="'+CX+'" cy="'+CY+'" r="'+R+'" fill="none" stroke="'+CAT_COLORS[i%CAT_COLORS.length]+'" stroke-width="16" stroke-dasharray="'+dash.toFixed(2)+' '+gap.toFixed(2)+'" stroke-dashoffset="'+(-offset).toFixed(2)+'" style="transition:stroke-dasharray 0.4s ease"/>';offset+=dash;return arc;}).join("");}
  window._anSorted=sorted; window._anArr=arr; window._anTotalExp=totalExp;
  const legendEl=document.getElementById("an-donut-legend");
  if(sorted.length===0){legendEl.innerHTML='<div style="font-size:12px;color:var(--slate-400);padding:8px 0">No expense data for '+MO[mo]+' '+yr+'</div>';}
  else{legendEl.innerHTML=sorted.map(([cat,amt],i)=>{const pct=totalExp>0?Math.round((amt/totalExp)*100):0,name=cat.replace(/^\S+\s/,"");return '<div class="an-donut-item" onclick="toggleDonutDetail('+i+')"><div class="an-donut-dot" style="background:'+CAT_COLORS[i%CAT_COLORS.length]+'"></div><span class="an-donut-name">'+name+'</span><span class="an-donut-pct">'+pct+'%</span><span class="an-donut-arrow">›</span></div>';}).join("");}
  closeDonutDetail();
  const yearArr=yearTxs(yr).filter(t=>!isGoalSpend(t)),yInc=yearArr.filter(t=>t.type==="Income").reduce((s,t)=>s+t.amount,0),yExp=yearArr.filter(t=>t.type==="Expense").reduce((s,t)=>s+t.amount,0),yNet=yInc-yExp,yRate=yInc>0?Math.round((yNet/yInc)*100):0,netColor=yNet>=0?"var(--green-strong)":"var(--red-strong)";
  document.getElementById("an-year-summary").innerHTML='<div class="an-year-summ-box"><div class="an-year-summ-val" style="color:var(--green-strong)">'+fmt(yInc)+'</div><div class="an-year-summ-lbl">Year income</div></div><div class="an-year-summ-box"><div class="an-year-summ-val" style="color:var(--red-strong)">'+fmt(yExp)+'</div><div class="an-year-summ-lbl">Year expenses</div></div><div class="an-year-summ-box"><div class="an-year-summ-val" style="color:'+netColor+'">'+fmt(yNet)+'</div><div class="an-year-summ-lbl">Year net</div></div><div class="an-year-summ-box"><div class="an-year-summ-val">'+yRate+'%</div><div class="an-year-summ-lbl">Year rate</div></div>';
  // Month-over-month comparison (Layout 3 — delta section)
  renderMoM(mo, yr);
  // Savings rate trend
  renderSavingsRateTrend();
}

function renderSavingsRateTrend() {
  const svgEl  = document.getElementById("rate-chart-svg");
  const axisEl = document.getElementById("rate-chart-axis");
  if (!svgEl || !axisEl) return;
  const now = new Date();
  const months = [], labels = [], rates = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d);
    labels.push(MO[d.getMonth()].slice(0,3));
    const arr = txs.filter(t => {
      const td = parseDate(t.date);
      return td.getMonth()===d.getMonth() && td.getFullYear()===d.getFullYear() && !isGoalSpend(t);
    });
    const inc = arr.filter(t=>t.type==="Income").reduce((s,t)=>s+t.amount,0);
    const exp = arr.filter(t=>t.type==="Expense").reduce((s,t)=>s+t.amount,0);
    const rate = inc > 0 ? Math.max(0, Math.min(100, Math.round(((inc-exp)/inc)*100))) : null;
    rates.push(rate);
  }
  const hasData = rates.some(r => r !== null);
  if (!hasData) { svgEl.innerHTML = '<div style="font-size:11px;color:var(--slate-400);text-align:center;padding:12px 0">No data yet</div>'; return; }
  const W=300, H=64, pad=4;
  const valid = rates.map((r,i)=>r!==null?i:-1).filter(i=>i>=0);
  const nonNull = rates.filter(r=>r!==null);
  const maxR = Math.max(...nonNull, 1);
  const pts = rates.map((r,i) => {
    const x = pad + (i/(rates.length-1))*(W-pad*2);
    const y = r===null ? null : pad + (1 - r/100)*(H-pad*2);
    return {x, y, r};
  }).filter(p=>p.y!==null);
  const lineStr = pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const areaStr = pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')
    + ' L'+pts[pts.length-1].x.toFixed(1)+','+(H-pad)+' L'+pts[0].x.toFixed(1)+','+(H-pad)+' Z';
  svgEl.innerHTML =
    '<svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" style="display:block">' +
      '<defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--teal)" stop-opacity="0.2"/><stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="'+areaStr+'" fill="url(#rg)"/>' +
      '<path d="'+lineStr+'" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      pts.map(p=>'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="var(--teal)"/>').join('') +
      pts.map(p=>'<text x="'+p.x.toFixed(1)+'" y="'+(p.y-7).toFixed(1)+'" text-anchor="middle" font-size="8" fill="var(--teal)">'+p.r+'%</text>').join('') +
    '</svg>';
  // Show only first, middle, last labels to avoid crowding
  axisEl.innerHTML = labels.map((l,i) =>
    (i===0||i===5||i===11) ? '<span>'+l+'</span>' : '<span></span>'
  ).join('');
}

function renderMoM(mo, yr) {
  const momEl  = document.getElementById('mom-section');
  const momLbl = document.getElementById('mom-section-label');
  const momCon = document.getElementById('mom-container');
  if (!momEl) return;

  let prevMo = mo - 1, prevYr = yr;
  if (prevMo < 0) { prevMo = 11; prevYr = yr - 1; }

  const currArr = monthTxs(mo, yr).filter(t => t.type === 'Expense');
  const prevArr = monthTxs(prevMo, prevYr).filter(t => t.type === 'Expense');
  if (momLbl) momLbl.textContent = 'vs ' + MO[prevMo] + ' ' + prevYr;

  // ── Option C: previous month has zero data → show notice only ──
  if (prevArr.length === 0) {
    momEl.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 0;font-size:11px;color:var(--slate-400)">' +
        '<i class="ti ti-calendar-stats" style="font-size:15px"></i>' +
        'No data for ' + MO[prevMo] + ' ' + prevYr + ' — nothing to compare' +
      '</div>';
    return;
  }

  // ── Option E: some data exists ────────────────────────────────
  const currMap = {}, prevMap = {};
  currArr.forEach(t => { currMap[t.category] = (currMap[t.category]||0) + t.amount; });
  prevArr.forEach(t => { prevMap[t.category] = (prevMap[t.category]||0) + t.amount; });

  const allCats = [...new Set([...Object.keys(currMap), ...Object.keys(prevMap)])];

  // Categorise each
  const catsUp = [], catsDn = [], catsNew = [], catsFlat = [];
  allCats.forEach(cat => {
    const curr = currMap[cat] || 0, prev = prevMap[cat] || 0;
    if (prev === 0) { catsNew.push(cat); return; }
    const delta = curr - prev;
    if (delta > 0) catsUp.push(cat);
    else if (delta < 0) catsDn.push(cat);
    else catsFlat.push(cat);
  });
  // Sort each group by curr amount desc
  const byCurr = (a,b) => (currMap[b]||0) - (currMap[a]||0);
  catsUp.sort(byCurr); catsDn.sort(byCurr); catsNew.sort(byCurr); catsFlat.sort(byCurr);

  const totalCurr = currArr.reduce((s,t) => s+t.amount, 0);
  const totalPrev = prevArr.reduce((s,t) => s+t.amount, 0);
  const totalDelta = totalCurr - totalPrev;
  const totalPct   = totalPrev > 0 ? Math.round((totalDelta/totalPrev)*100) : 0;
  const totalCls   = totalDelta > 0 ? 'up' : totalDelta < 0 ? 'dn' : 'flat';
  const totalSign  = totalDelta > 0 ? '+' : '';

  // Is prev month sparse? (fewer than 3 categories)
  const isSparse = Object.keys(prevMap).length < 3;

  // Build cat row HTML
  function catRowHtml(cat) {
    const curr = currMap[cat] || 0, prev = prevMap[cat] || 0;
    const isNew = prev === 0;
    const delta = curr - prev;
    const pct   = prev > 0 ? Math.round((delta/prev)*100) : 0;
    const cls   = isNew ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'dn' : 'flat';
    const sign  = delta > 0 ? '+' : '';
    const badge = isNew ? 'New' : delta === 0 ? '—' : sign+pct+'%';
    const prevTxt = isNew ? '' : fmt(prev) + ' → ';
    return '<div class="mom-row">' +
      '<span class="mom-cat">' + cat + '</span>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:10px;color:var(--slate-400)">' + prevTxt + fmt(curr) + '</span>' +
        '<span class="mom-delta ' + cls + '">' + badge + '</span>' +
      '</div></div>';
  }

  // Build grouped expandable list
  function groupHtml(cats, label, color) {
    if (!cats.length) return '';
    return '<div class="mom-group-lbl" style="color:' + color + '">' + label + '</div>' +
      cats.map(catRowHtml).join('');
  }

  const expandedId = 'mom-expand-' + mo + '-' + yr;
  const listHtml =
    groupHtml(catsUp,   '<i class="ti ti-arrow-up" style="font-size:10px"></i> Spending up',   '#991b1b') +
    groupHtml(catsDn,   '<i class="ti ti-arrow-down" style="font-size:10px"></i> Spending down','#166534') +
    groupHtml(catsNew,  'New this month',                                                        '#3730a3') +
    groupHtml(catsFlat, 'Unchanged',                                                             '#64748b');

  // Pills
  let pillsHtml = '<div class="mom-pill-strip">';
  if (catsUp.length)   pillsHtml += '<span class="mom-pill up"><i class="ti ti-arrow-up" style="font-size:11px"></i>' + catsUp.length + ' up</span>';
  if (catsDn.length)   pillsHtml += '<span class="mom-pill dn"><i class="ti ti-arrow-down" style="font-size:11px"></i>' + catsDn.length + ' down</span>';
  if (catsNew.length)  pillsHtml += '<span class="mom-pill new">' + catsNew.length + ' new</span>';
  pillsHtml += '</div>';

  // Sparse warning
  const warnHtml = isSparse
    ? '<div class="mom-warn"><i class="ti ti-alert-triangle" style="font-size:13px;flex-shrink:0"></i>' +
      MO[prevMo] + ' had very little data — percentages may be unreliable</div>'
    : '';

  // Net row
  const netHtml =
    '<div class="mom-net-row">' +
      '<span style="font-size:12px;color:var(--slate-500)">Total expenses</span>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:10px;color:var(--slate-400)">' + fmt(totalPrev) + ' → ' + fmt(totalCurr) + '</span>' +
        '<span class="mom-delta ' + totalCls + '">' + totalSign + totalPct + '%</span>' +
      '</div>' +
    '</div>';

  momEl.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
      '<span style="font-size:11px;color:var(--slate-400)">' + MO[prevMo] + ' ' + prevYr + '</span>' +
      '<button class="mom-see-all" onclick="toggleMoMExpand(\x27' + expandedId + '\x27, this)">See all ›</button>' +
    '</div>' +
    pillsHtml +
    warnHtml +
    netHtml +
    '<div class="mom-expand-list" id="' + expandedId + '" style="max-height:0">' +
      listHtml +
    '</div>';
}

function toggleMoMExpand(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.style.maxHeight !== '0px' && el.style.maxHeight !== '';
  el.style.maxHeight = isOpen ? '0' : el.scrollHeight + 'px';
  btn.textContent = isOpen ? 'See all ›' : 'Collapse ‹';
}