-- ═══════════════════════════════════════════════════════════════════
--  نظام حجز القاعة — مخطط قاعدة البيانات (Supabase / PostgreSQL)
--
--  طريقة التشغيل:
--    Supabase ← SQL Editor ← New query ← الصق الملف كاملاً ← Run
--    الملف آمن لإعادة التشغيل (idempotent): لا يحذف بيانات موجودة.
--
--  مبدأ التصميم:
--    كل قواعد العمل (منع التداخل، الحد الأقصى للمدة، الصلاحيات)
--    مفروضة هنا داخل قاعدة البيانات، وليس في المتصفح فقط.
--    الواجهة مجرد عرض؛ حتى لو عدّل أحد الكود من المتصفح لن يتجاوز القواعد.
--
--  المحتويات:
--    1) الإضافات        4) الدوال المساعدة     7) الصلاحيات (RLS)
--    2) الجداول         5) دوال الحجز والإلغاء  8) التحديث اللحظي
--    3) العرض (View)    6) المحفّزات (Triggers) 9) البيانات الأولية
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1) الإضافات
--    btree_gist: تسمح بقيد "عدم التداخل" على (القاعة + الفترة الزمنية)
-- ───────────────────────────────────────────────────────────────────
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;


-- ───────────────────────────────────────────────────────────────────
-- 2) الجداول
-- ───────────────────────────────────────────────────────────────────

-- الفرق واللجان
create table if not exists public.teams (
  id          smallint generated always as identity primary key,
  name        text     not null unique check (char_length(btrim(name)) between 2 and 80),
  color       text     not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  smallint not null default 0,
  is_active   boolean  not null default true,
  created_at  timestamptz not null default now()
);

-- القاعات (قاعة واحدة الآن، والجدول جاهز لإضافة قاعات أو موارد أخرى مستقبلاً)
create table if not exists public.rooms (
  id           smallint generated always as identity primary key,
  name         text     not null unique check (char_length(btrim(name)) between 2 and 80),
  description  text,
  max_minutes  integer  not null default 180 check (max_minutes between 15 and 1440), -- أقصى مدة للحجز الواحد
  is_active    boolean  not null default true,
  created_at   timestamptz not null default now()
);

-- الأعضاء المصرّح لهم بالدخول (قائمة بيضاء بالإيميلات)
--   role = 'lead'  → رئيس فريق: يحجز ويلغي لفريقه فقط
--   role = 'admin' → الإدارة العليا: يحجز لأي فريق ويلغي أي حجز ويدير الأعضاء
create table if not exists public.members (
  email       text     primary key
              check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name   text     check (full_name is null or char_length(full_name) <= 100),
  team_id     smallint not null references public.teams (id),
  role        text     not null default 'lead' check (role in ('lead', 'admin')),
  is_active   boolean  not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- الحجوزات
--   الإلغاء لا يحذف السجل؛ يغيّر الحالة إلى cancelled ويحفظ من ألغى ولماذا.
create table if not exists public.bookings (
  id                  uuid        primary key default gen_random_uuid(),
  room_id             smallint    not null references public.rooms (id),
  team_id             smallint    not null references public.teams (id),
  title               text        check (title is null or char_length(title) between 1 and 120),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  status              text        not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by          uuid,
  created_by_email    text        not null,
  created_by_name     text,
  created_at          timestamptz not null default now(),
  cancelled_at        timestamptz,
  cancelled_by_email  text,
  cancel_reason       text        check (cancel_reason is null or char_length(cancel_reason) <= 300),

  constraint bookings_time_order check (ends_at > starts_at),
  constraint bookings_cancel_consistency check ((status = 'cancelled') = (cancelled_at is not null)),

  -- ★ القيد الأهم: يستحيل وجود حجزين مؤكَّدين متداخلين في نفس القاعة.
  --   '[)' تعني أن النهاية غير مشمولة، فحجز ينتهي 10:00 وآخر يبدأ 10:00 مسموح.
  constraint bookings_no_overlap exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed')
);

create index if not exists bookings_starts_at_idx on public.bookings (starts_at);
create index if not exists bookings_team_starts_idx on public.bookings (team_id, starts_at);


-- ───────────────────────────────────────────────────────────────────
-- 3) العرض: الحجوزات مع اسم الفريق ولونه واسم القاعة
--    security_invoker = يطبّق صلاحيات المستخدم نفسه (RLS) على هذا العرض
-- ───────────────────────────────────────────────────────────────────
create or replace view public.booking_details
with (security_invoker = true) as
select
  b.id, b.room_id, r.name as room_name,
  b.team_id, t.name as team_name, t.color as team_color,
  b.title, b.starts_at, b.ends_at, b.status,
  b.created_by_email, b.created_by_name, b.created_at,
  b.cancelled_at, b.cancelled_by_email, b.cancel_reason
