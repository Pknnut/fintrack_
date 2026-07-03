// FinTrack — Google Apps Script Backend
// Deploy as Web App: Execute as Me, Anyone can access

const SHEET_NAME_TX   = "📋 Transactions";
const SHEET_NAME_INST = "📅 Installments";
const DATA_START_ROW  = 5;

function doGet(e) {
  try {
    const action = e.parameter.action || "get_transactions";
    if (action === "get_transactions") return jsonResponse(getTransactions());
    if (action === "get_installments") return jsonResponse(getInstallments());
    if (action === "get_goals")        return jsonResponse(getGoals());
    if (action === "get_summary")      return jsonResponse(getSummary(e.parameter.month, e.parameter.year));
    if (action === "get_budgets")      return jsonResponse(getBudgets());
    if (action === "get_recurring")    return jsonResponse(getRecurring());
    if (action === "get_estbills")     return jsonResponse(getEstimatedBills());
    if (action === "ping")             return jsonResponse({ status: "ok", version: "2026-07-02-lock-fix", timestamp: new Date().toISOString() });
    if (action === "rebuild_analytics") return jsonResponse(rebuildAnalyticsSheet());
    if (action === "rebuild_installment_log") return jsonResponse(regenerateInstallmentLog());
    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) { return jsonResponse({ error: err.message }, 500); }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === "add_transaction")         return jsonResponse(addTransaction(body.data));
    if (action === "add_transactions_bulk")   return jsonResponse(addTransactionsBulk(body.data));
    if (action === "add_goal")                return jsonResponse(addGoal(body.data));
    if (action === "add_installment")         return jsonResponse(addInstallment(body.data));
    if (action === "update_transaction")      return jsonResponse(updateTransaction(body.rowId, body.data));
    if (action === "update_goal")             return jsonResponse(updateGoal(body.oldName, body.data));
    if (action === "update_goal_saved")       return jsonResponse(updateGoalSaved(body.data));
    if (action === "update_installment")      return jsonResponse(updateInstallment(body.oldName, body.data));
    if (action === "update_installment_paid") return jsonResponse(updateInstallmentPaidByName(body.planName, body.monthsPaid));
    if (action === "delete_transaction")      return jsonResponse(deleteTransaction(body.rowId, body.data));
    if (action === "delete_goal")             return jsonResponse(deleteGoal(body.name));
    if (action === "delete_installment")      return jsonResponse(deleteInstallment(body.name));
    if (action === "rebuild_installment_log") return jsonResponse(regenerateInstallmentLog());
    if (action === "save_budgets")            return jsonResponse(saveBudgets(body.budgets));
    if (action === "save_recurring")          return jsonResponse(saveRecurringToSheet(body.recurring));
    if (action === "save_estbills")           return jsonResponse(saveEstimatedBillsToSheet(body.estimates));
    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) { return jsonResponse({ error: err.message }, 500); }
}

// ══════════════════════════════════════════════════════════════
// READ
// ══════════════════════════════════════════════════════════════

function getTransactions() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_TX);
  const lastDataRow = getFirstEmptyRow(sheet, DATA_START_ROW) - 1;
  if (lastDataRow < DATA_START_ROW) return { transactions: [] };
  const vals = sheet.getRange(DATA_START_ROW, 1, lastDataRow - DATA_START_ROW + 1, 10).getValues();
  const transactions = [];
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    if (r[0] === "" || r[4] === "") continue;
    // Col I (r[8]) holds the goal name for any goal-related transaction (spend or
    // contribution); Col J (r[9]) disambiguates which — "goal:ID" for a spend,
    // "goalcontrib:ID" for a contribution. We deliberately do NOT use col I alone
    // to decide fromGoal vs toGoal — stray text there used to be misread as a goal
    // name, wrongly flagging normal transactions as goal spends.
    const colI     = r[8];
    const colJ     = r[9];
    const goalName = (typeof colI === "string" && colI !== "" && colI !== "TRUE" && colI !== "FALSE")
                     ? colI
                     : "";
    const colJStr    = typeof colJ === "string" ? colJ : "";
    const isGoalSpendRow   = colJStr.indexOf("goal:") === 0;
    const isGoalContribRow = colJStr.indexOf("goalcontrib:") === 0;
    // Legacy rows from before contributions existed only ever had the spend prefix
    // (or just a bare goal name in Col I with no prefix at all) — treat those as
    // spends by default, same as always, so nothing already in a sheet changes meaning.
    const fromGoal = isGoalContribRow ? false : (goalName !== "" || colI === true || colI === "TRUE" || colI === 1);
    const toGoal   = isGoalContribRow;
    transactions.push({
      rowId: DATA_START_ROW + i, date: formatDate(r[0]),
      type: r[1], category: r[2], description: r[3], desc: r[3],
      amount: Number(r[4]) || 0, notes: r[5] || "",
      fromGoal: fromGoal,
      toGoal: toGoal,
      goalName: goalName,
      goalId: isGoalSpendRow ? (Number(colJStr.slice(5)) || null)
            : isGoalContribRow ? (Number(colJStr.slice(12)) || null)
            : null,
      splitId: (isGoalSpendRow || isGoalContribRow) ? "" : ((colJ !== "" && colJ != null) ? String(colJ) : "")
    });
  }
  return { transactions };
}

function getInstallments() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_INST);
  if (!sheet) return { installments: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { installments: [] };
  const vals = sheet.getRange(6, 1, lastRow - 5, 10).getValues();
  const installments = vals.filter(r => r[0] !== "").map((r, i) => ({
    row: i + 6, name: r[0], category: r[1],
    total: Number(r[2]) || 0, monthly: Number(r[3]) || 0,
    startDate: formatDate(r[4]), totalMonths: Number(r[5]) || 0,
    monthsPaid: Number(r[6]) || 0, monthsLeft: Number(r[7]) || 0,
    amountPaid: Number(r[8]) || 0, balance: Number(r[9]) || 0
  }));
  return { installments };
}

// Goals previously had NO pull-back route at all — only ever pushed (addGoal,
// updateGoal, updateGoalSaved), never fetched. This recovers name/saved/target/
// monthly/due — the columns this sheet actually stores. Contribution history and
// goal-spend logs are local-only concepts with no Sheets column, so they can't be
// recovered this way; only the goal itself (and its current saved total) comes back.
function getGoals() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("🎯 Goals");
  if (!sheet) return { goals: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { goals: [] };
  const vals = sheet.getRange(6, 1, lastRow - 5, 7).getValues();
  const goals = vals.filter(r => r[0] !== "").map((r, i) => ({
    row: i + 6, name: r[0],
    saved: Number(r[1]) || 0, target: Number(r[2]) || 0,
    monthly: Number(r[4]) || 0, due: formatDate(r[6])
  }));
  return { goals };
}

