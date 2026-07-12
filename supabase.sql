-- ============================================================
-- Gastos v2 — esquema + seguridad (RLS)
-- Pegar COMPLETO en Supabase: Dashboard → SQL Editor → Run
-- Es idempotente-ish: pensado para correrse una sola vez.
-- ============================================================

create extension if not exists pgcrypto;

-- Hogares (uno por pareja)
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Casa',
  invite_code text not null unique default upper(encode(gen_random_bytes(4), 'hex')),
  created_at timestamptz not null default now()
);

-- Miembros del hogar
create table public.memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Gastos y aportes (los ids los genera el cliente)
create table public.expenses (
  id text primary key,
  owner_id uuid not null references auth.users(id),
  household_id uuid references public.households(id),
  scope text not null check (scope in ('personal', 'dcf', 'casa')),
  kind text not null default 'gasto' check (kind in ('gasto', 'aporte')),
  amount numeric not null,
  cat_id text,
  note text not null default '',
  ts bigint not null,
  paid_by text,
  updated_at timestamptz not null,
  deleted boolean not null default false
);
create index expenses_sync_idx on public.expenses (updated_at);
create index expenses_owner_idx on public.expenses (owner_id);
create index expenses_casa_idx on public.expenses (household_id) where scope = 'casa';

-- Config personal de cada usuario (categorías, presupuestos, ajustes; NUNCA la API key)
create table public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null
);

-- Config compartida del hogar (categorías y presupuestos de Casa)
create table public.household_state (
  household_id uuid primary key references public.households(id) on delete cascade,
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null
);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.expenses enable row level security;
alter table public.user_state enable row level security;
alter table public.household_state enable row level security;

-- Helper: hogares a los que pertenezco (security definer evita recursión de RLS)
create or replace function public.my_households()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from memberships where user_id = auth.uid()
$$;

create policy "ver mi hogar" on public.households
  for select using (id in (select public.my_households()));

create policy "ver miembros de mi hogar" on public.memberships
  for select using (household_id in (select public.my_households()));

create policy "leer gastos propios o de casa" on public.expenses
  for select using (
    owner_id = auth.uid()
    or (scope = 'casa' and household_id in (select public.my_households()))
  );
create policy "crear gastos" on public.expenses
  for insert with check (
    owner_id = auth.uid()
    and (scope <> 'casa' or household_id in (select public.my_households()))
  );
create policy "editar gastos propios o de casa" on public.expenses
  for update using (
    owner_id = auth.uid()
    or (scope = 'casa' and household_id in (select public.my_households()))
  ) with check (
    owner_id = auth.uid()
    or (scope = 'casa' and household_id in (select public.my_households()))
  );

create policy "mi config" on public.user_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "config de mi hogar" on public.household_state
  for all using (household_id in (select public.my_households()))
  with check (household_id in (select public.my_households()));

-- ------------------------------------------------------------
-- RPCs: crear hogar / unirse con código
-- ------------------------------------------------------------
create or replace function public.create_household(p_name text, p_display_name text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  h households;
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;
  insert into households (name) values (coalesce(nullif(trim(p_name), ''), 'Casa')) returning * into h;
  insert into memberships (household_id, user_id, display_name)
    values (h.id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Yo'));
  return json_build_object('id', h.id, 'name', h.name, 'invite_code', h.invite_code);
end;
$$;

create or replace function public.join_household(p_code text, p_display_name text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  h households;
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if h.id is null then
    raise exception 'código inválido';
  end if;
  insert into memberships (household_id, user_id, display_name)
    values (h.id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Miembro'))
    on conflict (household_id, user_id) do nothing;
  return json_build_object('id', h.id, 'name', h.name, 'invite_code', h.invite_code);
end;
$$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.my_households() to authenticated;
