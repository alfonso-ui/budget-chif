/* Gastos — sync.js: auth (OTP por email) + sincronización con Supabase vía fetch puro.
   Sin credenciales configuradas, la app funciona 100% local (modo v1). */
"use strict";

const Sync = (() => {
  // ==== Configuración (se llena al conectar el proyecto de Supabase) ====
  const SUPA_URL = window.GASTOS_SUPA_URL || "";
  const SUPA_KEY = window.GASTOS_SUPA_KEY || "";

  const AUTH_KEY = "gastos-auth";
  const OUTBOX_KEY = "gastos-outbox";
  const CURSOR_KEY = "gastos-cursor";
  const MIGRATED_KEY = "gastos-migrated";

  const configured = !!(SUPA_URL && SUPA_KEY);

  let session = loadJson(AUTH_KEY);       // {access_token, refresh_token, expires_at, user_id, email}
  let outbox = loadJson(OUTBOX_KEY) || { expenses: {}, userState: false, householdState: false };
  let household = null;                    // {id, name, invite_code, members:[{user_id, display_name}]}
  let onRemote = null;                     // callback(app): cambios remotos aplicables
  let syncTimer = null;
  let syncing = false;

  function loadJson(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  }
  function saveJson(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function saveOutbox() { saveJson(OUTBOX_KEY, outbox); }

  /* ================= Auth ================= */

  async function authFetch(path, body) {
    const res = await fetch(SUPA_URL + path, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPA_KEY },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.msg || json.error_description || json.message || `HTTP ${res.status}`);
    return json;
  }

  function setSession(data) {
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000,
      user_id: data.user?.id || session?.user_id,
      email: data.user?.email || session?.email,
    };
    saveJson(AUTH_KEY, session);
  }

  async function signIn(email, password) {
    // 1) intenta entrar; 2) si no existe la cuenta, la crea con esa contraseña
    try {
      const data = await authFetch("/auth/v1/token?grant_type=password", { email, password });
      setSession(data);
      return session;
    } catch (e) {
      if (!/invalid/i.test(e.message)) throw e;
    }
    const data = await authFetch("/auth/v1/signup", { email, password });
    if (!data.access_token) {
      throw new Error("contraseña incorrecta, o la cuenta requiere confirmación por email (revisa la configuración de Supabase)");
    }
    setSession(data);
    return session;
  }

  async function refreshIfNeeded() {
    if (!session) return false;
    if (Date.now() < session.expires_at) return true;
    try {
      const data = await authFetch("/auth/v1/token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      });
      setSession(data);
      return true;
    } catch (e) {
      console.warn("refresh falló:", e.message);
      return false;
    }
  }

  function signOut() {
    session = null;
    household = null;
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(CURSOR_KEY);
    localStorage.removeItem(MIGRATED_KEY);
  }

  /* ================= REST ================= */

  async function rest(path, opts = {}) {
    if (!(await refreshIfNeeded())) throw new Error("sesión expirada");
    const res = await fetch(SUPA_URL + "/rest/v1" + path, {
      ...opts,
      headers: {
        "content-type": "application/json",
        apikey: SUPA_KEY,
        authorization: "Bearer " + session.access_token,
        ...(opts.headers || {}),
      },
    });
    if (res.status === 204) return null;
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.message || json?.hint || `HTTP ${res.status}`);
    return json;
  }

  async function rpc(name, args) {
    return rest("/rpc/" + name, { method: "POST", body: JSON.stringify(args) });
  }

  /* ================= Hogar ================= */

  async function fetchHousehold() {
    const rows = await rest("/memberships?select=household_id,display_name,households(id,name,invite_code)");
    if (!rows || !rows.length) { household = null; return null; }
    const h = rows[0].households;
    const members = await rest(`/memberships?household_id=eq.${h.id}&select=user_id,display_name`);
    household = { id: h.id, name: h.name, invite_code: h.invite_code, members: members || [] };
    return household;
  }

  async function createHousehold(name, displayName) {
    await rpc("create_household", { p_name: name, p_display_name: displayName });
    return fetchHousehold();
  }

  async function joinHousehold(code, displayName) {
    await rpc("join_household", { p_code: code, p_display_name: displayName });
    return fetchHousehold();
  }

  async function updateMyName(name) {
    if (!household) throw new Error("sin hogar");
    await rest(`/memberships?household_id=eq.${household.id}&user_id=eq.${session.user_id}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ display_name: name }),
    });
    return fetchHousehold();
  }

  /* ================= Outbox + sync ================= */

  function enqueueExpense(row) {
    if (!configured) return;
    outbox.expenses[row.id] = row;
    saveOutbox();
    scheduleSync();
  }
  function enqueueUserState() {
    if (!configured) return;
    outbox.userState = true;
    saveOutbox();
    scheduleSync();
  }
  function enqueueHouseholdState() {
    if (!configured) return;
    outbox.householdState = true;
    saveOutbox();
    scheduleSync();
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow().catch((e) => console.warn("sync:", e.message)), 1500);
  }

  async function pushOutbox(app) {
    const rows = Object.values(outbox.expenses);
    if (rows.length) {
      await rest("/expenses?on_conflict=id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      outbox.expenses = {};
      saveOutbox();
    }
    if (outbox.userState) {
      await rest("/user_state?on_conflict=user_id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ user_id: session.user_id, doc: app.getUserDoc(), updated_at: new Date().toISOString() }]),
      });
      outbox.userState = false;
      saveOutbox();
    }
    if (outbox.householdState && household) {
      await rest("/household_state?on_conflict=household_id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ household_id: household.id, doc: app.getHouseholdDoc(), updated_at: new Date().toISOString() }]),
      });
      outbox.householdState = false;
      saveOutbox();
    }
  }

  async function pullChanges(app) {
    const cursor = localStorage.getItem(CURSOR_KEY) || "1970-01-01T00:00:00Z";
    const rows = await rest(
      `/expenses?select=*&updated_at=gt.${encodeURIComponent(cursor)}&order=updated_at.asc&limit=1000`
    );
    if (rows && rows.length) {
      app.applyRemoteExpenses(rows);
      localStorage.setItem(CURSOR_KEY, rows[rows.length - 1].updated_at);
    }
    // Docs de config (siempre; son pequeños)
    const us = await rest(`/user_state?user_id=eq.${session.user_id}&select=doc,updated_at`);
    if (us && us[0]) app.applyRemoteUserDoc(us[0].doc, us[0].updated_at);
    if (household) {
      const hs = await rest(`/household_state?household_id=eq.${household.id}&select=doc,updated_at`);
      if (hs && hs[0]) app.applyRemoteHouseholdDoc(hs[0].doc, hs[0].updated_at);
    }
    return rows ? rows.length : 0;
  }

  async function syncNow() {
    if (!configured || !session || syncing || !navigator.onLine) return;
    if (!onRemote) return;
    syncing = true;
    try {
      if (!household) await fetchHousehold().catch(() => null);
      await pushOutbox(onRemote);
      await pullChanges(onRemote);
      onRemote.afterSync?.();
    } finally {
      syncing = false;
    }
  }

  /* ================= Migración inicial ================= */

  function migrateLocalIfNeeded(app) {
    if (!session || localStorage.getItem(MIGRATED_KEY) === session.user_id) return;
    app.getAllLocalExpenseRows().forEach((row) => { outbox.expenses[row.id] = row; });
    outbox.userState = true;
    saveOutbox();
    localStorage.setItem(MIGRATED_KEY, session.user_id);
    scheduleSync();
  }

  /* ================= Wiring ================= */

  function init(appHooks) {
    onRemote = appHooks;
    if (!configured) return;
    window.addEventListener("online", () => syncNow().catch(() => {}));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncNow().catch(() => {});
    });
    if (session) {
      migrateLocalIfNeeded(appHooks);
      syncNow().catch((e) => console.warn("sync inicial:", e.message));
    }
  }

  return {
    configured,
    get session() { return session; },
    get household() { return household; },
    userId: () => session?.user_id || null,
    signIn, signOut,
    fetchHousehold, createHousehold, joinHousehold, updateMyName,
    enqueueExpense, enqueueUserState, enqueueHouseholdState,
    syncNow, migrateLocalIfNeeded, init,
    pendingCount: () => Object.keys(outbox.expenses).length,
  };
})();
