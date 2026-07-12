/* Gastos — app personal y de pareja. Local-first (localStorage) + sync opcional vía sync.js. */
"use strict";

/* ============================= Storage ============================= */

const STORE_KEY = "gastos-v1";

const DEFAULT_CATEGORIES = [
  { id: "comida", name: "Comida", emoji: "🍽️" },
  { id: "super", name: "Súper", emoji: "🛒" },
  { id: "transporte", name: "Transporte", emoji: "🚗" },
  { id: "casa", name: "Casa", emoji: "🏠" },
  { id: "salud", name: "Salud", emoji: "💊" },
  { id: "ocio", name: "Ocio", emoji: "🎬" },
  { id: "ropa", name: "Ropa", emoji: "👕" },
  { id: "suscripciones", name: "Suscripciones", emoji: "📺" },
  { id: "otros", name: "Otros", emoji: "✨" },
];

const DEFAULT_CASA_CATEGORIES = [
  { id: "renta", name: "Renta/Hipoteca", emoji: "🏠" },
  { id: "super-casa", name: "Súper", emoji: "🛒" },
  { id: "servicios", name: "Servicios", emoji: "💡" },
  { id: "mascotas", name: "Mascotas", emoji: "🐾" },
  { id: "hogar-otros", name: "Otros casa", emoji: "📦" },
];

function defaultState() {
  return {
    schema: 2,
    expenses: [], // {id, amount, catId, scope, kind:'gasto'|'aporte', note, ts, paidBy, ownerId, deleted, updatedAt}
    categories: DEFAULT_CATEGORIES.slice(),
    budgets: {},
    casaCategories: DEFAULT_CASA_CATEGORIES.slice(),
    casaBudgets: {},
    settings: { apiKey: "", model: "claude-opus-4-8", lastScope: "personal", theme: "", mode: "", showDcf: true },
    docTimes: { user: "", household: "" }, // updated_at de los docs remotos aplicados
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      casaCategories: parsed.casaCategories || base.casaCategories,
      casaBudgets: parsed.casaBudgets || {},
      docTimes: parsed.docTimes || base.docTimes,
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };
  } catch (e) {
    console.error("No se pudo leer el almacenamiento:", e);
    return defaultState();
  }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============================= Utilidades ============================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtUSD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
function money(n) { return fmtUSD.format(n); }
function money0(n) { return fmtUSD0.format(n); }

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function monthKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return MONTHS[m - 1] + " " + String(y).slice(2);
}

