# PROJECT-STATE — Gastos (app personal de gastos y presupuesto)

> PWA estática sin backend: HTML + CSS + JS vanilla, datos en localStorage, instalable en iPhone.
> Plan completo de la sesión de planeación: ver Decisions log.

## Current deliverable
MVP funcional de la PWA: captura rápida, dashboard con presupuesto y safe-to-spend, escaneo de recibos con foto (API Claude), tab convertidor de monedas, export/import.

## Approved / do not touch
- Decisión de arquitectura: sin login, sin nube, sin build step. Todo en USD.

## Backlog / parking lot
- Sincronización entre dispositivos (Supabase) — solo si el hábito pega
- Import de estados de cuenta del banco (CSV) con categorización asistida
- Gastos recurrentes/fijos automáticos
- Recordatorio diario de registro

## Open items
- [ ] Modelo de datos + storage en localStorage
- [ ] Pantalla de captura rápida (numpad + categorías + toggle Personal/DCF)
- [ ] Lista de movimientos (editar/borrar)
- [ ] Dashboard (categoría vs presupuesto, safe-to-spend, tendencia 6 meses)
- [ ] Escaneo de recibos (cámara + API Claude + confirmación editable)
- [ ] Tab convertidor de monedas (frankfurter.app, caché offline)
- [ ] Ajustes (categorías, presupuestos, API key, export/import JSON/CSV)
- [ ] PWA (manifest + service worker + íconos) y deploy a hosting estático
- [ ] Prueba real en iPhone (agregar a pantalla de inicio, 1 día de uso)

## Decisions log
- 2026-07-10 · Todo en USD, sin multi-moneda en gastos · Alfonso lo pidió explícito; el convertidor es un tab aparte sin relación con los gastos.
- 2026-07-10 · Escaneo de recibos vía API de Claude directo desde el navegador (key en Ajustes/localStorage, nunca en git) · evita backend; captura manual sigue offline.
- 2026-07-10 · PWA vanilla sin framework ni build step · Alfonso pidió lo más simple de mantener; se descartó Next.js+Supabase para esta app.
- 2026-07-10 · Ideas de agencia (portal aprobaciones "Aprueba", hub admin "Caja") estacionadas en ../APPS-BRIEF.md.

## Last session
- 2026-07-10 · Sesión de planeación + inicio de build. Plan aprobado; carpeta y repo creados.