function getSummary(filterMonth, filterYear) {
  const txData = getTransactions().transactions;
  const now    = new Date();
  const mo     = (filterMonth !== undefined) ? parseInt(filterMonth) : now.getMonth();
  const yr     = (filterYear  !== undefined) ? parseInt(filterYear)  : now.getFullYear();

  const filtered = txData.filter(t => {
    const d = parseDate(t.date);
    return d && d.getMonth() === mo && d.getFullYear() === yr;
  });
  const income  = filtered.filter(t => t.type === "Income").reduce((s, t) => s + t.amount, 0);
  const expense = filtered.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
  const net     = income - expense;

  const yearData = txData.filter(t => {
    const d = parseDate(t.date);
    return d && d.getFullYear() === yr;
  });

  const monthlyBreakdown = [];
  for (let m = 0; m < 12; m++) {
    const mData    = yearData.filter(t => { const d = parseDate(t.date); return d && d.getMonth() === m; });
    const mInc     = mData.filter(t => t.type === "Income").reduce((s, t)  => s + t.amount, 0);
    const mExp     = mData.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
    const mNet     = mInc - mExp;
    const mTxs     = mData.filter(t => t.type === "Expense");
    const mAvg     = mTxs.length > 0 ? mExp / mTxs.length : 0;
    const mBiggest = mTxs.length > 0 ? Math.max(...mTxs.map(t => t.amount)) : 0;
    monthlyBreakdown.push({ month: m, income: mInc, expense: mExp, net: mNet,
      savingsRate: mInc > 0 ? mNet / mInc : 0, txCount: mData.length,
      avgTxSize: mAvg, biggestExpense: mBiggest });
  }

  const yearInc = yearData.filter(t => t.type === "Income").reduce((s, t)  => s + t.amount, 0);
  const yearExp = yearData.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);

  return {
    month: mo, year: yr,
    income, expense, net,
    savingsRate: income > 0 ? net / income : 0,
    transactionCount: filtered.length,
    yearIncome: yearInc, yearExpense: yearExp, yearNet: yearInc - yearExp,
    yearSavingsRate: yearInc > 0 ? (yearInc - yearExp) / yearInc : 0,
    monthlyBreakdown
  };
}

// ══════════════════════════════════════════════════════════════
// WRITE — Transactions
// Col I = goalName (goal spend) or "" (normal tx) — replaces old boolean fromGoal
// Col J = "" (kept for column count compatibility)
// ══════════════════════════════════════════════════════════════

function addTransaction(data) {
  // Apps Script can run overlapping doPost requests. Without a lock, two concurrent
  // calls can both read getFirstEmptyRow() before either has written anything, land
  // on the SAME row, and the second write silently overwrites the first — the loser
  // still gets back {success:true, rowId:X}, so the client has no way to know it lost
  // the race. The row genuinely never existed, which is what caused a recurring-logged
  // transaction to report success and sync a rowId, yet never actually appear in Sheets.
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET_NAME_TX);
    const lastRow = getFirstEmptyRow(sheet, DATA_START_ROW);
    const dateVal = new Date(data.date);
    const desc    = data.description || data.desc || "";
    const fromGoal = data.fromGoal === true || data.fromGoal === "true";
    const toGoal   = data.toGoal === true || data.toGoal === "true";
    const goalName = data.goalName || "";
    sheet.getRange(lastRow, 1, 1, 10).setValues([[
      Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "yyyy-MM-dd"),
      data.type, data.category, desc,
      Number(data.amount), data.notes || "",
      dateVal.getMonth() + 1, getWeekNumber(dateVal),
      (fromGoal || toGoal) ? goalName : "",  // Col I: goal name if goal spend or contribution, else blank
      fromGoal ? ("goal:" + (data.goalId || "")) : toGoal ? ("goalcontrib:" + (data.goalId || "")) : (data.splitId || "")  // Col J: goal:ID (spend) / goalcontrib:ID (contribution) / splitId
    ]]);
    const rowBg = (fromGoal || toGoal) ? "#FFFBEB" : (data.type === "Income" ? "#ECFDF5" : "#FEF2F2");
    sheet.getRange(lastRow, 1, 1, 10).setBackground(rowBg);
    SpreadsheetApp.flush();
    return { success: true, rowId: lastRow, message: "Transaction added" };
  } finally {
    lock.releaseLock();
  }
}

function addTransactionsBulk(transactions) {
  const results = transactions.map(t => addTransaction(t));
  return { success: true, added: results.filter(r => r.success).length };
}

function updateTransaction(rowId, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const sheet       = ss.getSheetByName(SHEET_NAME_TX);
  const lastDataRow = getFirstEmptyRow(sheet, DATA_START_ROW) - 1;
  if (lastDataRow < DATA_START_ROW) return { error: "No transactions found" };

  const vals = sheet.getRange(DATA_START_ROW, 1, lastDataRow - DATA_START_ROW + 1, 5).getValues();
  let targetRow = -1;

  if (rowId && rowId >= DATA_START_ROW && rowId <= lastDataRow) {
    targetRow = rowId;
  }

  if (targetRow < 0 && data.oldDesc && data.oldAmount) {
    const oldDesc   = String(data.oldDesc).trim().toLowerCase();
    const oldAmount = Number(data.oldAmount);
    for (let i = vals.length - 1; i >= 0; i--) {
      const rowDesc   = String(vals[i][3] || "").trim().toLowerCase();
      const rowAmount = Number(vals[i][4]) || 0;
      if (rowDesc === oldDesc && rowAmount === oldAmount) {
        targetRow = DATA_START_ROW + i; break;
      }
    }
  }

  if (targetRow < 0) return { error: "Transaction not found" };

  const dateVal  = new Date(data.date);
  const desc     = data.description || data.desc || "";
  const fromGoal = data.fromGoal === true || data.fromGoal === "true";
  const toGoal   = data.toGoal === true || data.toGoal === "true";
  const goalName = data.goalName || "";
  const existingSplit = sheet.getRange(targetRow, 10).getValue();  // keep split-group id unless overridden
  sheet.getRange(targetRow, 1, 1, 10).setValues([[
    Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    data.type, data.category, desc,
    Number(data.amount), data.notes || "",
    dateVal.getMonth() + 1, getWeekNumber(dateVal),
    (fromGoal || toGoal) ? goalName : "",  // Col I: goal name if goal spend or contribution, else blank
    fromGoal ? ("goal:" + (data.goalId || "")) : toGoal ? ("goalcontrib:" + (data.goalId || ""))
      : (data.splitId !== undefined ? data.splitId : (existingSplit || ""))  // Col J: goal link, or split-group id
  ]]);
  sheet.getRange(targetRow, 1, 1, 10).setBackground((fromGoal || toGoal) ? "#FFFBEB" : (data.type === "Income" ? "#ECFDF5" : "#FEF2F2"));
  SpreadsheetApp.flush();
  return { success: true, message: "Transaction updated at row " + targetRow };
  } finally {
    lock.releaseLock();
  }
}