function catsFor(scope) {
  return scope === "casa" ? state.casaCategories : state.categories;
}
function budgetsFor(scope) {
  return scope === "casa" ? state.casaBudgets : state.budgets;
}
function catById(id, scope) {
  const pool = scope ? catsFor(scope) : [...state.categories, ...state.casaCategories];
  return pool.find((c) => c.id === id) || { id, name: id === null ? "" : id, emoji: "❓" };
}
function visibleExpenses() {
  return state.expenses.filter((e) => !e.deleted);
}
function expensesFor(mKey, scope, kind) {
  return visibleExpenses().filter((e) => {
    if (monthKey(new Date(e.ts)) !== mKey) return false;
    if (scope && scope !== "all" && e.scope !== scope) return false;
    if (scope === "all" && e.kind === "aporte") return false; // aportes no son gasto
    if (kind && (e.kind || "gasto") !== kind) return false;
    return true;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ============================= Hogar / miembros ============================= */

function casaEnabled() {
  return Sync.configured && Sync.session && Sync.household;
}
function members() {
  return Sync.household ? Sync.household.members : [];
}
function memberName(userId) {
  if (userId === "fund") return "Fondo";
  const m = members().find((x) => x.user_id === userId);
  if (m) return m.display_name;
  return userId === Sync.userId() ? "Yo" : "—";
}
function myName() {
  const m = members().find((x) => x.user_id === Sync.userId());
  return m ? m.display_name : "Yo";
}

function refreshCasaVisibility() {
  const on = casaEnabled();
  $$('[data-scope="casa"]').forEach((b) => { b.hidden = !on; });
  $("#casa-settings").hidden = !on;
  const showDcf = state.settings.showDcf !== false;
  $$('[data-scope="dcf"]').forEach((b) => { b.hidden = !showDcf; });
  if (!on && captureScope === "casa") setCaptureScope("personal");
  if (!showDcf && captureScope === "dcf") setCaptureScope("personal");
}

/* ============================= Persistencia + sync de gastos ============================= */

function expenseToRow(e) {
  return {
    id: e.id,
    owner_id: e.ownerId || Sync.userId(),
    household_id: e.scope === "casa" ? (Sync.household?.id || null) : null,
    scope: e.scope,
    kind: e.kind || "gasto",
    amount: e.amount,
    cat_id: e.catId || null,
    note: e.note || "",
    ts: e.ts,
    paid_by: e.paidBy || null,
    updated_at: e.updatedAt || new Date().toISOString(),
    deleted: !!e.deleted,
  };
}

function persistExpense(e) {
  e.updatedAt = new Date().toISOString();
  if (!e.ownerId && Sync.userId()) e.ownerId = Sync.userId();
  save();
  if (Sync.session) Sync.enqueueExpense(expenseToRow(e));
  updateSyncChip();
}

function purgeTombstones() {
  // conserva tombstones hasta que el outbox esté vacío (ya subieron)
  if (Sync.configured && Sync.session && Sync.pendingCount() > 0) return;
  const before = state.expenses.length;
  state.expenses = state.expenses.filter((e) => !e.deleted);
  if (state.expenses.length !== before) save();
}

/* ==== Hooks que usa sync.js ==== */
const appHooks = {
  getUserDoc() {
    return {
      categories: state.categories,
      budgets: state.budgets,
      settings: {
        lastScope: state.settings.lastScope,
        theme: state.settings.theme,
        mode: state.settings.mode,
        showDcf: state.settings.showDcf,
      },
    };
  },
  getHouseholdDoc() {
    return { casaCategories: state.casaCategories, casaBudgets: state.casaBudgets };
  },
  getAllLocalExpenseRows() {
    return state.expenses.map(expenseToRow);
  },
  applyRemoteExpenses(rows) {
    const byId = new Map(state.expenses.map((e) => [e.id, e]));
    rows.forEach((r) => {
      const local = byId.get(r.id);
      const incoming = {
        id: r.id,
        ownerId: r.owner_id,
        scope: r.scope,
        kind: r.kind || "gasto",
        amount: Number(r.amount),
        catId: r.cat_id,
        note: r.note || "",
        ts: Number(r.ts),
        paidBy: r.paid_by,
        updatedAt: r.updated_at,
        deleted: !!r.deleted,
      };
      if (!local) {
        if (!incoming.deleted) state.expenses.push(incoming);
      } else if ((incoming.updatedAt || "") >= (local.updatedAt || "")) {
        Object.assign(local, incoming);
      }
    });
    state.expenses = state.expenses.filter((e) => !e.deleted);
    save();
  },
  applyRemoteUserDoc(doc, updatedAt) {
    if (!doc || !updatedAt || updatedAt <= (state.docTimes.user || "")) return;
    if (doc.categories) state.categories = doc.categories;
    if (doc.budgets) state.budgets = doc.budgets;
    if (doc.settings) {
      const keep = state.settings.apiKey;
      state.settings = { ...state.settings, ...doc.settings, apiKey: keep };
    }
    state.docTimes.user = updatedAt;
    save();
  },
  applyRemoteHouseholdDoc(doc, updatedAt) {
    if (!doc || !updatedAt || updatedAt <= (state.docTimes.household || "")) return;
    if (doc.casaCategories) state.casaCategories = doc.casaCategories;
    if (doc.casaBudgets) state.casaBudgets = doc.casaBudgets;
    state.docTimes.household = updatedAt;
    save();
  },
  afterSync() {
    purgeTombstones();
    updateSyncChip();
    refreshCasaVisibility();
    renderCatGrid();
    renderPaidByChips();
    renderList();
    renderDashboard();
    renderSettings();
  },
};

function pushUserDoc() { if (Sync.session) Sync.enqueueUserState(); updateSyncChip(); }
function pushHouseholdDoc() { if (Sync.session) Sync.enqueueHouseholdState(); updateSyncChip(); }

function updateSyncChip() {
  const chip = $("#sync-chip");
  if (!chip) return;
  if (!Sync.configured || !Sync.session) { chip.hidden = true; return; }
  chip.hidden = false;
  const n = Sync.pendingCount();
  if (!navigator.onLine) { chip.textContent = "☁️ Sin señal"; chip.dataset.state = "offline"; }
  else if (n > 0) { chip.textContent = `☁️ ${n} por subir`; chip.dataset.state = "pending"; }
  else { chip.textContent = "☁️ Al día"; chip.dataset.state = "ok"; }
}

/* ============================= Navegación ============================= */

$$(".tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tabbar button").forEach((b) => b.removeAttribute("aria-current"));
    btn.setAttribute("aria-current", "true");
    $$(".tab-panel").forEach((p) => p.removeAttribute("data-active"));
    $("#" + btn.dataset.panel).setAttribute("data-active", "true");
    if (btn.dataset.panel === "panel-dash") renderDashboard();
    if (btn.dataset.panel === "panel-list") renderList();
    if (btn.dataset.panel === "panel-fx") initFx();
    if (btn.dataset.panel === "panel-settings") renderSettings();
    window.scrollTo(0, 0);
  });
});

/* ============================= Captura rápida ============================= */

let amountStr = "";
let captureScope = state.settings.lastScope || "personal";
let capturePaidBy = "me"; // 'me' | 'fund' | user_id

function renderAmount() {
  $("#amount-value").textContent = amountStr === "" ? "0" : amountStr;
  $("#amount-display").classList.toggle("has-value", amountStr !== "");
}

$("#numpad").addEventListener("click", (ev) => {
  const key = ev.target.closest("button")?.dataset.key;
  if (!key) return;
  if (key === "del") {
    amountStr = amountStr.slice(0, -1);
  } else if (key === ".") {
    if (!amountStr.includes(".")) amountStr = (amountStr || "0") + ".";
  } else {
    const [, dec] = amountStr.split(".");
    if (dec !== undefined && dec.length >= 2) return;
    if (amountStr.replace(".", "").length >= 7) return;
    amountStr = amountStr === "0" && key !== "." ? key : amountStr + key;
  }
  renderAmount();
});

function setCaptureScope(scope) {
  captureScope = scope;
  state.settings.lastScope = scope;
  save();
  $$(".scope-toggle .scope-btn").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.scope === scope))
  );
  $("#paidby-row").hidden = scope !== "casa";
  renderCatGrid();
  renderPaidByChips();
}
$$(".scope-toggle .scope-btn").forEach((b) =>
  b.addEventListener("click", () => setCaptureScope(b.dataset.scope))
);

