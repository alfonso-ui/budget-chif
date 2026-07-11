# PROJECT-STATE — Gastos (app personal de gastos y presupuesto)

> PWA estática sin backend: HTML + CSS + JS vanilla, datos en localStorage, instalable en iPhone.
> Plan completo de la sesión de planeación: ver Decisions log.

## Current deliverable
Deploy a hosting estático (GitHub Pages o Vercel) e instalación en el iPhone de Alfonso. El MVP local ya está construido y verificado.

## Approved / do not touch
- Decisión de arquitectura: sin login, sin nube, sin build step. Todo en USD.

## Backlog / parking lot
- Sincronización entre dispositivos (Supabase) — solo si el hábito pega
- Import de estados de cuenta del banco (CSV) con categorización asistida
- Gastos recurrentes/fijos automáticos
- Recordatorio diario de registro

## Open items
- [x] Modelo de datos + storage en localStorage
- [x] Pantalla de captura rápida (numpad + categorías + toggle Personal/DCF)
- [x] Lista de movimientos (editar/borrar)
- [x] Dashboard (categoría vs presupuesto, safe-to-spend, tendencia 6 meses con desglose al tocar)
- [x] Escaneo de recibos (cámara + API Claude + confirmación editable) — código listo, falta probar con API key y recibos reales
- [x] Tab convertidor de monedas (open.er-api.com, caché diario en localStorage)
- [x] Ajustes (categorías editables, presupuestos, API key, export JSON/CSV, import)
- [x] PWA (manifest + service worker network-first + íconos 180/192/512)
- [ ] Deploy a GitHub Pages o Vercel (decidir cuál; se necesita URL https para instalar en iPhone)
- [ ] Pegar API key de Anthropic en Ajustes y probar escaneo con 3-4 recibos reales
- [ ] Prueba real en iPhone (agregar a pantalla de inicio, 1 día de uso, verificar offline)

## Decisions log
- 2026-07-10 · Todo en USD, sin multi-moneda en gastos · Alfonso lo pidió explícito; el convertidor es un tab aparte sin relación con los gastos.
- 2026-07-10 · Escaneo de recibos vía API de Claude directo desde el navegador (key en Ajustes/localStorage, nunca en git) · evita backend; captura manual sigue offline.
- 2026-07-10 · PWA vanilla sin framework ni build step · Alfonso pidió lo más simple de mantener; se descartó Next.js+Supabase para esta app.
- 2026-07-10 · Ideas de agencia (portal aprobaciones "Aprueba", hub admin "Caja") estacionadas en ../APPS-BRIEF.md.

## Last session
- 2026-07-10 · MVP completo construido y verificado en preview a 375px (light + dark): captura en segundos, movimientos con edición, resumen con semáforos y safe-to-spend, gráfica 6 meses, convertidor con tasas reales, export/import. Commit 9b540bb. Se detuvo antes del deploy: falta elegir GitHub Pages vs Vercel y probar escaneo con API key real.
