-- CareerPilot AI schema. Run in Supabase SQL editor (or `supabase db push`).
-- Every user-owned table has Row Level Security: a signed-in user can only
-- touch rows where user_id = auth.uid(). Background jobs use the service role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profile
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  location text not null default 'India',
  education text not null default '',
  education_level text not null default 'bachelor', -- bachelor | master | diploma | other
  certifications text[] not null default '{}',
  -- Work history. kind = 'analytics' | 'non_analytics'. Matching only counts
  -- analytics years as analyst experience, so CRM work is never inflated.
  experience jsonb not null default '[]'::jsonb,
  skills text[] not null default '{}',
  projects jsonb not null default '[]'::jsonb,
  target_roles text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  summary text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  automation_enabled boolean not null default true,
  run_hour_ist int not null default 8 check (run_hour_ist between 0 and 23),
  match_threshold int not null default 80 check (match_threshold between 40 and 100),
  posts_per_day int not null default 3 check (posts_per_day between 1 and 5),
  notify_in_app boolean not null default true,
  notify_browser boolean not null default true,
  notify_telegram boolean not null default false,
  telegram_chat_id text,
  research_topics text[] not null default '{}',
  job_queries text[] not null default '{}',
  sources jsonb not null default '{"greenhouse":[],"lever":[],"ashby":[],"remotive":true,"adzuna":true,"jooble":true}'::jsonb,
  max_job_age_days int not null default 30,
  updated_at timestamptz not null default now()
);

-- LinkedIn tokens: RLS on, NO policies => only the service role can read/write.
create table if not exists public.linkedin_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  linkedin_sub text not null,
  name text,
  email text,
  picture text,
  access_token_enc text not null,
  scopes text not null default '',
  expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- research
create table if not exists public.research_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_date date not null,
  topic text not null,
  title text not null,
  summary text not null default '',
  url text not null,
  source text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index if not exists research_user_date on public.research_items(user_id, run_date desc);

create table if not exists public.research_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_date date not null,
  digest text not null,
  created_at timestamptz not null default now(),
  unique (user_id, run_date)
);

-- ---------------------------------------------------------------- jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  title text not null,
  company text not null,
  location text not null default '',
  is_remote boolean not null default false,
  experience_text text,
  exp_min numeric,
  exp_max numeric,
  salary text,
  skills text[] not null default '{}',
  description text not null default '',
  posted_at timestamptz,
  apply_url text not null,
  source text not null,
  source_ref text,
  status text not null default 'active' check (status in ('active','expired','dismissed')),
  score int,
  score_breakdown jsonb,
  match jsonb,
  ai_summary text,
  notified_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists jobs_user_score on public.jobs(user_id, status, score desc);

create table if not exists public.application_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('resume_tips','cover_letter','prep')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists materials_job on public.application_materials(job_id, kind, created_at desc);

-- ---------------------------------------------------------------- applications
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  company text not null,
  position text not null,
  match_score int,
  status text not null default 'saved'
    check (status in ('saved','to_apply','applied','assessment','interview','offer','rejected')),
  applied_at date,
  recruiter text,
  follow_up_at date,
  interview_at timestamptz,
  notes text not null default '',
  apply_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Plain unique constraint (not a partial index) so upserts can target it.
-- NULL job_ids never collide, so manual entries without a job are unaffected.
do $$ begin
  alter table public.applications add constraint applications_user_job unique (user_id, job_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- ---------------------------------------------------------------- recruiters
create table if not exists public.recruiters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  designation text not null default '',
  company text not null default '',
  profile_url text,
  hiring_interests text not null default '',
  related_job_id uuid references public.jobs(id) on delete set null,
  source_url text,
  origin text not null default 'manual' check (origin in ('manual','ai_search')),
  verified boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, name, company)
);

-- ---------------------------------------------------------------- posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_date date not null,
  angle text not null default '',
  content text not null,
  hashtags text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','approved','scheduled','publishing','published','failed','discarded')),
  scheduled_at timestamptz,
  published_at timestamptz,
  linkedin_post_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_user_date on public.posts(user_id, run_date desc);

-- ---------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('job_match','error','report','info','linkedin')),
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  snoozed_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notif_user on public.notifications(user_id, read, created_at desc);

-- ---------------------------------------------------------------- reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, report_date)
);

-- ---------------------------------------------------------------- automation log
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_date date not null,
  step text not null,
  status text not null check (status in ('running','success','failed')),
  attempts int not null default 0,
  trigger text not null default 'schedule',
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, run_date, step)
);

-- ---------------------------------------------------------------- free-form memory
create table if not exists public.memory_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'other' check (category in ('interview','learning','preference','other')),
  title text not null,
  content text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','research_items','research_digests','jobs','application_materials',
    'applications','recruiters','posts','notifications','reports','automation_runs','memory_notes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.linkedin_connections enable row level security;
-- (intentionally no policies on linkedin_connections)

-- ---------------------------------------------------------------- realtime for pop-ups
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