function deleteTransaction(rowId, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const sheet       = ss.getSheetByName(SHEET_NAME_TX);
  const lastDataRow = getFirstEmptyRow(sheet, DATA_START_ROW) - 1;
  if (lastDataRow < DATA_START_ROW) return { error: "No transactions found" };

  const vals = sheet.getRange(DATA_START_ROW, 1, lastDataRow - DATA_START_ROW + 1, 5).getValues();

  // rowId is the reliable identifier — always try it FIRST. Content-match is only a
  // fallback for legacy rows that somehow never got a rowId, and even then it now
  // matches on date+desc+amount (not just desc+amount) to reduce collision risk.
  if (rowId && rowId >= DATA_START_ROW && rowId <= lastDataRow + 1) {
    sheet.deleteRow(rowId);
    SpreadsheetApp.flush();
    return { success: true, message: "Transaction deleted by rowId" };
  }

  if (data && data.date && (data.desc || data.description) && data.amount) {
    const date   = String(data.date);
    const desc   = String(data.desc || data.description || "").trim().toLowerCase();
    const amount = Number(data.amount);
    for (let i = vals.length - 1; i >= 0; i--) {
      const rowDate   = (vals[i][0] instanceof Date)
                        ? Utilities.formatDate(vals[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd")
                        : String(vals[i][0] || "");
      const rowDesc   = String(vals[i][3] || "").trim().toLowerCase();
      const rowAmount = Number(vals[i][4]) || 0;
      if (rowDate === date && rowDesc === desc && rowAmount === amount) {
        sheet.deleteRow(DATA_START_ROW + i);
        SpreadsheetApp.flush();
        return { success: true, message: "Transaction deleted by content match" };
      }
    }
  }

  return { error: "Transaction not found" };
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════════════════════════
// WRITE — Goals
// ══════════════════════════════════════════════════════════════

function addGoal(data) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const sheet   = ss.getSheetByName("🎯 Goals");
  if (!sheet) return { error: "Goals sheet not found" };
  const lastRow = getFirstEmptyRow(sheet, 6);
  sheet.getRange(lastRow, 1, 1, 7).setValues([[
    data.name || "", Number(data.saved) || 0, Number(data.target) || 0,
    "", Number(data.monthly) || 0, "", data.due || ""
  ]]);
  sheet.getRange(lastRow, 4).setFormula("=IFERROR(B" + lastRow + "/C" + lastRow + ",\"\")");
  sheet.getRange(lastRow, 6).setFormula("=IFERROR(ROUNDUP((C" + lastRow + "-B" + lastRow + ")/E" + lastRow + ",0),\"\")");
  sheet.getRange(lastRow, 1, 1, 7).setBackground("#F0FDF4");
  SpreadsheetApp.flush();
  return { success: true, rowId: lastRow, message: "Goal added" };
}

function updateGoal(oldName, data) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("🎯 Goals");
  if (!sheet) return { error: "Goals sheet not found" };
  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { error: "No goals found" };

  const vals = sheet.getRange(6, 1, lastRow - 5, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    const sheetName = String(vals[i][0]).trim();
    const matchName = String(oldName).trim();
    if (sheetName === matchName || sheetName.replace(/^\S+\s/, "") === matchName) {
      const row = i + 6;
      sheet.getRange(row, 1, 1, 5).setValues([[
        data.name || matchName,
        Number(data.saved)   || 0,
        Number(data.target)  || 0,
        "",
        Number(data.monthly) || 0
      ]]);
      sheet.getRange(row, 4).setFormula("=IFERROR(B" + row + "/C" + row + ",\"\")");
      sheet.getRange(row, 6).setFormula("=IFERROR(ROUNDUP((C" + row + "-B" + row + ")/E" + row + ",0),\"\")");
      if (data.due) sheet.getRange(row, 7).setValue(data.due);
      sheet.getRange(row, 1, 1, 7).setBackground("#F0FDF4");
      SpreadsheetApp.flush();
      return { success: true, message: "Goal updated: " + (data.name || matchName) };
    }
  }
  return { error: "Goal not found: " + oldName };
}

function updateGoalSaved(data) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("🎯 Goals");
  if (!sheet) return { error: "Goals sheet not found" };
  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { error: "No goals found" };

  const vals = sheet.getRange(6, 1, lastRow - 5, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    const sheetName = String(vals[i][0]).trim();
    const matchName = String(data.name).trim();
    if (sheetName === matchName || sheetName.replace(/^\S+\s/, "") === matchName) {
      sheet.getRange(i + 6, 2).setValue(Number(data.newSaved) || 0);
      SpreadsheetApp.flush();
      return { success: true, message: "Goal saved amount updated to " + data.newSaved };
    }
  }
  return { error: "Goal not found: " + data.name };
}

function deleteGoal(name) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("🎯 Goals");
  if (!sheet) return { error: "Goals sheet not found" };
  const lastRow = getFirstEmptyRow(sheet, 6) - 1;
  if (lastRow < 6) return { error: "No goals found" };

  const vals = sheet.getRange(6, 1, lastRow - 5, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    const sheetName = String(vals[i][0]).trim();
    const matchName = String(name).trim();
    if (sheetName === matchName || sheetName.replace(/^\S+\s/, "") === matchName) {
      sheet.deleteRow(i + 6);
      SpreadsheetApp.flush();
      return { success: true, message: "Goal deleted: " + name };
    }
  }
  return { error: "Goal not found: " + name };
}

// ══════════════════════════════════════════════════════════════
// WRITE — Instalments
// ══════════════════════════════════════════════════════════════

// Rebuild the entire Installment Log sheet from scratch off the live Installments sheet.
// Append/patch generation used to leave orphan rows behind; this wipes and rewrites the
// whole sheet deterministically, so the log always matches your real plans.
function regenerateInstallmentLog() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const inst = ss.getSheetByName(SHEET_NAME_INST);
  let log    = ss.getSheetByName("📅 Installment Log");
  if (!log) log = ss.insertSheet("📅 Installment Log");

  // Read plans straight from the Installments sheet (keeps each plan's real start date).
  const plans = [];
  if (inst) {
    const lastRow = inst.getLastRow();
    if (lastRow >= 6) {
      inst.getRange(6, 1, lastRow - 5, 7).getValues().forEach(r => {
        if (String(r[0]).trim() === "") return;
        plans.push({
          name: String(r[0]), category: String(r[1] || ""),
          monthly: Number(r[3]) || 0,
          startDate: (r[4] instanceof Date) ? r[4] : new Date(r[4]),
          totalMonths: Number(r[5]) || 0, monthsPaid: Number(r[6]) || 0
        });
      });
    }
  }

  // Wipe everything (content + formats + merges), then rebuild the template.
  log.getRange(1, 1, Math.max(log.getMaxRows(), 1), Math.max(log.getMaxColumns(), 6)).breakApart();
  log.clear();

  const tz = Session.getScriptTimeZone(), today = new Date();
  const NAVY = "#0F172A", SUBNAVY = "#1E293B", INDIGO = "#6366F1";
  [110, 240, 150, 140, 120, 130].forEach((w, i) => log.setColumnWidth(i + 1, w));

  log.getRange("A1:F1").merge().setValue("FinTrack · Installment Log")
    .setBackground(NAVY).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(15).setVerticalAlignment("middle");
  log.setRowHeight(1, 40);
  log.getRange("A2:F2").merge().setValue("This sheet auto-generates from your Installments · add plans there first")
    .setBackground(SUBNAVY).setFontColor("#94A3B8").setFontStyle("italic").setFontSize(10).setVerticalAlignment("middle");
  log.setRowHeight(2, 24);
  log.setRowHeight(3, 8);
  log.getRange(4, 1, 1, 6).setValues([["Payment Date", "Item", "Category", "Amount (฿)", "Instalment #", "Status"]])
    .setBackground(INDIGO).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  log.setRowHeight(4, 30);
  log.setFrozenRows(4);

  const data = [], bgs = [];
  let r = 5;
  plans.forEach(p => {
    const sd = p.startDate;
    for (let mo = 1; mo <= p.totalMonths; mo++) {
      const off = sd.getMonth() + (mo - 1);
      const payDate = new Date(sd.getFullYear() + Math.floor(off / 12), off % 12, 1);
      const payFmt  = Utilities.formatDate(payDate, tz, "MMM yyyy");
      let status, bg;
      if (mo <= p.monthsPaid) { status = "✅ Paid"; bg = "#ECFDF5"; }
      else if (payDate.getFullYear() === today.getFullYear() && payDate.getMonth() === today.getMonth()) { status = "🟡 Due this month"; bg = "#FEF9C3"; }
      else if (payDate < today) { status = "🔴 Overdue"; bg = "#FEF2F2"; }
      else { status = "⚪ Upcoming"; bg = (r % 2 === 0) ? "#F8FAFC" : "#FFFFFF"; }
      data.push([payFmt, p.name, p.category, p.monthly, mo + " / " + p.totalMonths, status]);
      bgs.push([bg, bg, bg, bg, bg, bg]);
      r++;
    }
    data.push(["", "", "", "", "", ""]); bgs.push([NAVY, NAVY, NAVY, NAVY, NAVY, NAVY]); r++; // separator
  });

  if (data.length) {
    const band = log.getRange(5, 1, data.length, 6);
    band.setValues(data); band.setBackgrounds(bgs);
    band.setFontColor("#0F172A").setFontWeight("normal").setFontSize(10).setVerticalAlignment("middle");
    log.getRange(5, 2, data.length, 1).setFontWeight("bold");                                           // Item
    log.getRange(5, 4, data.length, 1).setNumberFormat('#,##0.00" ฿"').setHorizontalAlignment("right"); // Amount
    log.getRange(5, 5, data.length, 1).setHorizontalAlignment("center");                                // Instalment #
  }

  const legendRow = 5 + data.length;
  log.getRange(legendRow, 1, 1, 6).merge()
    .setValue("Legend:   ✅ Paid = completed      🟡 Due this month = pay now      ⚪ Upcoming = future      🔴 Overdue = missed")
    .setBackground("#F1F5F9").setFontColor("#475569").setFontSize(10).setVerticalAlignment("middle");
  log.setRowHeight(legendRow, 26);

  SpreadsheetApp.flush();
  return { success: true, plans: plans.length, rows: data.length, message: "Installment Log rebuilt" };
}

