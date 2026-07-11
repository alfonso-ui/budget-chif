/* Gastos — app personal de gastos y presupuesto. Sin backend: todo vive en localStorage. */
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

function defaultState() {
  return {
    schema: 1,
    expenses: [], // {id, amount, catId, scope:'personal'|'dcf', note, ts, merchant?}
    categories: DEFAULT_CATEGORIES.slice(),
    budgets: {},  // catId -> monthly USD
    settings: { apiKey: "", model: "claude-opus-4-8", lastScope: "personal", theme: "", mode: "" },
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

function monthKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return MONTHS[m - 1] + " " + String(y).slice(2);
}
function catById(id) {
  return state.categories.find((c) => c.id === id) || { id, name: id, emoji: "❓" };
}
function expensesFor(mKey, scope) {
  return state.expenses.filter((e) => {
    const d = new Date(e.ts);
    if (monthKey(d) !== mKey) return false;
    if (scope && scope !== "all" && e.scope !== scope) return false;
    return true;
  });
}

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ============================= Navegación ============================= */

$$(".tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tabbar button").forEach((b) => b.removeAttribute("aria-current"));
    btn.setAttribute("aria-current", "true");
    $$(".tab-panel").forEach((p) => p.removeAttribute("data-active"));
    const panel = $("#" + btn.dataset.panel);
    panel.setAttribute("data-active", "true");
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
}
$$(".scope-toggle .scope-btn").forEach((b) =>
  b.addEventListener("click", () => setCaptureScope(b.dataset.scope))
);

function renderCatGrid() {
  const grid = $("#cat-grid");
  grid.innerHTML = "";
  state.categories.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<span class="emoji">${c.emoji}</span><span>${c.name}</span>`;
    btn.addEventListener("click", () => quickSave(c.id));
    grid.appendChild(btn);
  });
}

function quickSave(catId) {
  const amount = parseFloat(amountStr);
  if (!amount || amount <= 0) {
    toast("Escribe el monto primero");
    return;
  }
  state.expenses.push({
    id: uid(),
    amount: Math.round(amount * 100) / 100,
    catId,
    scope: captureScope,
    note: $("#note-input").value.trim(),
    ts: Date.now(),
  });
  save();
  const c = catById(catId);
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
  state.expenses.forEach((e) => keys.add(monthKey(new Date(e.ts))));
  return Array.from(keys).sort().reverse();
}

function renderList() {
  const sel = $("#list-month");
  const opts = monthOptions();
  sel.innerHTML = opts
    .map((k) => `<option value="${k}" ${k === listMonth ? "selected" : ""}>${monthLabel(k)}</option>`)
    .join("");

  const container = $("#list-container");
  const items = expensesFor(listMonth, listScope).sort((a, b) => b.ts - a.ts);

  if (!items.length) {
    container.innerHTML = `<p class="empty-state">No hay gastos registrados en este mes.<br>Registra el primero en la pestaña ＋.</p>`;
    return;
  }

  const byDay = {};
  items.forEach((e) => {
    const d = new Date(e.ts);
    const key = d.toDateString();
    (byDay[key] = byDay[key] || []).push(e);
  });

  container.innerHTML = "";
  Object.entries(byDay).forEach(([dayKey, dayItems]) => {
    const d = new Date(dayKey);
    const group = document.createElement("div");
    group.className = "day-group";
    const total = dayItems.reduce((s, e) => s + e.amount, 0);
    const dayLabel = d.toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });
    group.innerHTML = `<div class="day-head"><span>${dayLabel}</span><span class="day-total">${money(total)}</span></div>`;
    dayItems.forEach((e) => {
      const c = catById(e.catId);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "expense-row";
      row.innerHTML = `
        <span class="emoji">${c.emoji}</span>
        <span class="exp-main">
          <span class="exp-cat">${c.name}</span>
          ${e.note || e.merchant ? `<span class="exp-note">${escapeHtml(e.note || e.merchant)}</span>` : ""}
        </span>
        ${e.scope === "dcf" ? `<span class="badge-dcf">DCF</span>` : ""}
        <span class="exp-amount">${money(e.amount)}</span>`;
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

/* Filtros de tipo (Movimientos + Resumen) */
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

let modalCtx = null; // {expense} para editar, o {draft:true, data} para escaneo

function fillModalCats(selectedId) {
  $("#m-cat").innerHTML = state.categories
    .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.emoji} ${c.name}</option>`)
    .join("");
}