from public.bookings b
join public.teams t on t.id = b.team_id
join public.rooms r on r.id = b.room_id;


-- ───────────────────────────────────────────────────────────────────
-- 4) دوال مساعدة لمعرفة المستخدم الحالي
--    security definer + search_path فارغ = ممارسة Supabase الموصى بها
-- ───────────────────────────────────────────────────────────────────

-- إيميل المستخدم الحالي، بشرط أنه دخل بحساب جوجل
create or replace function public.auth_email()
returns text
language sql stable
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
      or auth.jwt() -> 'app_metadata' ->> 'provider' = 'google'
    then lower(auth.jwt() ->> 'email')
  end;
$$;

-- سجل العضو الحالي (أو null إذا لم يكن في القائمة أو كان معطّلاً)
create or replace function public.current_member()
returns public.members
language sql stable security definer
set search_path = ''
as $$
  select m.* from public.members m
  where m.email = public.auth_email() and m.is_active
  limit 1;
$$;

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.email = public.auth_email() and m.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.email = public.auth_email() and m.is_active and m.role = 'admin'
  );
$$;

-- بيانات المستخدم الحالي للواجهة (الاسم، الفريق، الدور)
create or replace function public.get_my_profile()
returns table (
  email text, full_name text, role text,
  team_id smallint, team_name text, team_color text
)
language sql stable security definer
set search_path = ''
as $$
  select m.email, m.full_name, m.role, t.id, t.name, t.color
  from public.members m
  join public.teams t on t.id = m.team_id
  where m.email = public.auth_email() and m.is_active;
$$;


-- ───────────────────────────────────────────────────────────────────
-- 5) دوال الحجز والإلغاء
--    الواجهة لا تكتب في جدول الحجوزات مباشرة؛ تستدعي هذه الدوال فقط.
--    رموز الأخطاء (message) تترجمها الواجهة إلى رسائل عربية.
-- ───────────────────────────────────────────────────────────────────

