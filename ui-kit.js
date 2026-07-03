// ══════════════════════════════════════════════════════════════
// FinTrack UI Kit
// Reusable UI engines used across the app: numeric keypad, EN/TH text
// keyboard, three dropdown systems (native-select enhancer, text dropdown,
// category dropdown), and the app-styled confirm() replacement.
// No financial logic lives here -- only DOM/UI behavior.
// Load this file BEFORE app.js.
// ══════════════════════════════════════════════════════════════

const SDD_ENHANCED = new Set();

function sddEnhance(id, opts) {
  const sel = document.getElementById(id);
  if (!sel || SDD_ENHANCED.has(id)) { if (sel) sddSync(id); return; }
  opts = opts || {};
  // Build host wrapper around the select
  const host = document.createElement("div");
  host.className = "sdd-host" + (opts.inline ? " sdd-inline" : "") + (opts.up ? " sdd-up" : "") + (opts.lg ? " sdd-lg" : "");
  host.id = "sdd-host-" + id;
  if (opts.flex) host.style.flex = opts.flex;
  if (opts.swatch) host.dataset.swatch = "1";
  if (opts.icon) host.dataset.icon = "1";
  sel.parentNode.insertBefore(host, sel);
  host.appendChild(sel);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "sdd-trigger";
  trigger.id = "sdd-trigger-" + id;
  trigger.innerHTML = '<span id="sdd-label-' + id + '"></span><i class="ti ti-chevron-down sdd-arrow" aria-hidden="true"></i>';
  trigger.onclick = () => sddToggle(id);
  const list = document.createElement("div");
  list.className = "sdd-list";
  list.id = "sdd-list-" + id;
  host.appendChild(trigger);
  host.appendChild(list);
  SDD_ENHANCED.add(id);
  sddSync(id);
}

function sddSync(id) {
  const sel = document.getElementById(id);
  const list = document.getElementById("sdd-list-" + id);
  const label = document.getElementById("sdd-label-" + id);
  if (!sel || !list || !label) return;
  const host = document.getElementById("sdd-host-" + id);
  const useSwatch = !!(host && host.dataset.swatch === "1");
  const useIcon = !!(host && host.dataset.icon === "1");
  const opts = Array.from(sel.options);
  list.innerHTML = opts.map((o, i) => {
    let lead = "", txt = o.text;
    if (useSwatch) {
      lead = '<span class="sdd-swatch" style="background:' + o.value.split(",")[0] + '"></span>';
      txt = o.text.replace(/^\S+\s*/, '');
    } else if (useIcon) {
      lead = '<span class="sdd-item-icon">' + (o.text.match(/^\S+/) || [""])[0] + '</span>';
      txt = o.text.replace(/^\S+\s*/, '');
    }
    return '<div class="sdd-item' + (i === sel.selectedIndex ? ' selected' : '') + '" data-idx="' + i + '">' +
      '<span style="display:flex;align-items:center;gap:' + (useIcon ? '10px' : '9px') + '">' + lead + txt + '</span>' +
      (i === sel.selectedIndex ? '<span class="sdd-item-check">✓</span>' : '') +
    '</div>';
  }).join("");
  list.querySelectorAll(".sdd-item").forEach(item => {
    item.onclick = () => sddPick(id, parseInt(item.dataset.idx));
  });
  const cur = opts[sel.selectedIndex];
  if (useSwatch && cur) {
    label.innerHTML = '<span style="display:flex;align-items:center;gap:9px"><span class="sdd-swatch" style="background:' + cur.value.split(",")[0] + '"></span>' + cur.text.replace(/^\S+\s*/, '') + '</span>';
  } else {
    label.textContent = cur ? cur.text : "";
  }
}

function sddToggle(id) {
  const trigger = document.getElementById("sdd-trigger-" + id);
  const list = document.getElementById("sdd-list-" + id);
  if (!trigger || !list) return;
  SDD_ENHANCED.forEach(other => {
    if (other !== id) {
      const t = document.getElementById("sdd-trigger-" + other);
      const l = document.getElementById("sdd-list-" + other);
      if (t) t.classList.remove("open"); if (l) l.classList.remove("open");
    }
  });
  sddSync(id);
  const open = list.classList.toggle("open");
  trigger.classList.toggle("open", open);
}