function addInstallment(data) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const sheet    = ss.getSheetByName("📅 Installments");
  const logSheet = ss.getSheetByName("📅 Installment Log");
  if (!sheet) return { error: "Installments sheet not found" };
  const lastRow   = getFirstEmptyRow(sheet, 6);
  const startDate = data.startDate ? new Date(data.startDate) : new Date();
  const fmtStart  = Utilities.formatDate(startDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
  sheet.getRange(lastRow, 1, 1, 7).setValues([[
    data.name || "", data.category || "",
    Number(data.total) || 0, Number(data.monthly) || 0,
    fmtStart, Number(data.totalMonths) || 0, Number(data.monthsPaid) || 0
  ]]);
  sheet.getRange(lastRow, 8).setFormula("=IF(OR(F" + lastRow + "=\"\",G" + lastRow + "=\"\"),\"\",MAX(F" + lastRow + "-G" + lastRow + ",0))");
  sheet.getRange(lastRow, 9).setFormula("=IF(OR(D" + lastRow + "=\"\",G" + lastRow + "=\"\"),\"\",MIN(G" + lastRow + "*D" + lastRow + ",C" + lastRow + "))");
  sheet.getRange(lastRow, 10).setFormula("=IF(OR(C" + lastRow + "=\"\",I" + lastRow + "=\"\"),\"\",MAX(C" + lastRow + "-I" + lastRow + ",0))");
  sheet.getRange(lastRow, 3).setNumberFormat('#,##0.00" ฿"');
  sheet.getRange(lastRow, 4).setNumberFormat('#,##0.00" ฿"');
  sheet.getRange(lastRow, 9).setNumberFormat('#,##0.00" ฿"');
  sheet.getRange(lastRow, 10).setNumberFormat('#,##0.00" ฿"');
  sheet.getRange(lastRow, 1, 1, 10).setBackground("#FFF7ED");
  regenerateInstallmentLog();   // rebuild the whole log cleanly (no orphan rows)
  SpreadsheetApp.flush();
  return { success: true, rowId: lastRow, message: "Instalment added" };
}

function updateInstallment(oldName, data) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const sheet    = ss.getSheetByName(SHEET_NAME_INST);
  const logSheet = ss.getSheetByName("📅 Installment Log");
  if (!sheet) return { error: "Installments sheet not found" };

  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return { error: "No instalments found" };

  const vals = sheet.getRange(6, 1, lastRow - 5, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < vals.length; i++) {
    const sheetName = String(vals[i][0]).trim();
    const matchName = String(oldName).trim();
    if (sheetName === matchName || sheetName.replace(/^\S+\s/, "") === matchName) {
      targetRow = i + 6; break;
    }
  }
  if (targetRow < 0) return { error: "Instalment not found: " + oldName };

  sheet.getRange(targetRow, 1).setValue(data.name     || oldName);
  sheet.getRange(targetRow, 2).setValue(data.category || "");
  sheet.getRange(targetRow, 3).setValue(Number(data.total)       || 0);
  sheet.getRange(targetRow, 4).setValue(Number(data.monthly)     || 0);
  if (data.startDate) {
    const sd = new Date(data.startDate);
    sheet.getRange(targetRow, 5).setValue(Utilities.formatDate(sd, Session.getScriptTimeZone(), "yyyy-MM-dd"));
  }
  sheet.getRange(targetRow, 6).setValue(Number(data.totalMonths) || 0);
  sheet.getRange(targetRow, 7).setValue(Number(data.monthsPaid)  || 0);
  sheet.getRange(targetRow, 8).setFormula("=IF(OR(F" + targetRow + "=\"\",G" + targetRow + "=\"\"),\"\",MAX(F" + targetRow + "-G" + targetRow + ",0))");
  sheet.getRange(targetRow, 9).setFormula("=IF(OR(D" + targetRow + "=\"\",G" + targetRow + "=\"\"),\"\",MIN(G" + targetRow + "*D" + targetRow + ",C" + targetRow + "))");
  sheet.getRange(targetRow, 10).setFormula("=IF(OR(C" + targetRow + "=\"\",I" + targetRow + "=\"\"),\"\",MAX(C" + targetRow + "-I" + targetRow + ",0))");
  sheet.getRange(targetRow, 1, 1, 10).setBackground("#FFF7ED");

  const newName = String(data.name || oldName).trim();
  regenerateInstallmentLog();   // rebuild log (name/months/dates may all have changed)

  SpreadsheetApp.flush();
  return { success: true, message: "Instalment updated: " + newName };
}

