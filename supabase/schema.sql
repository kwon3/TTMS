-- =====================================================================
-- 장애 접수·조치 관리 시스템 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor > New query 에 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하도록 작성되어 있습니다.
-- =====================================================================

-- ---------------------------------------------------------------- 사용자 프로필
-- 로그인 계정 자체는 Supabase Auth(auth.users)가 관리하고,
-- 이름·역할·소속 고객사 등 업무 정보는 profiles에 둔다.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null,
  role        text not null check (role in ('admin','manager','customer')),
  company_id  bigint,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.companies (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  manager_id  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table public.profiles
    add constraint profiles_company_fk foreign key (company_id) references public.companies(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- 장애
create table if not exists public.incidents (
  id                     bigint generated always as identity primary key,
  code                   text unique,
  company_id             bigint not null references public.companies(id),
  customer_id            uuid not null references public.profiles(id),
  manager_id             uuid references public.profiles(id),
  title                  text not null,
  description            text not null,
  severity               text not null,
  category               text not null,
  target_system          text,
  occurred_at            timestamptz,
  status                 text not null default 'received'
                           check (status in ('received','in_progress','resolved','closed')),
  cause                  text,
  action_taken           text,
  acknowledged_at        timestamptz,
  action_at              timestamptz,
  customer_confirmed_at  timestamptz,
  manager_confirmed_at   timestamptz,
  closed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 접수번호 자동 부여: INC-YYYYMMDD-0001 (한국 날짜 기준)
create or replace function public.set_incident_code() returns trigger
language plpgsql as $$
begin
  new.code := 'INC-' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD') || '-' || lpad(new.id::text, 4, '0');
  return new;
end $$;

drop trigger if exists trg_incident_code on public.incidents;
create trigger trg_incident_code before insert on public.incidents
  for each row execute function public.set_incident_code();

create table if not exists public.comments (
  id           bigint generated always as identity primary key,
  incident_id  bigint not null references public.incidents(id) on delete cascade,
  user_id      uuid not null references public.profiles(id),
  body         text not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.attachments (
  id             bigint generated always as identity primary key,
  incident_id    bigint not null references public.incidents(id) on delete cascade,
  comment_id     bigint references public.comments(id) on delete cascade,
  original_name  text not null,
  storage_path   text not null,
  mime_type      text,
  size           bigint not null,
  uploaded_by    uuid not null references public.profiles(id),
  created_at     timestamptz not null default now()
);

-- 처리 경과(타임라인). 보고서의 '처리 경과' 원천 데이터
create table if not exists public.incident_events (
  id           bigint generated always as identity primary key,
  incident_id  bigint not null references public.incidents(id) on delete cascade,
  user_id      uuid references public.profiles(id),
  type         text not null,
  detail       text,
  created_at   timestamptz not null default now()
);

create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  incident_id  bigint references public.incidents(id) on delete cascade,
  message      text not null,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- 처리완료 시점에 확정된 보고서 스냅샷 (장애 이력)
create table if not exists public.reports (
  id           bigint generated always as identity primary key,
  incident_id  bigint not null unique references public.incidents(id) on delete cascade,
  content      jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_incidents_company on public.incidents(company_id);
create index if not exists idx_incidents_manager on public.incidents(manager_id);
create index if not exists idx_comments_incident on public.comments(incident_id);
create index if not exists idx_attachments_incident on public.attachments(incident_id);
create index if not exists idx_events_incident on public.incident_events(incident_id);
create index if not exists idx_notifications_user on public.notifications(user_id, read_at);

-- ---------------------------------------------------------------- 처리완료 확인자·종결자 (v0.3 추가)
-- 누가 처리완료를 눌렀는지, 관리자 대리 확인/강제 종결인지 기록한다.
alter table public.incidents add column if not exists customer_confirmed_by uuid references public.profiles(id);
alter table public.incidents add column if not exists manager_confirmed_by  uuid references public.profiles(id);
alter table public.incidents add column if not exists closed_by             uuid references public.profiles(id);
alter table public.incidents add column if not exists close_type            text;
do $$ begin
  alter table public.incidents add constraint incidents_close_type_check check (close_type in ('confirmed', 'admin'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- 고객사별 지정 담당자 (1:N, v0.3 추가)
-- 한 고객사에 여러 담당자를 지정한다. 지정 담당자 모두에게 접수 알림이 가고,
-- 접수 확인·처리완료는 지정 담당자(또는 관리자)만 할 수 있다.
create table if not exists public.company_managers (
  company_id  bigint not null references public.companies(id) on delete cascade,
  manager_id  uuid   not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (company_id, manager_id)
);
create index if not exists idx_company_managers_manager on public.company_managers(manager_id);

-- 이전 버전(고객사당 담당자 1명)에서 지정한 담당자를 옮겨 온다
insert into public.company_managers (company_id, manager_id)
  select id, manager_id from public.companies where manager_id is not null
  on conflict do nothing;
-- 옮긴 뒤에는 비워 둔다 (이 SQL을 다시 실행해도 지정 해제한 담당자가 되살아나지 않도록)
update public.companies set manager_id = null where manager_id is not null;

-- 원인분석·조치내역을 등록한 사람
alter table public.incidents add column if not exists action_by uuid references public.profiles(id);

-- ---------------------------------------------------------------- 조회용 뷰 (이름 포함)
-- 컬럼 구성이 바뀔 수 있으므로 지우고 다시 만든다 (데이터는 영향 없음)
drop view if exists public.incidents_v;
create view public.incidents_v with (security_invoker = on) as
  select i.*,
         c.name   as company_name,
         cu.name  as customer_name,
         m.name   as manager_name,
         ccb.name as customer_confirmed_by_name,
         mcb.name as manager_confirmed_by_name,
         mcb.role as manager_confirmed_by_role,
         cb.name  as closed_by_name,
         ab.name  as action_by_name
    from public.incidents i
    join public.companies c on c.id = i.company_id
    join public.profiles cu on cu.id = i.customer_id
    left join public.profiles m   on m.id   = i.manager_id
    left join public.profiles ccb on ccb.id = i.customer_confirmed_by
    left join public.profiles mcb on mcb.id = i.manager_confirmed_by
    left join public.profiles cb  on cb.id  = i.closed_by
    left join public.profiles ab  on ab.id  = i.action_by;

create or replace view public.comments_v with (security_invoker = on) as
  select cm.*, p.name as user_name, p.role as user_role
    from public.comments cm join public.profiles p on p.id = cm.user_id;

create or replace view public.events_v with (security_invoker = on) as
  select e.*, p.name as user_name, p.role as user_role
    from public.incident_events e left join public.profiles p on p.id = e.user_id;

-- ---------------------------------------------------------------- 처리완료 확인 (동시 클릭 안전)
-- p_role: 'customer'(고객 확인) 또는 'manager'(담당자 확인 — 담당자 본인 또는 관리자 대리)
-- 반환값: 'closed'(양쪽 확인 → 종결), 'confirmed'(내 확인만 기록), 'noop'(처리 불가/이미 확인)
drop function if exists public.confirm_incident(bigint, text);
create or replace function public.confirm_incident(p_incident_id bigint, p_role text, p_user uuid)
returns text language plpgsql as $$
declare
  r public.incidents%rowtype;
  done boolean;
begin
  select * into r from public.incidents where id = p_incident_id for update;
  if not found or r.status <> 'resolved' then return 'noop'; end if;
  if p_role = 'customer' then
    if r.customer_confirmed_at is not null then return 'noop'; end if;
    r.customer_confirmed_at := now();
    r.customer_confirmed_by := p_user;
  elsif p_role = 'manager' then
    if r.manager_confirmed_at is not null then return 'noop'; end if;
    r.manager_confirmed_at := now();
    r.manager_confirmed_by := p_user;
  else
    return 'noop';
  end if;
  done := r.customer_confirmed_at is not null and r.manager_confirmed_at is not null;

  update public.incidents
     set customer_confirmed_at = r.customer_confirmed_at,
         customer_confirmed_by = r.customer_confirmed_by,
         manager_confirmed_at  = r.manager_confirmed_at,
         manager_confirmed_by  = r.manager_confirmed_by,
         status     = case when done then 'closed' else 'resolved' end,
         closed_at  = case when done then now() end,
         closed_by  = case when done then p_user end,
         close_type = case when done then 'confirmed' end,
         updated_at = now()
   where id = p_incident_id;

  return case when done then 'closed' else 'confirmed' end;
end $$;

-- 관리자 강제 종결: 단계와 관계없이 즉시 처리완료
create or replace function public.admin_close_incident(p_incident_id bigint, p_user uuid)
returns text language plpgsql as $$
begin
  update public.incidents
     set status = 'closed', closed_at = now(), closed_by = p_user, close_type = 'admin', updated_at = now()
   where id = p_incident_id and status <> 'closed';
  return case when found then 'closed' else 'noop' end;
end $$;

-- ---------------------------------------------------------------- 보안 (RLS)
-- 모든 데이터는 서버(service_role)를 통해서만 읽고 쓴다.
-- 브라우저(anon/로그인 사용자)는 '자기 알림'만 실시간 구독을 위해 읽을 수 있다.
alter table public.profiles        enable row level security;
alter table public.companies       enable row level security;
alter table public.incidents       enable row level security;
alter table public.comments        enable row level security;
alter table public.attachments     enable row level security;
alter table public.incident_events enable row level security;
alter table public.notifications   enable row level security;
alter table public.reports         enable row level security;
alter table public.company_managers enable row level security;

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.incidents_v, public.comments_v, public.events_v from anon, authenticated;
revoke execute on function public.confirm_incident(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_incident(bigint, text, uuid) to service_role;
revoke execute on function public.admin_close_incident(bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_close_incident(bigint, uuid) to service_role;

-- ---------------------------------------------------------------- 실시간 알림
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- 첨부파일 저장소 (비공개, 파일당 10MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