function sddPick(id, idx) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.selectedIndex = idx;
  sddSync(id);
  const trigger = document.getElementById("sdd-trigger-" + id);
  const list = document.getElementById("sdd-list-" + id);
  if (list) list.classList.remove("open");
  if (trigger) trigger.classList.remove("open");
  // Fire the select's change handler
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

document.addEventListener("click", e => {
  const insideAny = [...SDD_ENHANCED].some(id => {
    const host = document.getElementById("sdd-host-" + id);
    return host && host.contains(e.target);
  });
  if (!insideAny) {
    SDD_ENHANCED.forEach(id => {
      const t = document.getElementById("sdd-trigger-" + id);
      const l = document.getElementById("sdd-list-" + id);
      if (t) t.classList.remove("open"); if (l) l.classList.remove("open");
    });
  }
});

// Category dropdowns now run on the sdd engine (icon mode) instead of a
// separate cdd implementation. These two helpers keep the existing call
// sites in app.js unchanged: catBuildList populates the <select> options
// and (re)builds the sdd list/trigger; catSetValue picks a value by string.
function catBuildList(selectId, cats) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = cats.map(c => '<option value="' + c.e + " " + c.n + '">' + c.e + " " + c.n + '</option>').join("");
  sddEnhance(selectId, { icon: true, lg: true });
  sddSync(selectId);
}

function catSetValue(selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const idx = Array.from(sel.options).findIndex(o => o.value === value);
  if (idx >= 0) { sel.selectedIndex = idx; sddSync(selectId); }
}

let _nkpTarget = null, _nkpVal = "", _nkpInt = false, _nkpBuilt = false;

const NKP_INT_IDS = new Set(["i-total-mo","i-paid","ei-total-mo","ei-paid"]);

function nkpBuild() {
  if (_nkpBuilt) return;
  const grid = document.getElementById("nkp-grid");
  if (!grid) return;
  ["1","2","3","4","5","6","7","8","9",".","0","back"].forEach(k => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "nkp-key"; b.dataset.key = k;
    if (k === "back") { b.textContent = "⌫"; b.classList.add("nkp-key-back"); b.setAttribute("aria-label","Backspace"); }
    else b.textContent = k;
    // pointerdown fires on touch AND mouse; preventDefault stops focus-steal.
    // (Binding to click fails on iOS because preventDefault on touch cancels click.)
    b.addEventListener("pointerdown", e => { e.preventDefault(); nkpPress(k); });
    grid.appendChild(b);
  });
  _nkpBuilt = true;
}