function updateInstallmentPaidByName(planName, monthsPaid) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const sheet    = ss.getSheetByName(SHEET_NAME_INST);
  const logSheet = ss.getSheetByName("📅 Installment Log");
  if (!sheet) return { error: "Installments sheet not found" };

  const lastRow = sheet.getLastRow();
  const vals    = sheet.getRange(6, 1, lastRow - 5, 1).getValues();
  let planRow   = -1;
  for (let i = 0; i < vals.length; i++) {
    const sheetName = String(vals[i][0]).trim();
    const matchName = String(planName).trim();
    if (sheetName === matchName || sheetName.replace(/^\S+\s/, "") === matchName) {
      planRow = i + 6; break;
    }
  }
  if (planRow < 0) return { error: "Instalment not found: " + planName };

  sheet.getRange(planRow, 7).setValue(monthsPaid);
  regenerateInstallmentLog();   // rebuild log so statuses recompute cleanly

  SpreadsheetApp.flush();
  return { success: true, message: planName + " updated to " + monthsPaid + " months paid" };
}

function deleteInstallment(name) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const sheet    = ss.getSheetByName(SHEET_NAME_INST);
  const logSheet = ss.getSheetByName("📅 Installment Log");
  if (!sheet) return { error: "Installments sheet not found" };

  const lastRow = getFirstEmptyRow(sheet, 6) - 1;
  if (lastRow < 6) return { error: "No instalments found" };

  const vals      = sheet.getRange(6, 1, lastRow - 5, 1).getValues();
  const matchName = String(name).trim();
  let deleted     = false;
  for (let i = 0; i < vals.length; i++) {
    const sheetName = String(vals[i][0]).trim();
    if (sheetName === matchName || sheetName.replace(/^\S+\s/, "") === matchName) {
      sheet.deleteRow(i + 6);
      deleted = true;
      break;
    }
  }
  if (!deleted) return { error: "Instalment not found: " + name };

  regenerateInstallmentLog();   // rebuild log so the deleted plan's rows are gone cleanly

  SpreadsheetApp.flush();
  return { success: true, message: "Instalment deleted: " + name };
}

// ══════════════════════════════════════════════════════════════
// WRITE — Budgets
// ══════════════════════════════════════════════════════════════

// BudgetData's effectiveYM column stores "YYYY-MM" as plain text, but Sheets can
// silently reinterpret a date-like string as an actual Date value on re-entry —
// especially after a cell is rewritten (e.g. delete-then-re-add a budget). When that
// happens, getValues() returns a Date object instead of the string, and any direct
// string comparison against "YYYY-MM" silently fails even though the row is "there".
// Normalize whatever comes back — string, Date, or anything else — to a canonical
// "YYYY-MM" string before it's ever compared.
function normalizeYM(val) {
  if (val instanceof Date) {
    return val.getFullYear() + "-" + String(val.getMonth() + 1).padStart(2, "0");
  }
  const s = String(val == null ? "" : val);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  return s;
}

function getBudgets() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const helper = ss.getSheetByName("📊 BudgetData");
  if (!helper) return { budgets: [] };
  const lastRow = helper.getLastRow();
  if (lastRow < 1) return { budgets: [] };
  const vals = helper.getRange(1, 1, lastRow, 3).getValues();

  const latestMap = {};
  vals.filter(r => r[0] !== "").forEach(r => {
    const cat  = String(r[0]);
    const lim  = Number(r[1]) || 0;
    const ym   = normalizeYM(r[2]) || "0000-00";
    if (!latestMap[cat] || ym >= latestMap[cat].effectiveYM) {
      latestMap[cat] = { limit: lim, effectiveYM: ym };
    }
  });

  const budgets = Object.entries(latestMap).map(([cat, v]) => ({
    cat, limit: v.limit
  }));
  return { budgets };
}

function getLimitForMonth(historyRows, cat, ym) {
  const catRows = historyRows.filter(r => r.cat === cat && r.effectiveYM <= ym);
  if (!catRows.length) return 0;
  catRows.sort((a, b) => (a.effectiveYM > b.effectiveYM ? -1 : 1));
  return catRows[0].limit;
}

