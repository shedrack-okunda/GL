-- GuardLog database schema
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run on a fresh project. Not idempotent for the types/tables.

-- ─────────────────────────────────────────────────────────────
-- 1. Profiles (one per login) – holds the role
-- ─────────────────────────────────────────────────────────────
create type public.user_role as enum ('guard', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        public.user_role not null default 'guard',
  created_at  timestamptz not null default now()
);

-- Every new auth user automatically becomes a guard.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Used by RLS policies below. security definer avoids recursive policy checks.
create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Units / destinations (dropdown shown to guards on entry)
-- ─────────────────────────────────────────────────────────────
create table public.units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. Residents / staff – pre-registered plates (the "vehicles" register)
--    Plates are stored normalised: uppercase, letters + digits only (KDA123A).
-- ─────────────────────────────────────────────────────────────
create table public.residents (
  id          uuid primary key default gen_random_uuid(),
  plate       text not null unique check (plate = upper(plate) and plate ~ '^[A-Z0-9]{2,12}$'),
  full_name   text not null,
  kind        text not null default 'resident' check (kind in ('resident', 'staff')),
  unit_id     uuid references public.units (id) on delete set null,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. Logs – one row per visit (entry + exit)
--    id is generated on the device so entries made offline can be synced safely.
--    unit_name is a snapshot, so history survives renaming/deleting a unit.
-- ─────────────────────────────────────────────────────────────
create table public.logs (
  id             uuid primary key default gen_random_uuid(),
  plate          text not null check (plate = upper(plate) and plate ~ '^[A-Z0-9]{2,12}$'),
  unit_id        uuid references public.units (id) on delete set null,
  unit_name      text,
  driver_name    text,
  resident_id    uuid references public.residents (id) on delete set null,
  is_registered  boolean not null default false,
  entry_time     timestamptz not null default now(),
  exit_time      timestamptz,
  entered_by     uuid references auth.users (id) default auth.uid(),
  exited_by      uuid references auth.users (id),
  created_at     timestamptz not null default now()
);

-- A plate can only be "inside" once. Also makes retried offline syncs idempotent.
create unique index logs_one_open_per_plate on public.logs (plate) where exit_time is null;
create index logs_entry_time_idx on public.logs (entry_time desc);
create index logs_plate_idx      on public.logs (plate);

-- Stamp who closed the visit.
create function public.set_exited_by()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if old.exit_time is null and new.exit_time is not null then
    new.exited_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger logs_set_exited_by
  before update on public.logs
  for each row execute function public.set_exited_by();

-- Guards may only change exit_time on a log; nothing else.
revoke update on public.logs from authenticated;
grant  update (exit_time) on public.logs to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles  enable row level security;
alter table public.units     enable row level security;
alter table public.residents enable row level security;
alter table public.logs      enable row level security;

-- profiles: read your own (admins read all). Roles are changed from the SQL editor only.
create policy "profiles read own or admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- units: everyone signed in can read; only admins write
create policy "units read"         on public.units for select to authenticated using (true);
create policy "units admin insert" on public.units for insert to authenticated with check (public.is_admin());
create policy "units admin update" on public.units for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "units admin delete" on public.units for delete to authenticated using (public.is_admin());

-- residents: everyone signed in can read; only admins write
create policy "residents read"         on public.residents for select to authenticated using (true);
create policy "residents admin insert" on public.residents for insert to authenticated with check (public.is_admin());
create policy "residents admin update" on public.residents for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "residents admin delete" on public.residents for delete to authenticated using (public.is_admin());

-- logs: any signed-in guard/admin can read, add entries and record exits; only admins delete
create policy "logs read"         on public.logs for select to authenticated using (true);
create policy "logs insert"       on public.logs for insert to authenticated with check (true);
create policy "logs update exit"  on public.logs for update to authenticated using (true) with check (true);
create policy "logs admin delete" on public.logs for delete to authenticated using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6. Realtime (live "inside" feed across gates)
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.logs, public.residents, public.units;

-- ─────────────────────────────────────────────────────────────
-- 7. Starter data (edit freely)
-- ─────────────────────────────────────────────────────────────
insert into public.units (name) values
  ('Block A'), ('Block B'), ('Block C'), ('Management office'), ('Deliveries / Loading bay');

-- ─────────────────────────────────────────────────────────────
-- 8. Make yourself an admin
--    1) Create your user: Dashboard → Authentication → Users → Add user (tick "Auto confirm").
--    2) Then run (with your email):
-- ─────────────────────────────────────────────────────────────
-- update public.profiles set role = 'admin'
--  where id = (select id from auth.users where email = 'you@example.com');