function dateToInput(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function openModal(expense, draft) {
  modalCtx = draft ? { draft: true } : { expense };
  const src = expense;
  $("#modal-title").textContent = draft ? "Confirmar gasto escaneado" : "Editar gasto";
  fillModalCats(src.catId);
  $("#m-amount").value = src.amount ? String(src.amount) : "";
  $("#m-scope").value = src.scope || captureScope;
  $("#m-date").value = dateToInput(src.ts || Date.now());
  $("#m-note").value = src.note || src.merchant || "";
  $("#m-delete").hidden = !!draft;
  $("#modal").hidden = false;
}

function closeModal() {
  $("#modal").hidden = true;
  modalCtx = null;
}

$("#m-cancel").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (ev) => {
  if (ev.target === $("#modal")) closeModal();
});

$("#m-save").addEventListener("click", () => {
  const amount = parseFloat($("#m-amount").value.replace(",", "."));
  if (!amount || amount <= 0) { toast("Monto inválido"); return; }
  const dateVal = $("#m-date").value;
  const [y, mo, da] = dateVal.split("-").map(Number);
  const now = new Date();
  const ts = new Date(y, mo - 1, da, now.getHours(), now.getMinutes()).getTime();
  const data = {
    amount: Math.round(amount * 100) / 100,
    catId: $("#m-cat").value,
    scope: $("#m-scope").value,
    note: $("#m-note").value.trim(),
    ts,
  };
  if (modalCtx?.expense) {
    Object.assign(modalCtx.expense, data);
  } else {
    state.expenses.push({ id: uid(), ...data });
  }
  save();
  closeModal();
  toast("Gasto guardado");
  renderList();
  renderDashboard();
});

$("#m-delete").addEventListener("click", () => {
  if (!modalCtx?.expense) return;
  if (!confirm("¿Eliminar este gasto?")) return;
  state.expenses = state.expenses.filter((e) => e.id !== modalCtx.expense.id);
  save();
  closeModal();
  toast("Gasto eliminado");
  renderList();
  renderDashboard();
});

/* ============================= Resumen ============================= */

function stateFor(ratio) {
  if (ratio < 0.75) return "good";
  if (ratio <= 1) return "warning";
  return "critical";
}