function saveBudgets(budgets) {
  if (!Array.isArray(budgets)) return { error: "Invalid budgets data" };

  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const MO          = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now         = new Date();
  const currentYear = now.getFullYear();
  const currentMo   = now.getMonth();
  const currentYM   = currentYear + "-" + String(currentMo + 1).padStart(2, "0");

  let helper = ss.getSheetByName("📊 BudgetData");
  if (!helper) { helper = ss.insertSheet("📊 BudgetData"); }
  // Defensively re-lock column C as plain text every save — if Sheets already
  // silently converted an older row to a Date, this stops it recurring, even
  // though the existing cell's stored value still needs normalizeYM() to read.
  if (helper.getLastRow() >= 1) helper.getRange(1, 3, helper.getLastRow(), 1).setNumberFormat("@");

  const existingRows = [];
  const helperLastRow = helper.getLastRow();
  if (helperLastRow >= 1) {
    const existingVals = helper.getRange(1, 1, helperLastRow, 3).getValues();
    existingVals.forEach((r, i) => {
      if (r[0] !== "") existingRows.push({
        cat: String(r[0]), limit: Number(r[1]) || 0,
        effectiveYM: normalizeYM(r[2]), sheetRow: i + 1
      });
    });
  }

  budgets.forEach(b => {
    const existing = existingRows.find(r => r.cat === b.cat && r.effectiveYM === currentYM);
    if (existing) {
      helper.getRange(existing.sheetRow, 2).setValue(Number(b.limit) || 0);
      existing.limit = Number(b.limit) || 0;
    } else {
      const appendRow = helper.getLastRow() + 1;
      helper.getRange(appendRow, 3).setNumberFormat("@");  // lock as plain text before writing — stops Sheets from reinterpreting "YYYY-MM" as a date
      helper.getRange(appendRow, 1, 1, 3).setValues([[b.cat, Number(b.limit) || 0, currentYM]]);
      existingRows.push({ cat: b.cat, limit: Number(b.limit) || 0, effectiveYM: currentYM, sheetRow: appendRow });
    }
  });

  const activeCats = new Set(budgets.map(b => b.cat));
  const allHelperRows = helper.getLastRow();
  if (allHelperRows >= 1) {
    const allVals = helper.getRange(1, 1, allHelperRows, 1).getValues();
    for (let i = allHelperRows; i >= 1; i--) {
      const cat = String(allVals[i - 1][0]);
      if (cat !== "" && !activeCats.has(cat)) helper.deleteRow(i);
    }
  }

  const finalHelperRows = helper.getLastRow();
  const historyRows = [];
  if (finalHelperRows >= 1) {
    helper.getRange(1, 1, finalHelperRows, 3).getValues()
      .filter(r => r[0] !== "")
      .forEach(r => historyRows.push({
        cat: String(r[0]), limit: Number(r[1]) || 0, effectiveYM: normalizeYM(r[2])
      }));
  }

  let sheet = ss.getSheetByName("📊 Budgets");
  if (!sheet) { sheet = ss.insertSheet("📊 Budgets"); }
  sheet.clearContents();
  sheet.clearFormats();

  if (!budgets.length) {
    sheet.getRange(1, 1).setValue("No budgets set yet.");
    SpreadsheetApp.flush();
    return { success: true, message: "0 budgets saved" };
  }

  const allTx     = getTransactions().transactions;
  const expenseTx = allTx.filter(t => t.type === "Expense");

  const txYears   = expenseTx.map(t => { const d = parseDate(t.date); return d ? d.getFullYear() : null; }).filter(Boolean);
  const histYears = historyRows.map(r => parseInt(r.effectiveYM.split("-")[0])).filter(Boolean);
  const allYears  = [...txYears, ...histYears, currentYear];
  const minYear   = Math.min(...allYears);
  const maxYear   = Math.max(currentYear + 1, ...allYears);

  const years = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  const months = [];
  years.forEach(y => {
    MO.forEach((m, i) => months.push({
      year: y, mo: i,
      label: m + "-" + y,
      ym: y + "-" + String(i + 1).padStart(2, "0")
    }));
  });

  const NUM_CATS   = budgets.length;
  const TOTAL_COLS = 1 + NUM_CATS * 2;

  const hdr1 = ["Month"];
  budgets.forEach(b => { hdr1.push(b.cat); hdr1.push(""); });
  sheet.getRange(1, 1, 1, TOTAL_COLS).setValues([hdr1]);
  budgets.forEach((_, i) => sheet.getRange(1, 2 + i * 2, 1, 2).merge());
  sheet.getRange(1, 1, 1, TOTAL_COLS)
    .setBackground("#0F172A").setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(10)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 30);

  const hdr2 = [""];
  budgets.forEach(() => { hdr2.push("Budget (฿)"); hdr2.push("Spending (฿)"); });
  sheet.getRange(2, 1, 1, TOTAL_COLS).setValues([hdr2]);
  sheet.getRange(2, 1, 1, TOTAL_COLS)
    .setBackground("#334155").setFontColor("#CBD5E1")
    .setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center");
  sheet.setRowHeight(2, 22);

  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);

  const dataValues = [];
  const rowMeta    = [];

  months.forEach((mo, rowIdx) => {
    const isCurrentMonth = (mo.ym === currentYM);
    const row = [mo.label];

    budgets.forEach(b => {
      const catName         = b.cat.replace(/^\S+\s/, "");
      const historicalLimit = getLimitForMonth(historyRows, b.cat, mo.ym);
      const spent = expenseTx
        .filter(t => {
          const d = parseDate(t.date);
          return d && d.getFullYear() === mo.year && d.getMonth() === mo.mo &&
            (t.category || "").replace(/^\S+\s/, "") === catName;
        })
        .reduce((s, t) => s + t.amount, 0);

      row.push(historicalLimit);
      row.push(spent);
    });

    dataValues.push(row);
    rowMeta.push({ isCurrentMonth, sheetRow: 3 + rowIdx });
  });

  sheet.getRange(3, 1, dataValues.length, TOTAL_COLS).setValues(dataValues);

  rowMeta.forEach(({ isCurrentMonth, sheetRow }, rowIdx) => {
    const rowBg = isCurrentMonth ? "#FEF9C3" : (rowIdx % 2 === 0 ? "#F8FAFC" : "#FFFFFF");

    sheet.getRange(sheetRow, 1)
      .setBackground(isCurrentMonth ? "#0D9488" : rowBg)
      .setFontColor(isCurrentMonth ? "#FFFFFF" : "#64748B")
      .setFontWeight(isCurrentMonth ? "bold" : "normal")
      .setHorizontalAlignment("left");

    budgets.forEach((b, i) => {
      const budgetCol = 2 + i * 2;
      const spendCol  = 3 + i * 2;
      const limit     = dataValues[rowIdx][budgetCol - 1];
      const spent     = dataValues[rowIdx][spendCol  - 1];

      sheet.getRange(sheetRow, budgetCol)
        .setBackground(rowBg).setFontColor("#64748B")
        .setNumberFormat(limit > 0 ? '#,##0.00' : '"—"')
        .setHorizontalAlignment("right");

      let spendBg = rowBg, spendFc = "#334155";
      if (spent > 0 && limit > 0) {
        const pct = spent / limit;
        if      (pct >= 1.0) { spendBg = "#FEF2F2"; spendFc = "#991B1B"; }
        else if (pct >= 0.8) { spendBg = "#FEF9C3"; spendFc = "#92400E"; }
        else                 { spendBg = "#F0FDF4";  spendFc = "#166534"; }
      } else if (spent > 0)  { spendBg = "#F0FDF4";  spendFc = "#166534"; }

      sheet.getRange(sheetRow, spendCol)
        .setBackground(spendBg).setFontColor(spendFc)
        .setFontWeight(spent > 0 ? "bold" : "normal")
        .setNumberFormat(spent > 0 ? '#,##0.00' : '"—"')
        .setHorizontalAlignment("right");
    });

    if (isCurrentMonth) sheet.setRowHeight(sheetRow, 24);
  });

  sheet.getRange(1, 1, 2 + dataValues.length, TOTAL_COLS)
    .setBorder(true, true, true, true, true, true,
               "#E2E8F0", SpreadsheetApp.BorderStyle.SOLID);
  budgets.forEach((_, i) => {
    sheet.getRange(1, 2 + i * 2, 2 + dataValues.length, 2)
      .setBorder(null, true, null, true, null, null,
                 "#94A3B8", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });

  sheet.setColumnWidth(1, 90);
  budgets.forEach((_, i) => {
    sheet.setColumnWidth(2 + i * 2, 100);
    sheet.setColumnWidth(3 + i * 2, 100);
  });

  SpreadsheetApp.flush();
  return { success: true, message: budgets.length + " budgets saved — historical limits preserved" };
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS SHEET
// ══════════════════════════════════════════════════════════════

function fmt_(n) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u0e3f";
}
function pct_(r) { return (r * 100).toFixed(1) + "%"; }
function dash_(n, fn) { return n > 0 ? fn(n) : "-"; }