function renderPaidByChips() {
  const wrap = $("#paidby-chips");
  if (!wrap || captureScope !== "casa") return;
  const me = Sync.userId();
  const opts = [
    ...(members().map((m) => ({ id: m.user_id, name: m.user_id === me ? myName() : m.display_name }))),
    { id: "fund", name: "Fondo 💰" },
  ];
  if (!opts.some((o) => o.id === capturePaidBy)) capturePaidBy = me || "me";
  wrap.innerHTML = "";
  opts.forEach((o) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = o.name;
    b.setAttribute("aria-pressed", String(o.id === capturePaidBy));
    b.addEventListener("click", () => { capturePaidBy = o.id; renderPaidByChips(); });
    wrap.appendChild(b);
  });
}

function renderCatGrid() {
  const grid = $("#cat-grid");
  grid.innerHTML = "";
  catsFor(captureScope).forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<span class="emoji">${c.emoji}</span><span>${escapeHtml(c.name)}</span>`;
    btn.addEventListener("click", () => quickSave(c.id));
    grid.appendChild(btn);
  });
}

function quickSave(catId) {
  const amount = parseFloat(amountStr);
  if (!amount || amount <= 0) { toast("Escribe el monto primero"); return; }
  const e = {
    id: uid(),
    amount: Math.round(amount * 100) / 100,
    catId,
    scope: captureScope,
    kind: "gasto",
    note: $("#note-input").value.trim(),
    ts: Date.now(),
    paidBy: captureScope === "casa" ? (capturePaidBy === "me" ? Sync.userId() : capturePaidBy) : null,
  };
  state.expenses.push(e);
  persistExpense(e);
  const c = catById(catId, captureScope);
  toast(`${c.emoji} ${money(amount)} en ${c.name}`);
  amountStr = "";
  $("#note-input").value = "";
  renderAmount();
  if (navigator.vibrate) navigator.vibrate(15);
}

/* ============================= Movimientos ============================= */

let listMonth = monthKey(new Date());
let listScope = "all";

function monthOptions() {
  const keys = new Set([monthKey(new Date())]);
  visibleExpenses().forEach((e) => keys.add(monthKey(new Date(e.ts))));
  return Array.from(keys).sort().reverse();
}

function renderList() {
  const sel = $("#list-month");
  sel.innerHTML = monthOptions()
    .map((k) => `<option value="${k}" ${k === listMonth ? "selected" : ""}>${monthLabel(k)}</option>`)
    .join("");

  const container = $("#list-container");
  const items = visibleExpenses()
    .filter((e) => monthKey(new Date(e.ts)) === listMonth)
    .filter((e) => listScope === "all" || e.scope === listScope)
    .sort((a, b) => b.ts - a.ts);

  if (!items.length) {
    container.innerHTML = `<p class="empty-state">No hay movimientos en este mes.<br>Registra el primero en la pestaña ＋.</p>`;
    return;
  }

  const byDay = {};
  items.forEach((e) => {
    const key = new Date(e.ts).toDateString();
    (byDay[key] = byDay[key] || []).push(e);
  });

  container.innerHTML = "";
  Object.entries(byDay).forEach(([dayKey, dayItems]) => {
    const d = new Date(dayKey);
    const group = document.createElement("div");
    group.className = "day-group";
    const total = dayItems.reduce((s, e) => s + (e.kind === "aporte" ? 0 : e.amount), 0);
    const dayLabel = d.toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });
    group.innerHTML = `<div class="day-head"><span>${dayLabel}</span><span class="day-total">${money(total)}</span></div>`;
    dayItems.forEach((e) => {
      const isAporte = e.kind === "aporte";
      const c = isAporte ? { emoji: "💰", name: "Aporte al fondo" } : catById(e.catId, e.scope);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "expense-row" + (isAporte ? " aporte-row" : "");
      const sub = isAporte
        ? memberName(e.paidBy)
        : [e.note || e.merchant, e.scope === "casa" && e.paidBy ? "pagó " + memberName(e.paidBy) : ""]
            .filter(Boolean).join(" · ");
      row.innerHTML = `
        <span class="emoji">${c.emoji}</span>
        <span class="exp-main">
          <span class="exp-cat">${escapeHtml(c.name)}</span>
          ${sub ? `<span class="exp-note">${escapeHtml(sub)}</span>` : ""}
        </span>
        ${e.scope === "dcf" ? `<span class="badge-dcf">DCF</span>` : ""}
        ${e.scope === "casa" ? `<span class="badge-dcf badge-casa">CASA</span>` : ""}
        <span class="exp-amount">${isAporte ? "+" : ""}${money(e.amount)}</span>`;
      row.addEventListener("click", () => openModal(e));
      group.appendChild(row);
    });
    container.appendChild(group);
  });
}

$("#list-month").addEventListener("change", (ev) => {
  listMonth = ev.target.value;
  renderList();
});

let dashScope = "personal";
$$(".scope-filter[data-for]").forEach((group) => {
  group.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    group.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b === btn))
    );
    if (group.dataset.for === "list") {
      listScope = btn.dataset.scope;
      renderList();
    } else {
      dashScope = btn.dataset.scope;
      renderDashboard();
    }
  });
});

/* ============================= Modal editar/confirmar ============================= */

let modalCtx = null;

function fillModalCats(scope, selectedId) {
  $("#m-cat").innerHTML = catsFor(scope)
    .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.emoji} ${escapeHtml(c.name)}</option>`)
    .join("");
}

function fillModalPaidBy(selected) {
  const me = Sync.userId();
  const opts = [
    ...members().map((m) => ({ id: m.user_id, name: m.display_name })),
    { id: "fund", name: "Fondo 💰" },
  ];
  $("#m-paidby").innerHTML = opts
    .map((o) => `<option value="${o.id}" ${o.id === (selected || me) ? "selected" : ""}>${escapeHtml(o.name)}</option>`)
    .join("");
}

