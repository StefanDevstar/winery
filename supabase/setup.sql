-- Winery Tool shared storage table
-- Run this in Supabase SQL Editor.

create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.app_kv enable row level security;

drop policy if exists "app_kv_select" on public.app_kv;
drop policy if exists "app_kv_insert" on public.app_kv;
drop policy if exists "app_kv_update" on public.app_kv;
drop policy if exists "app_kv_delete" on public.app_kv;

create policy "app_kv_select"
on public.app_kv
for select
to authenticated
using (true);

create policy "app_kv_insert"
on public.app_kv
for insert
to authenticated
with check (true);

create policy "app_kv_update"
on public.app_kv
for update
to authenticated
using (true)
with check (true);

create policy "app_kv_delete"
on public.app_kv
for delete
to authenticated
using (true);
