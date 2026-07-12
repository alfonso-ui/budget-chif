-- Fix 1: permitir que cualquier miembro del hogar edite (vía upsert) los
-- movimientos de Casa, sin importar quién los creó. Pegar en SQL Editor → Run.
drop policy "crear gastos" on public.expenses;
create policy "crear gastos" on public.expenses
  for insert with check (
    (owner_id = auth.uid() and scope <> 'casa')
    or (scope = 'casa' and household_id in (select public.my_households()))
  );