function dateToInput(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function syncModalFields() {
  const scope = $("#m-scope").value;
  const isAporte = modalCtx?.kind === "aporte";
  $("#m-paidby-field").hidden = !(scope === "casa") || isAporte;
  $("#m-cat-field").hidden = isAporte;
  if (!isAporte) {
    const current = $("#m-cat").value;
    fillModalCats(scope, current);
  }
}
$("#m-scope").addEventListener("change", syncModalFields);

function openModal(expense, draft) {
  modalCtx = { expense: draft ? null : expense, draft: !!draft, kind: expense.kind || "gasto" };
  $("#modal-title").textContent = draft ? "Confirmar gasto escaneado"
    : expense.kind === "aporte" ? "Editar aporte" : "Editar gasto";
  $("#m-scope").value = expense.scope || captureScope;
  fillModalCats($("#m-scope").value, expense.catId);
  fillModalPaidBy(expense.paidBy);
  $("#m-amount").value = expense.amount ? String(expense.amount) : "";
  $("#m-date").value = dateToInput(expense.ts || Date.now());
  $("#m-note").value = expense.note || expense.merchant || "";
  $("#m-delete").hidden = !!draft;
  $('#m-scope').parentElement.hidden = expense.kind === "aporte";
  syncModalFields();
  $("#modal").hidden = false;
}

function closeModal() { $("#modal").hidden = true; modalCtx = null; }
$("#m-cancel").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (ev) => { if (ev.target === $("#modal")) closeModal(); });

$("#m-save").addEventListener("click", () => {
  const amount = parseFloat($("#m-amount").value.replace(",", "."));
  if (!amount || amount <= 0) { toast("Monto inválido"); return; }
  const [y, mo, da] = $("#m-date").value.split("-").map(Number);
  const now = new Date();
  const ts = new Date(y, mo - 1, da, now.getHours(), now.getMinutes()).getTime();
  const isAporte = modalCtx.kind === "aporte";
  const scope = isAporte ? "casa" : $("#m-scope").value;
  const data = {
    amount: Math.round(amount * 100) / 100,
    catId: isAporte ? null : $("#m-cat").value,
    scope,
    kind: modalCtx.kind,
    note: $("#m-note").value.trim(),
    ts,
    paidBy: scope === "casa" ? $("#m-paidby").value || Sync.userId() : null,
  };
  let target;
  if (modalCtx.expense) {
    target = modalCtx.expense;
    Object.assign(target, data);
  } else {
    target = { id: uid(), ...data };
    state.expenses.push(target);
  }
  persistExpense(target);
  closeModal();
  toast(isAporte ? "Aporte guardado" : "Gasto guardado");
  renderList();
  renderDashboard();
});

$("#m-delete").addEventListener("click", () => {
  if (!modalCtx?.expense) return;
  if (!confirm("¿Eliminar este movimiento?")) return;
  modalCtx.expense.deleted = true;
  persistExpense(modalCtx.expense);
  if (!Sync.session) state.expenses = state.expenses.filter((e) => e.id !== modalCtx.expense.id);
  save();
  closeModal();
  toast("Eliminado");
  renderList();
  renderDashboard();
});

/* ============================= Aporte al fondo ============================= */

$("#btn-aporte").addEventListener("click", () => {
  const me = Sync.userId();
  $("#a-who").innerHTML = members()
    .map((m) => `<option value="${m.user_id}" ${m.user_id === me ? "selected" : ""}>${escapeHtml(m.display_name)}</option>`)
    .join("");
  $("#a-amount").value = "";
  $("#a-date").value = dateToInput(Date.now());
  $("#aporte-modal").hidden = false;
});
$("#a-cancel").addEventListener("click", () => { $("#aporte-modal").hidden = true; });
$("#aporte-modal").addEventListener("click", (ev) => {
  if (ev.target === $("#aporte-modal")) $("#aporte-modal").hidden = true;
});
$("#a-save").addEventListener("click", () => {
  const amount = parseFloat($("#a-amount").value.replace(",", "."));
  if (!amount || amount <= 0) { toast("Monto inválido"); return; }
  const [y, mo, da] = $("#a-date").value.split("-").map(Number);
  const e = {
    id: uid(),
    amount: Math.round(amount * 100) / 100,
    catId: null,
    scope: "casa",
    kind: "aporte",
    note: "",
    ts: new Date(y, mo - 1, da, 12).getTime(),
    paidBy: $("#a-who").value,
  };
  state.expenses.push(e);
  persistExpense(e);
  $("#aporte-modal").hidden = true;
  toast(`💰 ${money(amount)} al fondo`);
  renderDashboard();
});

/* ============================= Resumen ============================= */

function stateFor(ratio) {
  if (ratio < 0.75) return "good";
  if (ratio <= 1) return "warning";
  return "critical";
}

function renderDashboard() {
  if (dashScope === "casa" && casaEnabled()) renderCasaDashboard();
  else renderStandardDashboard();
  renderTrend();
}