function nkpFmtDisplay(v) {
  const prefix = _nkpInt ? "" : "฿";   // count fields (months) aren't money — no ฿
  if (v === "" || v === null || v === undefined) return prefix + "0";
  const parts = String(v).split(".");
  const intPart = (parts[0] || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return prefix + intPart + (parts.length > 1 ? "." + parts[1] : "");
}

function nkpPress(k) {
  if (!_nkpTarget) return;
  if (k === "back") _nkpVal = _nkpVal.slice(0,-1);
  else if (k === ".") { if (_nkpInt || _nkpVal.includes(".")) return; _nkpVal = (_nkpVal === "" ? "0." : _nkpVal + "."); }
  else { if (_nkpVal === "0") _nkpVal = k; else _nkpVal += k; }
  _nkpTarget.value = _nkpVal;
  _nkpTarget.dispatchEvent(new Event("input", {bubbles:true}));
  const vd = document.getElementById("nkp-value");
  if (vd) vd.innerHTML = nkpFmtDisplay(_nkpVal) + '<span class="kb-hdr-caret"></span>';
}

function nkpOpen(input) {
  nkpBuild();
  _nkpTarget = input;
  _nkpVal = input.value || "";
  _nkpInt = NKP_INT_IDS.has(input.id);
  const dot = document.querySelector(".nkp-key[data-key='.']");
  if (dot) { dot.style.opacity = _nkpInt ? "0.3" : "1"; dot.style.pointerEvents = _nkpInt ? "none" : ""; }
  const lbl = document.getElementById("nkp-label");
  if (lbl) {
    let txt = input.closest(".form-field")?.querySelector("label")?.textContent
           || input.closest(".amount-input-wrap")?.querySelector(".amount-label")?.textContent
           || input.getAttribute("placeholder");
    // Don't use a numeric placeholder (e.g. "0.00") as the label
    if (!txt || /^[\d.,฿\s]+$/.test(txt)) txt = "Amount";
    lbl.textContent = txt.trim();
  }
  const vd = document.getElementById("nkp-value");
  if (vd) vd.innerHTML = nkpFmtDisplay(_nkpVal) + '<span class="kb-hdr-caret"></span>';
  const ov = document.getElementById("nkp-overlay");
  if (ov) ov.classList.add("open");
  kbSetRing(input);
  // Shift the form so the focused field clears the keypad (after layout settles)
  nkpRestoreReveal();
  requestAnimationFrame(() => requestAnimationFrame(nkpReveal));
}

function nkpReveal() {
  if (!_nkpTarget) return;
  const sheet = document.getElementById("nkp-sheet");
  if (!sheet) return;
  const kbTop = window.innerHeight - sheet.offsetHeight;
  const gap = 24;
  const modal = _nkpTarget.closest(".modal-sheet");
  if (modal) {
    modal.style.transition = "transform 0.22s cubic-bezier(0.4,0,0.2,1)";
    modal.style.transform = "none";        // measure the field's natural position
    void modal.offsetHeight;               // force reflow before measuring
    const rect = _nkpTarget.getBoundingClientRect();
    const overlap = Math.ceil(rect.bottom - (kbTop - gap));
    _nkpModalEl = modal;
    modal.style.transform = overlap > 0 ? "translateY(-" + overlap + "px)" : "";
  } else {
    const rect = _nkpTarget.getBoundingClientRect();
    const overlap = Math.ceil(rect.bottom - (kbTop - gap));
    if (overlap <= 0) return;
    kbAddScrollRoom(sheet.offsetHeight + 60);   // ensure the page can scroll far enough
    requestAnimationFrame(() => window.scrollBy({ top: overlap, behavior: "smooth" }));
  }
}

function nkpRestoreReveal() {
  if (_nkpModalEl) { _nkpModalEl.style.transform = ""; _nkpModalEl = null; }
  kbRemoveScrollRoom();
}

function nkpClose() {
  const ov = document.getElementById("nkp-overlay");
  if (ov) ov.classList.remove("open");
  nkpRestoreReveal();
  kbClearRing();
  if (_nkpTarget) {
    _nkpTarget.dispatchEvent(new Event("change", {bubbles:true}));
    _nkpTarget.blur();
    _nkpTarget = null;
  }
}

function nkpDone() {
  if (_nkpTarget && _nkpTarget.id && _nkpTarget.id.indexOf("rec-amt-input-") === 0) {
    const idx = parseInt(_nkpTarget.id.replace("rec-amt-input-",""));
    nkpClose();
    confirmRecurringAmt(idx);
    return;
  }
  if (_nkpTarget && _nkpTarget.id && _nkpTarget.id.indexOf("est-amt-input-") === 0) {
    const idx = parseInt(_nkpTarget.id.replace("est-amt-input-",""));
    nkpClose();
    confirmEstAmt(idx);
    return;
  }
  nkpClose();
}

function _nkpIsTarget(el) {
  return el && el.tagName === "INPUT" && el.getAttribute("inputmode") === "none";
}

function nkpMarkInputs() {
  document.querySelectorAll('input[inputmode="none"]').forEach(el => {
    el.setAttribute("readonly","");
    el.style.caretColor = "transparent";
    el.style.cursor = "pointer";
  });
}

function nkpBind() { nkpBuild(); nkpMarkInputs(); tkbMarkInputs(); }

function nkpBindRecInput() { nkpBuild(); nkpMarkInputs(); tkbMarkInputs(); }

let _tkbTarget = null, _tkbLetterLang = "en", _tkbMode = "letters", _tkbShift = false, _tkbModalEl = null, _tkbKeyModel = [];

const TKB_LAYOUTS = {
  en: {
    lower: [
      ["q","w","e","r","t","y","u","i","o","p"],
      ["a","s","d","f","g","h","j","k","l"],
      ["shift","z","x","c","v","b","n","m","back"]
    ],
    upper: [
      ["Q","W","E","R","T","Y","U","I","O","P"],
      ["A","S","D","F","G","H","J","K","L"],
      ["shift","Z","X","C","V","B","N","M","back"]
    ]
  },
  th: {
    lower: [
      ["ๆ","ไ","ำ","พ","ะ","ั","ี","ร","น","ย","บ","ล"],
      ["ฟ","ห","ก","ด","เ","้","่","า","ส","ว","ง"],
      ["shift","ผ","ป","แ","อ","ิ","ื","ท","ม","ใ","ฝ","back"]
    ],
    upper: [
      ["๐","ฎ","ฑ","ธ","ํ","๊","ณ","ฯ","ญ","ฐ","฿"],
      ["ฤ","ฆ","ฏ","โ","ฌ","็","๋","ษ","ศ","ซ"],
      ["shift","ฉ","ฮ","ฺ","์","ฒ","ฬ","ฦ","back"]
    ]
  },
  num: {
    lower: [
      ["1","2","3","4","5","6","7","8","9","0"],
      ["@","#","฿","&","*","(",")","'","\"",":"],
      ["-","/",";",",",".","?","!","back"]
    ]
  }
};

function tkbCurrentRows() {
  if (_tkbMode === "num") return TKB_LAYOUTS.num.lower;
  const L = TKB_LAYOUTS[_tkbLetterLang];
  return _tkbShift ? L.upper : L.lower;
}

function tkbRender() {
  const rowsEl = document.getElementById("tkb-rows");
  if (!rowsEl) return;
  _tkbKeyModel = [];
  tkbCurrentRows().forEach(row => {
    _tkbKeyModel.push(row.map(k => {
      if (k === "shift") return {type:"shift", label:"⇧", cls:"tkb-key-fn"+(_tkbShift?" tkb-key-shift-on":""), flex:"1.5"};
      if (k === "back")  return {type:"back",  label:"⌫", cls:"tkb-key-fn", flex:"1.5"};
      return {type:"char", char:k, label:k, cls:"", flex:"1"};
    }));
  });
  const isTh = _tkbLetterLang === "th";
  _tkbKeyModel.push([
    {type:"mode",  label:(_tkbMode==="num"?"ABC":"123"), cls:"tkb-key-fn",   flex:"1.6"},
    {type:"lang",  label:(isTh?"EN":"ไทย"),               cls:"tkb-key-lang", flex:"1.6"},
    {type:"space", label:(isTh?"เว้นวรรค":"space"),        cls:"tkb-key-space",flex:"4"},
    {type:"done",  label:(isTh?"เสร็จ":"Done"),            cls:"tkb-key-done", flex:"1.8"}
  ]);
  rowsEl.innerHTML = _tkbKeyModel.map((row,r) =>
    '<div class="tkb-row">' + row.map((key,i) =>
      '<button type="button" class="tkb-key '+key.cls+'" style="flex:'+key.flex+'" data-r="'+r+'" data-i="'+i+'">'+key.label+'</button>'
    ).join("") + '</div>'
  ).join("");
  rowsEl.querySelectorAll(".tkb-key").forEach(b => {
    // pointerdown (not click) so iOS doesn't steal focus / cancel the tap
    b.addEventListener("pointerdown", e => {
      e.preventDefault();
      tkbPress(_tkbKeyModel[+b.dataset.r][+b.dataset.i]);
    });
  });
}

function tkbInsert(ch) {
  if (!_tkbTarget) return;
  _tkbTarget.value = (_tkbTarget.value || "") + ch;
  _tkbTarget.dispatchEvent(new Event("input", {bubbles:true}));
  kbCaretUpdate(_tkbTarget);
}

function tkbBackspace() {
  if (!_tkbTarget) return;
  _tkbTarget.value = (_tkbTarget.value || "").slice(0,-1);
  _tkbTarget.dispatchEvent(new Event("input", {bubbles:true}));
  kbCaretUpdate(_tkbTarget);
}

function tkbPress(key) {
  if (!_tkbTarget) return;
  switch (key.type) {
    case "shift": _tkbShift = !_tkbShift; tkbRender(); return;
    case "back":  tkbBackspace(); return;
    case "space": tkbInsert(" "); return;
    case "lang":  _tkbLetterLang = (_tkbLetterLang==="en"?"th":"en"); _tkbMode="letters"; _tkbShift=false; tkbRender(); return;
    case "mode":  _tkbMode = (_tkbMode==="num"?"letters":"num"); _tkbShift=false; tkbRender(); return;
    case "done":  tkbClose(); return;
    case "char":
      tkbInsert(key.char);
      if (_tkbShift && _tkbMode==="letters") { _tkbShift=false; tkbRender(); } // auto-unshift after a key
      return;
  }
}

function tkbReveal() {
  if (!_tkbTarget) return;
  const sheet = document.getElementById("tkb-sheet");
  if (!sheet) return;
  const kbTop = window.innerHeight - sheet.offsetHeight, gap = 24;
  const modal = _tkbTarget.closest(".modal-sheet");
  if (modal) {
    modal.style.transition = "transform 0.22s cubic-bezier(0.4,0,0.2,1)";
    modal.style.transform = "none";
    void modal.offsetHeight;
    const rect = _tkbTarget.getBoundingClientRect();
    const overlap = Math.ceil(rect.bottom - (kbTop - gap));
    _tkbModalEl = modal;
    modal.style.transform = overlap > 0 ? "translateY(-"+overlap+"px)" : "";
  } else {
    const rect = _tkbTarget.getBoundingClientRect();
    const overlap = Math.ceil(rect.bottom - (kbTop - gap));
    if (overlap <= 0) return;
    kbAddScrollRoom(sheet.offsetHeight + 60);
    requestAnimationFrame(() => window.scrollBy({ top: overlap, behavior: "smooth" }));
  }
}

function tkbRestoreReveal() { if (_tkbModalEl) { _tkbModalEl.style.transform = ""; _tkbModalEl = null; } kbRemoveScrollRoom(); }

function tkbOpen(input) {
  _tkbTarget = input;
  _tkbMode = "letters"; _tkbShift = false; // keep last-used language across opens
  tkbRender();
  const ov = document.getElementById("tkb-overlay");
  if (ov) ov.classList.add("open");
  tkbRestoreReveal();
  requestAnimationFrame(() => requestAnimationFrame(tkbReveal));
  kbSetRing(input);
  kbCaretAttach(input);
  kbCaretUpdate(input);
  setTimeout(() => kbCaretUpdate(input), 300); // reposition after the field-lift settles
}

function tkbClose() {
  const ov = document.getElementById("tkb-overlay");
  if (ov) ov.classList.remove("open");
  tkbRestoreReveal();
  kbClearRing();
  kbCaretHide();
  kbCaretDetach();
  if (_tkbTarget) {
    _tkbTarget.dispatchEvent(new Event("change", {bubbles:true}));
    _tkbTarget.blur();
    _tkbTarget = null;
  }
}

function kbSetRing(input) {
  kbClearRing();
  // Highlight the visible field: its .form-field card, the amount card, or the input itself.
  const ring = input.closest(".form-field") || input.closest(".amount-input-wrap") || input;
  if (ring) { ring.classList.add("kb-focus"); _kbRingEl = ring; }
}

function kbClearRing() {
  if (_kbRingEl) { _kbRingEl.classList.remove("kb-focus"); _kbRingEl = null; }
}

function kbCaretCtx() {
  if (!_kbCaretCanvas) _kbCaretCanvas = document.createElement("canvas");
  return _kbCaretCanvas.getContext("2d");
}

function kbCaretHide() { const c = document.getElementById("kb-caret"); if (c) c.style.display = "none"; }

function kbCaretUpdate(input) {
  const caret = document.getElementById("kb-caret");
  if (!caret || !input) return;
  const cs = getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  if (rect.width === 0) { caret.style.display = "none"; return; }
  const text = input.value || "";
  const ctx = kbCaretCtx();
  ctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  let w = ctx.measureText(text).width;
  const ls = parseFloat(cs.letterSpacing) || 0;
  if (ls && text.length) w += ls * text.length; // canvas ignores letter-spacing — approximate it
  const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
  const fontSize = parseFloat(cs.fontSize) || 16;
  const caretH = Math.min(fontSize * 1.1, rect.height - 4);
  let x;
  if (cs.textAlign === "center")     x = Math.min(rect.left + rect.width / 2 + w / 2, rect.right - padR);
  else if (cs.textAlign === "right") x = rect.right - padR;
  else                               x = Math.min(rect.left + padL + w, rect.right - padR);
  caret.style.left = x + "px";
  caret.style.top = (rect.top + (rect.height - caretH) / 2) + "px";
  caret.style.height = caretH + "px";
  caret.style.display = "block";
}

function kbCaretAttach(input) {
  kbCaretDetach();
  _kbCaretScroll = () => kbCaretUpdate(input);
  window.addEventListener("scroll", _kbCaretScroll, true);
  window.addEventListener("resize", _kbCaretScroll);
}

function kbCaretDetach() {
  if (_kbCaretScroll) {
    window.removeEventListener("scroll", _kbCaretScroll, true);
    window.removeEventListener("resize", _kbCaretScroll);
    _kbCaretScroll = null;
  }
}

function kbAddScrollRoom(px) {
  const page = document.querySelector(".page.active");
  if (!page) return;
  if (_kbScrollPadEl && _kbScrollPadEl !== page) kbRemoveScrollRoom();
  if (_kbScrollPadEl === page) return;
  _kbScrollPadEl = page;
  _kbScrollPadPrev = page.style.paddingBottom || "";
  page.style.paddingBottom = px + "px";
}

function kbRemoveScrollRoom() {
  if (_kbScrollPadEl) { _kbScrollPadEl.style.paddingBottom = _kbScrollPadPrev; _kbScrollPadEl = null; }
}

function _tkbIsTarget(el) {
  return el && el.tagName === "INPUT" && el.dataset && el.dataset.tkb === "1";
}

function tkbMarkInputs() {
  document.querySelectorAll('input[type="text"], input[type="search"], input[type="url"]').forEach(el => {
    if (el.getAttribute("inputmode") === "none") return; // numeric field → handled by the keypad
    if (el.type === "url") return;                       // URL fields are pasted, not typed — keep the native keyboard
    el.setAttribute("readonly", "");                     // stops the native keyboard on iOS
    el.dataset.tkb = "1";
    el.style.cursor = "pointer";
  });
}

function appConfirm(opts) {
  if (typeof opts === "string") opts = { title: opts };
  const { title = "Are you sure?", message = "", okText = "OK", cancelText = "Cancel", danger = false } = opts;
  const ov = document.getElementById("confirm-overlay");
  const okBtn = document.getElementById("confirm-ok-btn");
  const cancelBtn = document.getElementById("confirm-cancel-btn");
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-msg").textContent = message;
  okBtn.textContent = okText;
  cancelBtn.textContent = cancelText;
  okBtn.classList.toggle("danger", !!danger);
  ov.classList.remove("hidden");
  return new Promise(resolve => {
    function cleanup(val) {
      ov.classList.add("hidden");
      okBtn.onclick = null; cancelBtn.onclick = null; ov.onclick = null;
      resolve(val);
    }
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    ov.onclick = e => { if (e.target === ov) cleanup(false); };
  });
}