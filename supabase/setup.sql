-- ═════════════════════════════════════════════════════════════════════════
-- Tiniq — Supabase bazasi (bitta fayl). Supabase → SQL Editor → New query → shuni qo'yib "Run".
-- Qayta ishga tushirish xavfsiz (mavjud ma'lumotlar o'chirilmaydi).
--
-- Muhim: BIRINCHI bo'lib ro'yxatdan o'tgan foydalanuvchi avtomatik SUPER ADMIN bo'ladi.
-- Shuning uchun sayt manzilini boshqalarga bermasdan oldin o'zingiz ro'yxatdan o'ting.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Profillar ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin', 'superadmin')),
  is_blocked   boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

-- Yordamchi funksiyalar (RLS ichida rekursiyaga tushmaslik uchun security definer)
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin') and not is_blocked)
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin' and not is_blocked)
$$;

-- Yangi foydalanuvchi → profil. Birinchisi super admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  perform pg_advisory_xact_lock(70011);
  r := case when exists (select 1 from public.profiles where role = 'superadmin') then 'user' else 'superadmin' end;
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    r
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Foydalanuvchi o'z rolini, bloklanishini va emailini o'zgartira olmasligi uchun himoya.
-- (Edge Function service-role bilan ishlaydi — auth.uid() bo'sh, shuning uchun u o'zgartira oladi.)
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.id := old.id;
    new.role := old.role;
    new.is_blocked := old.is_blocked;
    new.email := old.email;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
-- O'zini ko'radi; super admin hammani; admin faqat oddiy foydalanuvchilarni
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_superadmin() or (public.is_staff() and role = 'user'));
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ── API kalitlar (klientdan butunlay yopiq: faqat Edge Function / service-role) ──
create table if not exists public.api_keys (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null check (provider in ('gemini', 'openai', 'replicate', 'stability')),
  label                text,
  key_value            text not null,
  model                text,
  priority             int  not null default 100,
  is_active            boolean not null default true,
  success_count        int  not null default 0,
  failure_count        int  not null default 0,
  consecutive_failures int  not null default 0,
  last_used_at         timestamptz,
  last_error           text,
  created_at           timestamptz not null default now()
);
alter table public.api_keys enable row level security;   -- siyosat yo'q = klient ko'ra olmaydi

-- ── Sozlamalar (faqat Edge Function) ──────────────────────────────────────
create table if not exists public.settings (
  key   text primary key,
  value text not null
);
alter table public.settings enable row level security;
insert into public.settings (key, value) values
  ('ai_enabled', 'on'),
  ('ai_daily_limit', '10'),
  ('ai_provider', 'auto')
on conflict (key) do nothing;

-- ── Kunlik foydalanish hisobi va jurnal ──────────────────────────────────
create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table public.usage enable row level security;
drop policy if exists usage_select_own on public.usage;
create policy usage_select_own on public.usage for select using (user_id = auth.uid());

create table if not exists public.ai_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  provider   text,
  mode       text,
  ok         boolean not null,
  ms         int,
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists ai_log_created_idx on public.ai_log (created_at desc);
alter table public.ai_log enable row level security;     -- siyosat yo'q = faqat service-role

-- Atomik hisoblagich (faqat Edge Function chaqiradi)
create or replace function public.bump_usage(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into public.usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = public.usage.count + 1
  returning count into c;
  return c;
end $$;
revoke all on function public.bump_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid) to service_role;