function renderStandardDashboard() {
  $("#btn-aporte").hidden = true;
  $("#equity-card").hidden = true;
  $("#hero-label").textContent = "Puedes gastar hoy";
  $("#tile-a-label").textContent = "Gastado este mes";
  $("#tile-b-label").textContent = "Esta semana disponible";
  $("#budget-title").textContent = "Presupuesto por categoría";

  const now = new Date();
  const mKey = monthKey(now);
  const items = expensesFor(mKey, dashScope, "gasto");
  const spent = items.reduce((s, e) => s + e.amount, 0);
  const budgets = state.budgets;
  const budgetTotal = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);

  $("#tile-a-value").textContent = money(spent);

  const budgetedIds = Object.keys(budgets).filter((k) => Number(budgets[k]) > 0);
  const spentBudgeted = items.filter((e) => budgetedIds.includes(e.catId)).reduce((s, e) => s + e.amount, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const remaining = budgetTotal - spentBudgeted;
  const daily = remaining / daysLeft;

  const tileVal = $("#sts-today");
  if (budgetTotal <= 0) {
    tileVal.textContent = "—";
    tileVal.classList.remove("neg");
    $("#sts-detail").textContent = "Define presupuestos en Ajustes para ver tu disponible diario.";
    $("#tile-b-value").textContent = "—";
  } else {
    tileVal.textContent = money0(Math.floor(daily));
    tileVal.classList.toggle("neg", daily < 0);
    $("#sts-detail").textContent =
      `Te quedan ${money0(remaining)} de ${money0(budgetTotal)} presupuestados, con ${daysLeft} días por delante.`;
    const dow = now.getDay();
    const daysLeftWeek = dow === 0 ? 1 : 8 - dow;
    $("#tile-b-value").textContent = money0(Math.floor(daily * Math.min(daysLeftWeek, daysLeft)));
  }

  renderBudgetBars(items, state.categories, budgets);
}

function renderCasaDashboard() {
  $("#btn-aporte").hidden = false;
  $("#equity-card").hidden = false;
  $("#hero-label").textContent = "Fondo disponible este mes";
  $("#tile-a-label").textContent = "Gastado de casa";
  $("#tile-b-label").textContent = "Aportado al fondo";
  $("#budget-title").textContent = "Presupuesto de casa";

  const mKey = monthKey(new Date());
  const gastos = expensesFor(mKey, "casa", "gasto");
  const aportes = expensesFor(mKey, "casa", "aporte");
  const spent = gastos.reduce((s, e) => s + e.amount, 0);
  const aportado = aportes.reduce((s, e) => s + e.amount, 0);
  const fromFund = gastos.filter((e) => e.paidBy === "fund").reduce((s, e) => s + e.amount, 0);
  const fondo = aportado - fromFund;

  const tileVal = $("#sts-today");
  tileVal.textContent = money(fondo);
  tileVal.classList.toggle("neg", fondo < 0);
  $("#sts-detail").textContent = aportado > 0
    ? `Aportaron ${money0(aportado)} y el fondo ha pagado ${money0(fromFund)}.`
    : "Registra los abonos de inicio de mes con el botón de abajo.";
  $("#tile-a-value").textContent = money(spent);
  $("#tile-b-value").textContent = money(aportado);

  // Equidad: aportes + gastos de bolsillo por miembro
  const rows = $("#equity-rows");
  rows.innerHTML = "";
  const totals = {};
  members().forEach((m) => { totals[m.user_id] = 0; });
  aportes.forEach((e) => { if (e.paidBy in totals) totals[e.paidBy] += e.amount; });
  gastos.forEach((e) => { if (e.paidBy && e.paidBy !== "fund" && e.paidBy in totals) totals[e.paidBy] += e.amount; });
  const entries = Object.entries(totals);
  entries.forEach(([uid2, amt]) => {
    const div = document.createElement("div");
    div.className = "equity-row";
    div.innerHTML = `<span>${escapeHtml(memberName(uid2))}</span><span>${money(amt)}</span>`;
    rows.appendChild(div);
  });
  const verdict = $("#equity-verdict");
  if (entries.length === 2) {
    const diff = entries[0][1] - entries[1][1];
    if (Math.abs(diff) < 1) verdict.textContent = "Van parejos este mes. 🤝";
    else {
      const ahead = diff > 0 ? entries[0][0] : entries[1][0];
      verdict.textContent = `${memberName(ahead)} va adelante por ${money(Math.abs(diff))}.`;
    }
  } else {
    verdict.textContent = entries.length < 2 ? "Cuando ambos estén en el hogar, aquí verán la comparación." : "";
  }

  renderBudgetBars(gastos, state.casaCategories, state.casaBudgets);
}

