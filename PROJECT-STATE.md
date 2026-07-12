# PROJECT-STATE — Gastos (app personal de gastos y presupuesto)

> PWA estática sin backend: HTML + CSS + JS vanilla, datos en localStorage, instalable en iPhone.
> Plan completo de la sesión de planeación: ver Decisions log.

## Current deliverable
Estreno con Rossana: Alfonso entra en su iPhone (email+contraseña, crear hogar), Rossana instala la PWA y se une con el código. Registrar aportes del mes y primeros gastos de casa.

## Approved / do not touch
- Decisión de arquitectura: sin login, sin nube, sin build step. Todo en USD.

## Backlog / parking lot
- Presupuestos por etiqueta (Personal vs DCF) si Alfonso quiere presupuestar también el gasto del negocio; hoy los presupuestos son por categoría y el filtro del Resumen decide qué gasto cuenta
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
- [x] Prueba real en iPhone (instalada y en uso)
- [ ] Estreno v2: login de ambos, hogar creado, aportes del mes registrados

## Decisions log
- 2026-07-10 · Todo en USD, sin multi-moneda en gastos · Alfonso lo pidió explícito; el convertidor es un tab aparte sin relación con los gastos.
- 2026-07-10 · Escaneo de recibos vía API de Claude directo desde el navegador (key en Ajustes/localStorage, nunca en git) · evita backend; captura manual sigue offline.
- 2026-07-10 · PWA vanilla sin framework ni build step · Alfonso pidió lo más simple de mantener; se descartó Next.js+Supabase para esta app.
- 2026-07-11 · v2 verificada E2E contra Supabase real (12/12 checks): auth contraseña, hogar por código, sync cruzado, RLS. Escaneo de recibos ELIMINADO a pedido de Alfonso; en su lugar chip de estado de sync. Auth por email+contraseña (OTP descartado: SMTP de Supabase no entrega a terceros). Proyecto Supabase: jvbrzqqnjaxcsxeoiuht, autoconfirm ON, fix-1 de RLS aplicado. Usuarios prueba1/prueba2@gastos.test se pueden borrar.
- 2026-07-11 · Publicada en GitHub Pages (repo público budget-chif); datos personales protegidos vía .gitignore (*.local.json) · el archivo mi-presupuesto.local.json se pasa por AirDrop, nunca por el repo.
- 2026-07-10 · Ideas de agencia (portal aprobaciones "Aprueba", hub admin "Caja") estacionadas en ../APPS-BRIEF.md.

## Last session
- 2026-07-11 (2ª parte) · Gastos v2 completa: ámbito Casa compartido con Rossana (fondo común: aportes + quién pagó + equidad 50/50), sync total con Supabase (local-first, outbox offline, RLS), login email+contraseña, chip de estado de sync en lugar del botón Escanear (feature eliminada). Verificado E2E contra la base real, 12/12. Pendiente solo el estreno en los dos teléfonos.