function renderDashboard() {
  const now = new Date();
  const mKey = monthKey(now);
  const items = expensesFor(mKey, dashScope);
  const spent = items.reduce((s, e) => s + e.amount, 0);

  const budgetTotal = Object.entries(state.budgets)
    .reduce((s, [, v]) => s + (Number(v) || 0), 0);

  $("#month-spent").textContent = money(spent);

  // Safe to spend: (presupuesto total - gastado en categorías con presupuesto) / días restantes
  const budgetedCatIds = Object.keys(state.budgets).filter((k) => Number(state.budgets[k]) > 0);
  const spentBudgeted = items
    .filter((e) => budgetedCatIds.includes(e.catId))
    .reduce((s, e) => s + e.amount, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const remaining = budgetTotal - spentBudgeted;
  const daily = remaining / daysLeft;

  const tileVal = $("#sts-today");
  if (budgetTotal <= 0) {
    tileVal.textContent = "—";
    tileVal.classList.remove("neg");
    $("#sts-detail").textContent = "Define presupuestos en Ajustes para ver tu disponible diario.";
    $("#sts-week").textContent = "—";
  } else {
    tileVal.textContent = money0(Math.floor(daily));
    tileVal.classList.toggle("neg", daily < 0);
    $("#sts-detail").textContent =
      `Te quedan ${money0(remaining)} de ${money0(budgetTotal)} presupuestados, con ${daysLeft} días por delante.`;
    const dow = now.getDay(); // 0=domingo
    const daysLeftWeek = dow === 0 ? 1 : 8 - dow;
    $("#sts-week").textContent = money0(Math.floor(daily * Math.min(daysLeftWeek, daysLeft)));
  }

  // Barras por categoría
  const bars = $("#budget-bars");
  bars.innerHTML = "";
  const byCat = {};
  items.forEach((e) => { byCat[e.catId] = (byCat[e.catId] || 0) + e.amount; });

  const rows = state.categories
    .map((c) => ({ cat: c, spent: byCat[c.id] || 0, budget: Number(state.budgets[c.id]) || 0 }))
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
          <span class="b-name">${r.cat.emoji} ${r.cat.name}</span>
          <span class="b-nums">${money0(r.spent)} de ${money0(r.budget)}</span>
        </div>
        <div class="budget-track"><div class="budget-fill" data-state="${st}" style="width:${Math.min(ratio, 1) * 100}%"></div></div>
        <div class="budget-status" data-state="${st}"><span class="dot"></span><span>${stText} (${pct}%)</span></div>`;
    } else {
      el.innerHTML = `
        <div class="budget-top">
          <span class="b-name">${r.cat.emoji} ${r.cat.name}</span>
          <span class="b-nums">${money0(r.spent)} · sin presupuesto</span>
        </div>`;
    }
    bars.appendChild(el);
  });

  renderTrend();
}

let trendSelected = null;

function renderTrend() {
  const chart = $("#trend-chart");
  chart.innerHTML = "";
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const totals = months.map((k) =>
    expensesFor(k, dashScope).reduce((s, e) => s + e.amount, 0)
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
  const items = expensesFor(trendSelected, dashScope);
  const byCat = {};
  items.forEach((e) => { byCat[e.catId] = (byCat[e.catId] || 0) + e.amount; });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  bk.innerHTML = `<div class="breakdown">
    <h3>Desglose de ${monthLabel(trendSelected)}</h3>
    ${rows.map(([catId, amt]) => {
      const c = catById(catId);
      return `<div class="bk-row"><span>${c.emoji} ${c.name}</span><span>${money(amt)}</span></div>`;
    }).join("") || "<p class='hint'>Sin gastos ese mes.</p>"}
  </div>`;
}

/* ============================= Escaneo de recibos ============================= */

$("#btn-scan").addEventListener("click", () => {
  if (!state.settings.apiKey) {
    toast("Primero guarda tu API key en Ajustes");
    return;
  }
  $("#scan-input").click();
});

$("#scan-input").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  $("#scan-overlay").hidden = false;
  $("#scan-status").textContent = "Preparando la foto…";
  try {
    const { b64, mediaType } = await resizeImage(file, 1568);
    $("#scan-status").textContent = "Leyendo el recibo…";
    const data = await extractReceipt(b64, mediaType);
    $("#scan-overlay").hidden = true;
    const ts = data.date ? parseISODate(data.date) : Date.now();
    openModal({
      amount: data.amount || "",
      catId: matchCategory(data.suggested_category),
      scope: captureScope,
      note: data.merchant || "",
      ts,
    }, true);
  } catch (err) {
    console.error(err);
    $("#scan-overlay").hidden = true;
    toast("No se pudo leer el recibo: " + (err.message || "error"));
  }
});

function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Date.now();
  const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
  // Fechas absurdas (mal OCR) caen a hoy
  const now = Date.now();
  if (ts > now + 86400000 || ts < now - 400 * 86400000) return now;
  return ts;
}

function matchCategory(name) {
  if (!name) return "otros";
  const norm = name.toLowerCase();
  const hit = state.categories.find(
    (c) => c.id === norm || c.name.toLowerCase() === norm
  );
  return hit ? hit.id : (state.categories.find((c) => c.id === "otros") ? "otros" : state.categories[0].id);
}

function resizeImage(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve({ b64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen inválida")); };
    img.src = url;
  });
}

async function extractReceipt(b64, mediaType) {
  const catNames = state.categories.map((c) => c.name);
  const schema = {
    type: "object",
    properties: {
      amount: { type: ["number", "null"], description: "Total pagado, solo el número" },
      merchant: { type: ["string", "null"], description: "Nombre del comercio" },
      date: { type: ["string", "null"], description: "Fecha del recibo en formato YYYY-MM-DD" },
      suggested_category: { type: ["string", "null"], enum: [...catNames, null], description: "Categoría más apropiada" },
    },
    required: ["amount", "merchant", "date", "suggested_category"],
    additionalProperties: false,
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": state.settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: state.settings.model || "claude-opus-4-8",
      max_tokens: 1024,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          {
            type: "text",
            text: `Extrae los datos de este recibo o factura. El monto es el TOTAL pagado en dólares (si la moneda no es USD, devuelve el número tal cual aparece). Categorías disponibles: ${catNames.join(", ")}. Si un dato no se ve, devuélvelo como null.`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("API key inválida");
    throw new Error(msg);
  }
  const json = await res.json();
  if (json.stop_reason === "refusal") throw new Error("la solicitud fue rechazada");
  const text = (json.content || []).find((b) => b.type === "text")?.text;
  if (!text) throw new Error("respuesta vacía");
  return JSON.parse(text);
}

/* ============================= Convertidor ============================= */

const FX_CURRENCIES = ["USD", "EUR", "MXN", "COP", "CRC", "GTQ", "DOP", "BRL", "ARS", "CLP", "PEN", "GBP", "CAD", "JPY", "CHF", "CNY"];
let fxRates = null; // {base:"USD", date, rates:{...}}
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
  if (cached) {
    try { fxRates = JSON.parse(cached); } catch { /* ignorar */ }
  }
  const today = new Date().toISOString().slice(0, 10);
  if (fxRates && fxRates.fetchedOn === today) return;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json && json.result === "success") {
      fxRates = { base: "USD", date: json.time_last_update_utc, rates: json.rates, fetchedOn: today };
      localStorage.setItem("gastos-fx", JSON.stringify(fxRates));
    }
  } catch (e) {
    console.warn("Sin conexión para tasas; usando caché si existe.");
  }
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
  const result = amount / rFrom * rTo;
  out.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: to }).format(result);
  const unit = (1 / rFrom * rTo);
  info.textContent = `1 ${from} = ${unit.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${to} · tasas de ${fxRates.fetchedOn}`;
}

/* ============================= Ajustes ============================= */

function renderSettings() {
  const wrap = $("#settings-cats");
  wrap.innerHTML = "";
  state.categories.forEach((c) => {
    const row = document.createElement("div");
    row.className = "settings-cat-row";
    row.innerHTML = `
      <input class="emoji-input" value="${c.emoji}" maxlength="4" aria-label="Emoji">
      <input class="name-input" value="${escapeHtml(c.name)}" aria-label="Nombre de categoría">
      <input class="budget-input" inputmode="decimal" placeholder="$/mes"
             value="${state.budgets[c.id] ? state.budgets[c.id] : ""}" aria-label="Presupuesto mensual">
      <button type="button" class="del-cat" aria-label="Eliminar categoría">✕</button>`;
    const [emojiIn, nameIn, budgetIn] = row.querySelectorAll("input");
    emojiIn.addEventListener("change", () => { c.emoji = emojiIn.value || "✨"; save(); renderCatGrid(); });
    nameIn.addEventListener("change", () => { c.name = nameIn.value.trim() || c.name; save(); renderCatGrid(); });
    budgetIn.addEventListener("change", () => {
      const v = parseFloat(budgetIn.value.replace(",", "."));
      if (v > 0) state.budgets[c.id] = v; else delete state.budgets[c.id];
      save();
    });
    row.querySelector(".del-cat").addEventListener("click", () => {
      const used = state.expenses.some((e) => e.catId === c.id);
      if (used && !confirm(`"${c.name}" tiene gastos registrados. Los gastos se conservan pero quedarán sin categoría visible. ¿Eliminar?`)) return;
      if (!used && !confirm(`¿Eliminar la categoría "${c.name}"?`)) return;
      state.categories = state.categories.filter((x) => x.id !== c.id);
      delete state.budgets[c.id];
      save();
      renderSettings();
      renderCatGrid();
    });
    wrap.appendChild(row);
  });

  $("#api-key").value = state.settings.apiKey || "";
  const n = state.expenses.length;
  $("#data-stats").textContent = n
    ? `${n} gastos guardados en este dispositivo. Exporta un respaldo de vez en cuando.`
    : "Todavía no hay datos guardados.";
}

$("#btn-add-cat").addEventListener("click", () => {
  const name = prompt("Nombre de la nueva categoría:");
  if (!name || !name.trim()) return;
  const id = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9áéíóúñü-]/g, "") + "-" + uid().slice(-4);
  state.categories.push({ id, name: name.trim(), emoji: "🏷️" });
  save();
  renderSettings();
  renderCatGrid();
});

/* Tema de color y modo claro/oscuro */
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
  save();
  applyTheme();
});
$("#mode-toggle").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  state.settings.mode = btn.dataset.mode || "";
  save();
  applyTheme();
});

$("#btn-save-key").addEventListener("click", () => {
  state.settings.apiKey = $("#api-key").value.trim();
  save();
  toast(state.settings.apiKey ? "API key guardada" : "API key eliminada");
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
  copy.settings.apiKey = ""; // nunca exportar la key
  download(`gastos-respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(copy, null, 2), "application/json");
});

$("#btn-export-csv").addEventListener("click", () => {
  const header = "fecha,monto_usd,categoria,tipo,nota\n";
  const lines = state.expenses
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((e) => {
      const d = new Date(e.ts).toISOString().slice(0, 10);
      const c = catById(e.catId);
      const note = `"${(e.note || e.merchant || "").replace(/"/g, '""')}"`;
      return [d, e.amount, c.name, e.scope, note].join(",");
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
      if (!confirm(`El respaldo tiene ${data.expenses.length} gastos. Esto REEMPLAZA los datos actuales (${state.expenses.length} gastos). ¿Continuar?`)) return;
      const apiKey = state.settings.apiKey;
      state = { ...defaultState(), ...data };
      state.settings = { ...defaultState().settings, ...(data.settings || {}), apiKey };
      save();
      toast("Respaldo importado");
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

/* ============================= Init ============================= */

setCaptureScope(captureScope);
applyTheme();
renderAmount();
renderCatGrid();
renderList();
renderDashboard();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
  });
}