function renderBudgetBars(items, cats, budgets) {
  const bars = $("#budget-bars");
  bars.innerHTML = "";
  const byCat = {};
  items.forEach((e) => { byCat[e.catId] = (byCat[e.catId] || 0) + e.amount; });

  const rows = cats
    .map((c) => ({ cat: c, spent: byCat[c.id] || 0, budget: Number(budgets[c.id]) || 0 }))
    .filter((r) => r.budget > 0 || r.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  if (!rows.length) {
    bars.innerHTML = `<p class="empty-state">Aún no hay gastos ni presupuestos este mes.</p>`;
  }

  rows.forEach((r) => {
    const el = document.createElement("div");
    el.className = "budget-item";
    if (r.budget > 0) {
      const ratio = r.spent / r.budget;
      const st = stateFor(ratio);
      const pct = Math.round(ratio * 100);
      const stText = st === "good" ? "En orden" : st === "warning" ? "Cerca del límite" : "Excedido";
      el.innerHTML = `
        <div class="budget-top">
          <span class="b-name">${r.cat.emoji} ${escapeHtml(r.cat.name)}</span>
          <span class="b-nums">${money0(r.spent)} de ${money0(r.budget)}</span>
        </div>
        <div class="budget-track"><div class="budget-fill" data-state="${st}" style="width:${Math.min(ratio, 1) * 100}%"></div></div>
        <div class="budget-status" data-state="${st}"><span class="dot"></span><span>${stText} (${pct}%)</span></div>`;
    } else {
      el.innerHTML = `
        <div class="budget-top">
          <span class="b-name">${r.cat.emoji} ${escapeHtml(r.cat.name)}</span>
          <span class="b-nums">${money0(r.spent)} · sin presupuesto</span>
        </div>`;
    }
    bars.appendChild(el);
  });
}

let trendSelected = null;

function renderTrend() {
  const chart = $("#trend-chart");
  chart.innerHTML = "";
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const totals = months.map((k) =>
    expensesFor(k, dashScope, "gasto").reduce((s, e) => s + e.amount, 0)
  );
  const max = Math.max(...totals, 1);

  months.forEach((k, i) => {
    const col = document.createElement("div");
    col.className = "bar-col";
    if (trendSelected === k) col.dataset.sel = "true";
    const h = Math.max(totals[i] / max * 118, totals[i] > 0 ? 4 : 2);
    col.innerHTML = `
      <span class="bar-val">${totals[i] > 0 ? money0(totals[i]) : ""}</span>
      <div class="bar-rect" style="height:${h}px; ${totals[i] === 0 ? "background:var(--track);" : ""}"></div>
      <span class="bar-label">${monthLabel(k)}</span>`;
    col.addEventListener("click", () => {
      trendSelected = trendSelected === k ? null : k;
      renderTrend();
    });
    chart.appendChild(col);
  });

  const bk = $("#trend-breakdown");
  if (!trendSelected) { bk.innerHTML = ""; return; }
  const items = expensesFor(trendSelected, dashScope, "gasto");
  const byCat = {};
  items.forEach((e) => { byCat[e.catId] = (byCat[e.catId] || 0) + e.amount; });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  bk.innerHTML = `<div class="breakdown">
    <h3>Desglose de ${monthLabel(trendSelected)}</h3>
    ${rows.map(([catId, amt]) => {
      const c = catById(catId, dashScope === "all" ? null : dashScope);
      return `<div class="bk-row"><span>${c.emoji} ${escapeHtml(c.name)}</span><span>${money(amt)}</span></div>`;
    }).join("") || "<p class='hint'>Sin gastos ese mes.</p>"}
  </div>`;
}

/* ============================= Convertidor ============================= */

const FX_CURRENCIES = ["USD", "EUR", "MXN", "COP", "CRC", "GTQ", "DOP", "BRL", "ARS", "CLP", "PEN", "GBP", "CAD", "JPY", "CHF", "CNY"];
let fxRates = null;
let fxInited = false;

async function initFx() {
  if (!fxInited) {
    fxInited = true;
    const from = $("#fx-from");
    const to = $("#fx-to");
    const opts = FX_CURRENCIES.map((c) => `<option value="${c}">${c}</option>`).join("");
    from.innerHTML = opts;
    to.innerHTML = opts;
    from.value = "USD";
    to.value = "EUR";
    from.addEventListener("change", renderFx);
    to.addEventListener("change", renderFx);
    $("#fx-amount").addEventListener("input", renderFx);
    $("#fx-swap").addEventListener("click", () => {
      const a = from.value;
      from.value = to.value;
      to.value = a;
      renderFx();
    });
  }
  await loadRates();
  renderFx();
}

async function loadRates() {
  const cached = localStorage.getItem("gastos-fx");
  if (cached) { try { fxRates = JSON.parse(cached); } catch { /* ignorar */ } }
  const today = new Date().toISOString().slice(0, 10);
  if (fxRates && fxRates.fetchedOn === today) return;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json && json.result === "success") {
      fxRates = { base: "USD", rates: json.rates, fetchedOn: today };
      localStorage.setItem("gastos-fx", JSON.stringify(fxRates));
    }
  } catch { console.warn("Sin conexión para tasas; usando caché si existe."); }
}

function renderFx() {
  const out = $("#fx-result");
  const info = $("#fx-info");
  if (!fxRates) {
    out.textContent = "…";
    info.textContent = "Necesitas conexión la primera vez para descargar las tasas.";
    return;
  }
  const amount = parseFloat($("#fx-amount").value.replace(",", ".")) || 0;
  const from = $("#fx-from").value;
  const to = $("#fx-to").value;
  const rFrom = fxRates.rates[from];
  const rTo = fxRates.rates[to];
  if (!rFrom || !rTo) { out.textContent = "—"; return; }
  out.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: to }).format(amount / rFrom * rTo);
  info.textContent = `1 ${from} = ${(1 / rFrom * rTo).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${to} · tasas de ${fxRates.fetchedOn}`;
}

/* ============================= Ajustes ============================= */