function rebuildAnalyticsSheet() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const TAB = "\ud83d\udcca Analytics";
  const MO  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let sheet = ss.getSheetByName(TAB);
  if (!sheet) { sheet = ss.insertSheet(TAB); }
  else        { sheet.clearContents(); sheet.clearFormats(); }

  const allTx    = getTransactions().transactions;
  const nowYr    = new Date().getFullYear();
  const yearsSet = new Set(allTx.map(t => {
    const d = parseDate(t.date);
    return d ? d.getFullYear() : null;
  }).filter(Boolean));
  yearsSet.add(nowYr);
  const years    = [...yearsSet].sort();
  const numYears = years.length;

  const DATA_COLS  = 4;
  const TOTAL_COLS = 1 + numYears * DATA_COLS;

  sheet.getRange(1, 1, 1, TOTAL_COLS).merge()
    .setValue("FinTrack \u00b7 Analytics \u00b7 All Years")
    .setBackground("#0F172A").setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(14)
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 38);

  sheet.getRange(2, 1, 1, TOTAL_COLS).merge()
    .setValue("Auto-generated from Transactions \u00b7 Tap \u2018Rebuild Analytics sheet\u2019 in the FinTrack app to refresh")
    .setFontColor("#94A3B8").setFontSize(9).setFontStyle("italic");

  const YEAR_BGS = ["#0F172A","#1E3A5F","#14532D","#7C2D12","#4C1D95","#0C4A6E","#3B0764"];
  const yearData = {};

  years.forEach((yr, yi) => {
    yearData[yr] = getSummary(0, yr);
    const col    = 2 + yi * DATA_COLS;
    const bg     = YEAR_BGS[yi % YEAR_BGS.length];
    sheet.getRange(4, col, 1, DATA_COLS).merge()
      .setValue(yr)
      .setBackground(bg).setFontColor("#FFFFFF")
      .setFontWeight("bold").setFontSize(13)
      .setHorizontalAlignment("center");
    ["Income (\u0e3f)", "Expenses (\u0e3f)", "Net (\u0e3f)", "Savings Rate"].forEach((lbl, li) => {
      sheet.getRange(5, col + li)
        .setValue(lbl)
        .setBackground(bg).setFontColor("rgba(255,255,255,0.65)")
        .setFontWeight("bold").setFontSize(8)
        .setHorizontalAlignment("center");
    });
  });

  sheet.getRange(4, 1, 2, 1).merge()
    .setValue("Month")
    .setBackground("#334155").setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(10)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(4, 28);
  sheet.setRowHeight(5, 22);

  const now = new Date();
  for (let m = 0; m < 12; m++) {
    const row   = 6 + m;
    const rowBg = m % 2 === 0 ? "#F8FAFC" : "#FFFFFF";

    sheet.getRange(row, 1)
      .setValue(MO[m])
      .setBackground(rowBg).setFontWeight("bold")
      .setFontSize(10).setHorizontalAlignment("center");

    const isCurrMonth = (m === now.getMonth());

    years.forEach((yr, yi) => {
      const col = 2 + yi * DATA_COLS;
      const d   = yearData[yr].monthlyBreakdown[m];
      const bg  = isCurrMonth && yr === nowYr ? "#FEF9C3" : rowBg;

      sheet.getRange(row, col)
        .setValue(dash_(d.income, fmt_))
        .setBackground(bg)
        .setFontColor(d.income > 0 ? "#166534" : "#CBD5E1")
        .setFontWeight(d.income > 0 ? "bold" : "normal")
        .setFontSize(10).setHorizontalAlignment("center");

      sheet.getRange(row, col + 1)
        .setValue(dash_(d.expense, fmt_))
        .setBackground(bg)
        .setFontColor(d.expense > 0 ? "#991B1B" : "#CBD5E1")
        .setFontWeight(d.expense > 0 ? "bold" : "normal")
        .setFontSize(10).setHorizontalAlignment("center");

      sheet.getRange(row, col + 2)
        .setValue(d.net !== 0 ? fmt_(d.net) : "-")
        .setBackground(bg)
        .setFontColor(d.net > 0 ? "#166534" : d.net < 0 ? "#991B1B" : "#CBD5E1")
        .setFontWeight(d.net !== 0 ? "bold" : "normal")
        .setFontSize(10).setHorizontalAlignment("center");

      sheet.getRange(row, col + 3)
        .setValue(pct_(d.savingsRate))
        .setBackground(bg)
        .setFontColor(d.savingsRate > 0 ? "#166534" : "#CBD5E1")
        .setFontSize(10).setHorizontalAlignment("center");
    });

    sheet.setRowHeight(row, 22);
  }

  sheet.getRange(18, 1)
    .setValue("TOTAL")
    .setBackground("#0F172A").setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");

  years.forEach((yr, yi) => {
    const col = 2 + yi * DATA_COLS;
    const s   = yearData[yr];
    const r   = s.yearIncome > 0 ? s.yearNet / s.yearIncome : 0;

    [
      [fmt_(s.yearIncome),  s.yearIncome  > 0 ? "#86EFAC" : "#FFFFFF"],
      [fmt_(s.yearExpense), s.yearExpense > 0 ? "#FCA5A5" : "#FFFFFF"],
      [fmt_(s.yearNet),     s.yearNet > 0 ? "#86EFAC" : s.yearNet < 0 ? "#FCA5A5" : "#FFFFFF"],
      [pct_(r),             "#FFFFFF"]
    ].forEach(([val, fg], hi) => {
      sheet.getRange(18, col + hi)
        .setValue(val)
        .setBackground("#0F172A").setFontColor(fg)
        .setFontWeight("bold").setFontSize(10)
        .setHorizontalAlignment("center");
    });
  });
  sheet.setRowHeight(18, 28);

  sheet.getRange(4, 1, 15, TOTAL_COLS)
    .setBorder(true, true, true, true, true, true,
               "#E2E8F0", SpreadsheetApp.BorderStyle.SOLID);

  sheet.setFrozenRows(5);
  sheet.setFrozenColumns(1);

  sheet.setColumnWidth(1, 65);
  for (let i = 0; i < numYears * DATA_COLS; i++) {
    sheet.setColumnWidth(2 + i, 105);
  }

  SpreadsheetApp.flush();
  return { success: true, message: "Analytics rebuilt (" + years.join(", ") + ")" };
}

function rebuildAnalyticsSheetCurrentYear() { return rebuildAnalyticsSheet(); }
function rebuildAnalyticsSheet2025()        { return rebuildAnalyticsSheet(); }
function rebuildAnalyticsSheet2026()        { return rebuildAnalyticsSheet(); }
function rebuildAnalyticsSheet2027()        { return rebuildAnalyticsSheet(); }
function rebuildAnalyticsSheet2028()        { return rebuildAnalyticsSheet(); }

// ══════════════════════════════════════════════════════════════
// MAINTENANCE — one-time cleanup
// ══════════════════════════════════════════════════════════════

/**
 * Clears stray LEGACY text from column J of the Transactions sheet.
 *
 * Column J now stores split-group IDs (values like "split-1718…") that link the lines of a
 * split transaction. This housekeeping routine clears only old leftover labels there
 * ("# Transactions", "Total Expenses", "Net Savings", "Savings Rate", etc.) and DELIBERATELY
 * PRESERVES any "split-…" id so split groupings survive.
 *
 * HOW TO RUN: open the Apps Script editor, pick "cleanupColumnJ" from the function dropdown,
 * click Run, then check View > Logs to see exactly what was cleared. It only touches the
 * data region (row 5 down) and never edits any other column.
 */
function cleanupColumnJ() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_TX);
  if (!sheet) { Logger.log("Transactions sheet not found."); return { cleared: 0 }; }

  const lastDataRow = getFirstEmptyRow(sheet, DATA_START_ROW) - 1;
  if (lastDataRow < DATA_START_ROW) { Logger.log("No data rows to clean."); return { cleared: 0 }; }

  const numRows = lastDataRow - DATA_START_ROW + 1;
  const range   = sheet.getRange(DATA_START_ROW, 10, numRows, 1); // column J only
  const vals    = range.getValues();
  const report  = [];

  for (let i = 0; i < vals.length; i++) {
    const v = vals[i][0];
    // Preserve split-group ids and goal links — only clear other (legacy) stray text.
    if (v !== "" && v !== null
        && !(typeof v === "string" && v.indexOf("split-") === 0)
        && !(typeof v === "string" && v.indexOf("goal:")  === 0)
        && !(typeof v === "string" && v.indexOf("goalcontrib:")  === 0)) {
      report.push("Row " + (DATA_START_ROW + i) + ': "' + v + '"');
      vals[i][0] = "";
    }
  }

  if (report.length > 0) {
    range.setValues(vals);
    SpreadsheetApp.flush();
    Logger.log("Cleared " + report.length + " stray value(s) from column J:\n" + report.join("\n"));
  } else {
    Logger.log("Column J is already clean — nothing to clear.");
  }
  return { cleared: report.length, details: report };
}


// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function getFirstEmptyRow(sheet, startRow) {
  const data = sheet.getRange(startRow, 1, sheet.getMaxRows() - startRow + 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === "") return startRow + i;
  }
  return sheet.getMaxRows() + 1;
}

function formatDate(val) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(val);
}

// Parses a stored date string into a Date. Built from explicit Y/M/D components for
// "YYYY-MM-DD" values (not new Date(str), which parses as UTC midnight) so getMonth()/
// getFullYear()/getDate() always reflect the intended calendar date regardless of the
// Apps Script project's configured timezone. Falls back to native parsing for anything
// else (e.g. a full ISO timestamp), same as before.
function parseDate(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function getWeekNumber(date) {
  const d   = new Date(date), day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ══ RECURRING TEMPLATES ══════════════════════════════════════
function getRecurring() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("📋 Recurring");
  if (!sheet) return { recurring: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { recurring: [] };
  const vals = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const recurring = vals
    .filter(r => r[0] !== "")
    .map(r => ({
      desc:     String(r[0]),
      category: String(r[1]),
      amount:   Number(r[2]) || 0,
      type:     String(r[3]) || "Expense",
      notes:    String(r[4]) || ""
    }));
  return { recurring };
}

function saveRecurringToSheet(recurring) {
  if (!Array.isArray(recurring)) return { error: "Invalid data" };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("📋 Recurring");
  if (!sheet) {
    sheet = ss.insertSheet("📋 Recurring");
  }
  sheet.clearContents();
  const hdr = [["Description", "Category", "Amount", "Type", "Notes"]];
  sheet.getRange(1, 1, 1, 5).setValues(hdr)
    .setBackground("#0F172A").setFontColor("#FFFFFF").setFontWeight("bold");
  if (recurring.length) {
    const rows = recurring.map(r => [
      r.desc     || "",
      r.category || "",
      Number(r.amount) || 0,
      r.type     || "Expense",
      r.notes    || ""
    ]);
    sheet.getRange(2, 1, rows.length, 5).setValues(rows)
      .setBackground("#F8FAFC");
  }
  SpreadsheetApp.flush();
  return { success: true, count: recurring.length };
}

// ══ ESTIMATED BILLS ══════════════════════════════════════════
// Same pattern as Recurring above — these previously lived in localStorage only,
// so deleting and re-adding the Home Screen icon (which iOS treats as a fresh
// install, wiping local storage) silently lost every estimated bill. Persisting
// them to their own Sheet tab means a fresh device/reinstall can pull them back.
function getEstimatedBills() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("📋 Estimated Bills");
  if (!sheet) return { estimates: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { estimates: [] };
  const vals = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  // This page forecasts NEXT month, not the current one — nothing can be "logged"
  // against a month that hasn't started yet, so the cutoff for "what's current" is
  // next month, not this one. A row someone pre-enters ahead of time (e.g. sets
  // August's electricity estimate while still in July) becomes visible immediately.
  const now    = new Date();
  const nextYM = normalizeYM(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  // Same resolution as getBudgets(): the sheet is an append-only history (one row
  // per description per month it CHANGED, not one row per month), and "current" is
  // whichever row is the latest at-or-before the forecast month for that description.
  // This is what lets a fixed bill like Netflix carry forward with zero rows added
  // most months, while something like electricity gets a fresh row only when it
  // actually changes — e.g. Jul 2026 = 1000, Aug 2026 = 1500, both preserved as rows.
  const latestMap = {};
  vals.filter(r => r[0] !== "").forEach(r => {
    const key    = String(r[0]).trim().toLowerCase() + "|" + (String(r[3]) || "Expense");
    const ym     = normalizeYM(r[5]) || "0000-00";
    if (ym > nextYM) return; // ignore anything pre-dated even further ahead than next month
    if (!latestMap[key] || ym >= latestMap[key].ym) {
      latestMap[key] = {
        desc: String(r[0]), category: String(r[1]), amount: Number(r[2]) || 0,
        type: String(r[3]) || "Expense", repeats: r[4] === true || r[4] === "TRUE" || r[4] === "true",
        active: !(r[6] === false || r[6] === "FALSE" || r[6] === "false"), ym: ym
      };
    }
  });
  const estimates = Object.values(latestMap)
    .filter(e => e.active)
    .map(e => ({ desc: e.desc, category: e.category, amount: e.amount, type: e.type, repeats: e.repeats, since: e.ym }));
  return { estimates };
}

function saveEstimatedBillsToSheet(estimates) {
  if (!Array.isArray(estimates)) return { error: "Invalid data" };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("📋 Estimated Bills");
  if (!sheet) {
    sheet = ss.insertSheet("📋 Estimated Bills");
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    const hdr = [["Description", "Category", "Amount", "Type", "Repeats", "Month", "Active"]];
    sheet.getRange(1, 1, 1, 7).setValues(hdr)
      .setBackground("#0F172A").setFontColor("#FFFFFF").setFontWeight("bold");
  }
  const now    = new Date();
  const nextYM = normalizeYM(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  // Resolve current state exactly like getEstimatedBills(), so we only append a row
  // for a description when something about it genuinely changed since last time —
  // not on every save. This is what keeps the history readable instead of one row
  // per bill per app sync.
  const existing = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 7).getValues() : [];
  const latestMap = {};
  existing.filter(r => r[0] !== "").forEach(r => {
    const key = String(r[0]).trim().toLowerCase() + "|" + (String(r[3]) || "Expense");
    const ym  = normalizeYM(r[5]) || "0000-00";
    if (!latestMap[key] || ym >= latestMap[key].ym) {
      latestMap[key] = {
        category: String(r[1]), amount: Number(r[2]) || 0,
        repeats: r[4] === true || r[4] === "TRUE" || r[4] === "true",
        active: !(r[6] === false || r[6] === "FALSE" || r[6] === "false"), ym: ym
      };
    }
  });
  const incomingKeys = new Set();
  const newRows = [];
  estimates.forEach(e => {
    const desc = e.desc || ""; if (!desc) return;
    const type = e.type || "Expense";
    const key  = desc.trim().toLowerCase() + "|" + type;
    incomingKeys.add(key);
    const cur = latestMap[key];
    const changed = !cur || !cur.active || cur.category !== (e.category||"") || cur.amount !== (Number(e.amount)||0) || cur.repeats !== (e.repeats !== false);
    if (changed) newRows.push([desc, e.category || "", Number(e.amount) || 0, type, e.repeats !== false, nextYM, true]);
  });
  // Anything active in the sheet but missing from the incoming list was deleted
  // client-side — append an Active=FALSE row so it stops resolving as current,
  // without erasing its history.
  Object.keys(latestMap).forEach(key => {
    if (latestMap[key].active && !incomingKeys.has(key)) {
      const [desc, type] = [key.split("|")[0], key.split("|")[1]];
      newRows.push([desc, latestMap[key].category, latestMap[key].amount, type, latestMap[key].repeats, nextYM, false]);
    }
  });
  if (newRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 7).setValues(newRows)
      .setBackground("#F8FAFC");
  }
  SpreadsheetApp.flush();
  return { success: true, appended: newRows.length };
}

function jsonResponse(data, code) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}