drop function if exists public.create_booking(timestamptz, timestamptz, text, smallint, smallint);
create or replace function public.create_booking(
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_title     text     default null,
  p_team_id   integer  default null,   -- للإدارة فقط: الحجز باسم فريق آخر
  p_room_id   integer  default null    -- فارغ = القاعة الافتراضية
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me       public.members;
  v_room     public.rooms;
  v_team_id  smallint;
  v_title    text := nullif(btrim(p_title), '');
  v_conflict text;
  v_id       uuid;
begin
  -- 1. من يحجز؟
  v_me := public.current_member();
  if v_me.email is null then
    raise exception using errcode = 'P0001', message = 'NOT_MEMBER';
  end if;

  -- 2. أي قاعة؟
  if p_room_id is null then
    select * into v_room from public.rooms where is_active order by id limit 1;
  else
    select * into v_room from public.rooms where id = p_room_id and is_active;
  end if;
  if v_room.id is null then
    raise exception using errcode = 'P0001', message = 'ROOM_NOT_FOUND';
  end if;

  -- 3. باسم أي فريق؟ (الرئيس لفريقه فقط، الإدارة لأي فريق)
  v_team_id := coalesce(p_team_id, v_me.team_id);
  if v_team_id <> v_me.team_id and v_me.role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if not exists (select 1 from public.teams where id = v_team_id and is_active) then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  -- 4. التحقق من الوقت والمدة
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception using errcode = 'P0001', message = 'INVALID_TIME';
  end if;
  if p_ends_at - p_starts_at > make_interval(mins => v_room.max_minutes) then
    raise exception using errcode = 'P0001', message = 'TOO_LONG',
                          detail = v_room.max_minutes::text;
  end if;
  if p_starts_at < now() - interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'IN_PAST';
  end if;
  if char_length(v_title) > 120 then
    raise exception using errcode = 'P0001', message = 'TITLE_TOO_LONG';
  end if;

  -- 5. فحص ودّي للتعارض لإظهار اسم الفريق الحاجز
  --    (الضمان الحقيقي هو القيد bookings_no_overlap حتى لو حجز اثنان في نفس اللحظة)
  select t.name into v_conflict
  from public.bookings b
  join public.teams t on t.id = b.team_id
  where b.room_id = v_room.id
    and b.status = 'confirmed'
    and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  limit 1;
  if v_conflict is not null then
    raise exception using errcode = 'P0001', message = 'OVERLAP', detail = v_conflict;
  end if;

  -- 6. الحجز
  insert into public.bookings
    (room_id, team_id, title, starts_at, ends_at, created_by, created_by_email, created_by_name)
  values
    (v_room.id, v_team_id, v_title, p_starts_at, p_ends_at, auth.uid(), v_me.email,
     coalesce(v_me.full_name, auth.jwt() -> 'user_metadata' ->> 'full_name'))
  returning id into v_id;

  return v_id;

exception
  when exclusion_violation then   -- سباق: شخصان حجزا نفس الوقت في نفس اللحظة
    raise exception using errcode = 'P0001', message = 'OVERLAP';
end;
$$;


create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason     text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me     public.members;
  v_b      public.bookings;
  v_reason text := nullif(btrim(p_reason), '');
begin
  v_me := public.current_member();
  if v_me.email is null then
    raise exception using errcode = 'P0001', message = 'NOT_MEMBER';
  end if;

  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_b.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'ALREADY_CANCELLED';
  end if;
  if char_length(v_reason) > 300 then
    raise exception using errcode = 'P0001', message = 'REASON_TOO_LONG';
  end if;

  if v_me.role = 'admin' then
    -- الإدارة تلغي أي حجز، لكن يلزم ذكر السبب إذا كان لفريق آخر
    if v_b.team_id <> v_me.team_id and v_reason is null then
      raise exception using errcode = 'P0001', message = 'REASON_REQUIRED';
    end if;
  else
    -- رئيس الفريق: حجوزات فريقه فقط، وقبل انتهائها
    if v_b.team_id <> v_me.team_id then
      raise exception using errcode = 'P0001', message = 'FORBIDDEN';
    end if;
    if v_b.ends_at <= now() then
      raise exception using errcode = 'P0001', message = 'BOOKING_ENDED';
    end if;
  end if;

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_email = v_me.email,
      cancel_reason = v_reason
  where id = v_b.id;
end;
$$;


-- ───────────────────────────────────────────────────────────────────
-- 6) المحفّزات
-- ───────────────────────────────────────────────────────────────────

-- تحديث updated_at تلقائياً + توحيد الإيميل بحروف صغيرة
create or replace function public.members_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  new.full_name := nullif(btrim(new.full_name), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists members_before_write on public.members;
create trigger members_before_write
  before insert or update on public.members
  for each row execute function public.members_before_write();

-- حماية: لا يمكن حذف أو تعطيل أو تخفيض آخر مدير نشط (حتى لا يُقفل النظام)
create or replace function public.members_keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.is_active)
     and not exists (
       select 1 from public.members
       where role = 'admin' and is_active and email <> old.email
     )
  then
    raise exception using errcode = 'P0001', message = 'LAST_ADMIN';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists members_keep_one_admin on public.members;