function renderCatEditor(container, cats, budgets, onChange) {
  container.innerHTML = "";
  cats.forEach((c) => {
    const row = document.createElement("div");
    row.className = "settings-cat-row";
    row.innerHTML = `
      <input class="emoji-input" value="${c.emoji}" maxlength="4" aria-label="Emoji">
      <input class="name-input" value="${escapeHtml(c.name)}" aria-label="Nombre de categoría">
      <input class="budget-input" inputmode="decimal" placeholder="$/mes"
             value="${budgets[c.id] ? budgets[c.id] : ""}" aria-label="Presupuesto mensual">
      <button type="button" class="del-cat" aria-label="Eliminar categoría">✕</button>`;
    const [emojiIn, nameIn, budgetIn] = row.querySelectorAll("input");
    emojiIn.addEventListener("change", () => { c.emoji = emojiIn.value || "✨"; onChange(); });
    nameIn.addEventListener("change", () => { c.name = nameIn.value.trim() || c.name; onChange(); });
    budgetIn.addEventListener("change", () => {
      const v = parseFloat(budgetIn.value.replace(",", "."));
      if (v > 0) budgets[c.id] = v; else delete budgets[c.id];
      onChange();
    });
    row.querySelector(".del-cat").addEventListener("click", () => {
      const used = visibleExpenses().some((e) => e.catId === c.id);
      const msg = used
        ? `"${c.name}" tiene gastos registrados. Los gastos se conservan pero sin categoría visible. ¿Eliminar?`
        : `¿Eliminar la categoría "${c.name}"?`;
      if (!confirm(msg)) return;
      const idx = cats.findIndex((x) => x.id === c.id);
      if (idx >= 0) cats.splice(idx, 1);
      delete budgets[c.id];
      onChange();
      renderSettings();
      renderCatGrid();
    });
    container.appendChild(row);
  });
}

function renderAccount() {
  const info = $("#account-info");
  const actions = $("#account-actions");
  actions.innerHTML = "";
  if (!Sync.configured) {
    info.innerHTML = `<p class="hint">La sincronización aún no está conectada. La app funciona local en este dispositivo.</p>`;
    return;
  }
  if (!Sync.session) {
    info.innerHTML = `<p class="hint">Sin cuenta: tus datos viven solo en este dispositivo. Entra para respaldarlos y compartir Casa.</p>`;
    const b = document.createElement("button");
    b.className = "btn-primary";
    b.textContent = "Iniciar sesión";
    b.addEventListener("click", () => showAuth("email"));
    actions.appendChild(b);
    return;
  }
  const h = Sync.household;
  info.innerHTML = `
    <p class="acc-line"><strong>${escapeHtml(Sync.session.email || "")}</strong></p>
    ${h ? `<p class="acc-line">Hogar: <strong>${escapeHtml(h.name)}</strong> · ${h.members.map((m) => escapeHtml(m.display_name)).join(" + ")}</p>
           <p class="acc-line">Código de invitación: <strong class="invite-code" id="invite-code">${h.invite_code}</strong> <span class="hint-inline">(tócalo para copiar)</span></p>`
        : `<p class="acc-line hint">Aún no tienes hogar compartido.</p>`}
  `;
  if (h) {
    $("#invite-code").addEventListener("click", () => {
      navigator.clipboard?.writeText(h.invite_code).then(() => toast("Código copiado"));
    });
  } else {
    const b = document.createElement("button");
    b.className = "btn-primary";
    b.textContent = "Crear o unirme a un hogar";
    b.addEventListener("click", () => showAuth("hogar"));
    actions.appendChild(b);
  }
  const out = document.createElement("button");
  out.className = "btn-secondary";
  out.textContent = "Cerrar sesión en este dispositivo";
  out.addEventListener("click", () => {
    if (!confirm("¿Cerrar sesión? Los datos locales se conservan; dejarán de sincronizarse hasta que vuelvas a entrar.")) return;
    Sync.signOut();
    refreshCasaVisibility();
    renderSettings();
    toast("Sesión cerrada");
  });
  actions.appendChild(out);
}

function renderSettings() {
  renderAccount();
  renderCatEditor($("#settings-cats"), state.categories, state.budgets, () => {
    save(); pushUserDoc(); renderCatGrid();
  });
  if (casaEnabled()) {
    renderCatEditor($("#settings-casa-cats"), state.casaCategories, state.casaBudgets, () => {
      save(); pushHouseholdDoc(); renderCatGrid();
    });
  }
  $("#show-dcf").checked = state.settings.showDcf !== false;
  const n = visibleExpenses().length;
  const pending = Sync.configured && Sync.session ? Sync.pendingCount() : 0;
  $("#data-stats").textContent =
    (n ? `${n} movimientos guardados.` : "Todavía no hay datos.") +
    (Sync.session ? (pending ? ` ${pending} pendientes de subir.` : " Sincronizado.") : "");
}

$("#btn-add-cat").addEventListener("click", () => addCategory(state.categories, pushUserDoc));
$("#btn-add-casa-cat").addEventListener("click", () => addCategory(state.casaCategories, pushHouseholdDoc));

function addCategory(list, pushFn) {
  const name = prompt("Nombre de la nueva categoría:");
  if (!name || !name.trim()) return;
  const id = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9áéíóúñü-]/g, "") + "-" + uid().slice(-4);
  list.push({ id, name: name.trim(), emoji: "🏷️" });
  save();
  pushFn();
  renderSettings();
  renderCatGrid();
}

$("#show-dcf").addEventListener("change", (ev) => {
  state.settings.showDcf = ev.target.checked;
  save();
  pushUserDoc();
  refreshCasaVisibility();
});

/* Tema y modo */
function applyTheme() {
  const t = state.settings.theme || "";
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  $$("#theme-grid button").forEach((b) =>
    b.setAttribute("aria-pressed", String((b.dataset.theme || "") === t))
  );
  const m = state.settings.mode || "";
  if (m) document.documentElement.dataset.mode = m;
  else delete document.documentElement.dataset.mode;
  $$("#mode-toggle button").forEach((b) =>
    b.setAttribute("aria-pressed", String((b.dataset.mode || "") === m))
  );
}
$("#theme-grid").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  state.settings.theme = btn.dataset.theme || "";
  save(); pushUserDoc(); applyTheme();
});
$("#mode-toggle").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  state.settings.mode = btn.dataset.mode || "";
  save(); pushUserDoc(); applyTheme();
});

