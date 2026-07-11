# PROJECT-STATE — Gastos (app personal de gastos y presupuesto)

> PWA estática sin backend: HTML + CSS + JS vanilla, datos en localStorage, instalable en iPhone.
> Plan completo de la sesión de planeación: ver Decisions log.

## Current deliverable
Usar la app unos días con gastos reales y probar el escaneo de recibos con la API key. Luego decidir mejoras (¿presupuestos por etiqueta DCF?).

## Approved / do not touch
- Decisión de arquitectura: sin login, sin nube, sin build step. Todo en USD.

## Backlog / parking lot
- Presupuestos por etiqueta (Personal vs DCF) si Alfonso quiere presupuestar también el gasto del negocio; hoy los presupuestos son por categoría y el filtro del Resumen decide qué gasto cuenta
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
- [x] Deploy a GitHub Pages: https://alfonso-ui.github.io/budget-chif/ (repo alfonso-ui/budget-chif)
- [ ] Pegar API key de Anthropic en Ajustes y probar escaneo con 3-4 recibos reales
- [ ] Prueba real en iPhone (agregar a pantalla de inicio, 1 día de uso, verificar offline)

## Decisions log
- 2026-07-10 · Todo en USD, sin multi-moneda en gastos · Alfonso lo pidió explícito; el convertidor es un tab aparte sin relación con los gastos.
- 2026-07-10 · Escaneo de recibos vía API de Claude directo desde el navegador (key en Ajustes/localStorage, nunca en git) · evita backend; captura manual sigue offline.
- 2026-07-10 · PWA vanilla sin framework ni build step · Alfonso pidió lo más simple de mantener; se descartó Next.js+Supabase para esta app.
- 2026-07-11 · Publicada en GitHub Pages (repo público budget-chif); datos personales protegidos vía .gitignore (*.local.json) · el archivo mi-presupuesto.local.json se pasa por AirDrop, nunca por el repo.
- 2026-07-10 · Ideas de agencia (portal aprobaciones "Aprueba", hub admin "Caja") estacionadas en ../APPS-BRIEF.md.

## Last session
- 2026-07-11 · Sesión completa de lanzamiento: pase visual (ui-rounded, tile héroe, blur, animaciones), 4 temas de color + control Auto/Claro/Oscuro, deploy a GitHub Pages (repo alfonso-ui/budget-chif), app instalada en el iPhone de Alfonso con su presupuesto real importado (12 categorías, $550 variables del PDF "Fonchi Budget"). Fix del zoom de iOS en campos (16px + maximum-scale=1). Transporte quedó sin presupuesto: lo paga DCF y se registra con esa etiqueta. Pendiente: probar escaneo de recibos con API key real.