create trigger members_keep_one_admin
  before update or delete on public.members
  for each row execute function public.members_keep_one_admin();


-- ───────────────────────────────────────────────────────────────────
-- 7) الصلاحيات (Row Level Security)
--    القاعدة: لا شيء مسموح إلا ما نصّت عليه سياسة صريحة.
-- ───────────────────────────────────────────────────────────────────
alter table public.teams    enable row level security;
alter table public.rooms    enable row level security;
alter table public.members  enable row level security;
alter table public.bookings enable row level security;

-- الفرق والقاعات: يقرؤها الأعضاء، وتعدّلها الإدارة
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (public.is_member());
drop policy if exists teams_admin_write on public.teams;
create policy teams_admin_write on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (public.is_member());
drop policy if exists rooms_admin_write on public.rooms;
create policy rooms_admin_write on public.rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- الأعضاء: كل شخص يرى سجله فقط، والإدارة ترى الكل وتديره
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated using (email = public.auth_email() or public.is_admin());
drop policy if exists members_admin_write on public.members;
create policy members_admin_write on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- الحجوزات: يقرؤها كل الأعضاء؛ الكتابة فقط عبر create_booking و cancel_booking
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated using (public.is_member());

-- طبقة حماية إضافية: منع الكتابة المباشرة على جدول الحجوزات
revoke insert, update, delete, truncate on public.bookings from anon, authenticated;
revoke all on public.teams, public.rooms, public.members, public.bookings from anon;
revoke select on public.booking_details from anon;
grant select on public.booking_details to authenticated;

-- الدوال: للمستخدمين المسجّلين فقط
revoke execute on function public.create_booking(timestamptz, timestamptz, text, integer, integer) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.get_my_profile() from public, anon;
grant  execute on function public.create_booking(timestamptz, timestamptz, text, integer, integer) to authenticated;
grant  execute on function public.cancel_booking(uuid, text) to authenticated;
grant  execute on function public.get_my_profile() to authenticated;


-- ───────────────────────────────────────────────────────────────────
-- 8) التحديث اللحظي (Realtime): أي حجز جديد يظهر عند الجميع فوراً
-- ───────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
     )
  then
    alter publication supabase_realtime add table public.bookings;
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────
-- 9) البيانات الأولية
-- ───────────────────────────────────────────────────────────────────
insert into public.teams (name, color, sort_order) values
  ('الإدارة العليا',              '#432D61',  1),
  ('لجنة اليوم المفتوح',          '#3FA4D3',  2),
  ('لجنة المسرح',                 '#E0533D',  3),
  ('لجنة الديكور',                '#D9488B',  4),
  ('لجنة الافتتاح والختام',       '#E6A23C',  5),
  ('فريق التسويق',                '#2BA672',  6),
  ('لجنة المشتريات والمطبوعات',   '#8B5CF6',  7),
  ('اللجنة الإعلامية',            '#0EA5A4',  8),
  ('لجنة العلاقات والمالية',      '#4F6BED',  9),
  ('لجنة المشاريع',               '#A16207', 10),
  ('اللجنة التنظيمية',            '#64748B', 11)
on conflict (name) do nothing;

insert into public.rooms (name, max_minutes)
values ('القاعة', 180)
on conflict (name) do nothing;


-- ═══════════════════════════════════════════════════════════════════
--  ★ خطوة أخيرة مطلوبة: أضف أول مدير (إيميل جوجل الخاص بك)
--    عدّل الإيميل والاسم في السطرين التاليين، ثم شغّلهما.
--    بعدها تضيف باقي الأعضاء من لوحة الإدارة داخل الموقع.
-- ═══════════════════════════════════════════════════════════════════
-- insert into public.members (email, full_name, team_id, role)
-- select 'your.email@gmail.com', 'اسمك', id, 'admin' from public.teams where name = 'الإدارة العليا';