/* Export / import */

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$("#btn-export-json").addEventListener("click", () => {
  const copy = JSON.parse(JSON.stringify(state));
  copy.settings.apiKey = "";
  download(`gastos-respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(copy, null, 2), "application/json");
});

$("#btn-export-csv").addEventListener("click", () => {
  const header = "fecha,monto_usd,tipo_mov,categoria,ambito,pagador,nota\n";
  const lines = visibleExpenses()
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((e) => {
      const d = new Date(e.ts).toISOString().slice(0, 10);
      const c = e.kind === "aporte" ? { name: "Aporte" } : catById(e.catId, e.scope);
      const note = `"${(e.note || e.merchant || "").replace(/"/g, '""')}"`;
      return [d, e.amount, e.kind || "gasto", c.name, e.scope, e.paidBy ? memberName(e.paidBy) : "", note].join(",");
    });
  download(`gastos-${new Date().toISOString().slice(0, 10)}.csv`, header + lines.join("\n"), "text/csv");
});

$("#btn-import").addEventListener("click", () => $("#import-input").click());
$("#import-input").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.expenses)) throw new Error("formato no reconocido");
      if (!confirm(`El respaldo tiene ${data.expenses.length} gastos. Esto REEMPLAZA los datos actuales (${visibleExpenses().length}). ¿Continuar?`)) return;
      const apiKey = state.settings.apiKey;
      state = { ...defaultState(), ...data };
      state.settings = { ...defaultState().settings, ...(data.settings || {}), apiKey };
      save();
      if (Sync.session) {
        state.expenses.forEach((e) => persistExpense(e));
        pushUserDoc();
      }
      toast("Respaldo importado");
      applyTheme();
      refreshCasaVisibility();
      renderSettings();
      renderCatGrid();
      renderList();
      renderDashboard();
    } catch (e) {
      toast("No se pudo importar: " + e.message);
    }
  };
  reader.readAsText(file);
});

/* ============================= Login / hogar ============================= */

function showAuth(step) {
  $("#auth-overlay").hidden = false;
  ["email", "hogar"].forEach((s) => {
    $("#auth-step-" + s).hidden = s !== step;
  });
  $$(".auth-error").forEach((e) => { e.textContent = ""; });
}
function hideAuth() { $("#auth-overlay").hidden = true; }

$("#auth-skip").addEventListener("click", () => {
  localStorage.setItem("gastos-skiplogin", "1");
  hideAuth();
});
$("#auth-skip-h").addEventListener("click", () => { hideAuth(); finishLogin(); });

$("#auth-send").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim().toLowerCase();
  const pass = $("#auth-pass").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    $("#auth-error-email").textContent = "Escribe un email válido.";
    return;
  }
  if (pass.length < 6) {
    $("#auth-error-email").textContent = "La contraseña necesita al menos 6 caracteres.";
    return;
  }
  $("#auth-send").disabled = true;
  try {
    await Sync.signIn(email, pass);
    const h = await Sync.fetchHousehold().catch(() => null);
    if (h) { hideAuth(); finishLogin(); }
    else showAuth("hogar");
  } catch (e) {
    $("#auth-error-email").textContent = "No se pudo entrar: " + e.message;
  } finally {
    $("#auth-send").disabled = false;
  }
});

$("#auth-create-h").addEventListener("click", async () => {
  const name = $("#auth-name").value.trim();
  if (!name) { $("#auth-error-hogar").textContent = "Escribe tu nombre primero."; return; }
  $("#auth-create-h").disabled = true;
  try {
    await Sync.createHousehold("Casa", name);
    hideAuth();
    finishLogin();
    toast("Hogar creado. Comparte el código desde Ajustes.");
  } catch (e) {
    $("#auth-error-hogar").textContent = e.message;
  } finally {
    $("#auth-create-h").disabled = false;
  }
});

$("#auth-join-h").addEventListener("click", async () => {
  const name = $("#auth-name").value.trim();
  const code = $("#auth-join-code").value.trim();
  if (!name) { $("#auth-error-hogar").textContent = "Escribe tu nombre primero."; return; }
  if (!code) { $("#auth-error-hogar").textContent = "Escribe el código de invitación."; return; }
  $("#auth-join-h").disabled = true;
  try {
    await Sync.joinHousehold(code, name);
    hideAuth();
    finishLogin();
    toast("¡Ya estás en el hogar!");
  } catch (e) {
    $("#auth-error-hogar").textContent = e.message;
  } finally {
    $("#auth-join-h").disabled = false;
  }
});

function finishLogin() {
  updateSyncChip();
  Sync.migrateLocalIfNeeded(appHooks);
  Sync.syncNow().catch(() => {});
  refreshCasaVisibility();
  renderPaidByChips();
  renderSettings();
  renderDashboard();
}

/* ============================= Init ============================= */

applyTheme();
setCaptureScope(captureScope);
renderAmount();
renderCatGrid();
refreshCasaVisibility();
renderList();
renderDashboard();

Sync.init(appHooks);
updateSyncChip();
setInterval(updateSyncChip, 10000);
document.getElementById("sync-chip").addEventListener("click", () => {
  toast("Sincronizando…");
  Sync.syncNow().then(() => { updateSyncChip(); toast("Al día"); }).catch((e) => toast("Sin conexión: " + e.message));
});

if (Sync.configured && !Sync.session && !localStorage.getItem("gastos-skiplogin")) {
  showAuth("email");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
  });
}
