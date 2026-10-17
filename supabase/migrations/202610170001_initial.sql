-- Review and apply in the Supabase SQL editor or CLI. No credentials belong here.
begin;
create extension if not exists vector with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  onboarding_complete boolean not null default false,
  version integer not null default 1,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint valid_onboarded_preferences check (not onboarding_complete or coalesce((
    preferences->>'language' in ('en','ur') and preferences->>'minutes' in ('5','10','15')
    and preferences->>'purpose' in ('understand','work','learn','explore')
    and preferences->>'depth' in ('concise','context') and preferences->>'discovery' in ('low','medium','high')
    and preferences->>'uncertainty' in ('early','confirmed') and preferences->>'updates' in ('major','incremental')
    and jsonb_typeof(preferences->'memory_enabled')='boolean'
    and jsonb_typeof(preferences->'topics')='array' and jsonb_array_length(preferences->'topics') between 1 and 8
    and jsonb_typeof(preferences->'regions')='array' and jsonb_array_length(preferences->'regions')<=10
    and jsonb_typeof(preferences->'entities')='array' and jsonb_array_length(preferences->'entities')<=15
    and length(preferences->>'timezone') between 1 and 80
  ),false))
);
create table public.sources (
  id text primary key, name text not null, feed_url text unique not null,
  enabled boolean not null default false, capabilities jsonb not null default '{}'::jsonb,
  policy_url text not null, reviewed_at date not null, last_fetched_at timestamptz
);
insert into public.sources(id,name,feed_url,enabled,capabilities,policy_url,reviewed_at)
values('global-voices','Global Voices','https://globalvoices.org/feed/',true,
  '{"original_text_only":true,"fetch":true,"summarize":true,"translate":true,"pdf":true,"images":false}'::jsonb,
  'https://globalvoices.org/about/global-voices-attribution-policy/','2026-10-17');
alter table public.sources enable row level security;
grant select on public.sources to authenticated;
create policy enabled_source_read on public.sources for select to authenticated using(enabled);
create table public.articles (
  id text primary key, title text not null, url text unique not null,
  source text not null, author text not null, published_at timestamptz not null,
  excerpt text not null, body text not null, topics text[] not null default '{}',
  regions text[] not null default '{}', entities text[] not null default '{}',
  cluster_id text not null, license_url text not null, language text not null,
  approved boolean not null default false, embedding extensions.vector(768),
  created_at timestamptz not null default now()
);
create table public.editions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_date date not null, language text not null check(language in ('en','ur')),
  status text not null default 'pending' check(status in ('pending','building','published','unavailable')),
  items jsonb not null default '[]'::jsonb, minutes integer not null,
  profile_version integer not null, pdf_path text, error_code text,
  created_at timestamptz not null default now(), published_at timestamptz,
  unique(user_id,edition_date)
);
create table public.article_briefs (
  article_id text not null references public.articles(id) on delete cascade,
  content_hash text not null,language text not null,depth text not null,model text not null,prompt_version text not null,
  title text not null,summary text not null,created_at timestamptz not null default now(),
  primary key(article_id,content_hash,language,depth,model,prompt_version)
);
create table public.article_versions (
  article_id text not null references public.articles(id) on delete cascade,
  content_hash text not null,title text not null,body text not null,published_at timestamptz not null,
  cluster_id text not null,first_seen_at timestamptz not null default now(),primary key(article_id,content_hash)
);
alter table public.article_versions enable row level security;
create policy approved_version_read on public.article_versions for select to authenticated
using(exists(select 1 from public.articles where id=article_id and approved));
grant select on public.article_versions to authenticated;
alter table public.article_briefs enable row level security;
create policy approved_brief_read on public.article_briefs for select to authenticated
using(exists(select 1 from public.articles where id=article_id and approved));
grant select on public.article_briefs to authenticated;
create table public.feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  article_id text not null references public.articles(id),
  action text not null check(action in ('more','less','read','open','impression')),
  created_at timestamptz not null default now(), unique(user_id,article_id,action)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'News conversation', created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check(role in ('user','assistant')), content text not null,
  sources jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table public.memories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('topic','entity','region')), value text not null check(length(value) between 1 and 80),
  status text not null default 'proposed' check(status in ('proposed','accepted','forgotten')),
  evidence_message_id uuid references public.messages(id) on delete cascade,
  confirmed boolean not null default false, version integer not null default 1,
  expires_at timestamptz, created_at timestamptz not null default now(),
  unique(user_id,kind,value)
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check(type in ('edition','memory','pdf','index')),
  key text unique not null, payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  locked_until timestamptz, error_code text, created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, properties jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  task text not null, model text not null, tokens integer not null, created_at timestamptz not null default now()
);
create table public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade, action text not null,
  window_start timestamptz not null, count integer not null default 1, primary key(user_id,action,window_start)
);
create index articles_published_idx on public.articles(published_at desc);
create index editions_owner_date_idx on public.editions(user_id,edition_date desc);
create index feedback_owner_idx on public.feedback(user_id,created_at desc);
create index messages_owner_conversation_idx on public.messages(user_id,conversation_id,created_at);
create index memories_owner_status_idx on public.memories(user_id,status);
create index jobs_available_idx on public.jobs(status,available_at);
create index events_owner_date_idx on public.events(user_id,created_at);

create function public.search_articles(query_embedding extensions.vector(768),match_count integer default 30)
returns table(id text,title text,url text,source text,author text,published_at timestamptz,excerpt text,body text,topics text[],regions text[],entities text[],cluster_id text,license_url text,language text,similarity double precision)
language sql stable set search_path=public,extensions as $$
  select a.id,a.title,a.url,a.source,a.author,a.published_at,a.excerpt,a.body,a.topics,a.regions,a.entities,a.cluster_id,a.license_url,a.language,
    1-(a.embedding <=> query_embedding) as similarity
  from public.articles a where a.approved and a.embedding is not null
    and a.published_at<=now()+interval '5 minutes' and a.published_at>now()-interval '14 days'
  order by a.embedding <=> query_embedding limit least(greatest(match_count,1),100)
$$;
revoke all on function public.search_articles(extensions.vector,integer) from public,anon;
grant execute on function public.search_articles(extensions.vector,integer) to authenticated,service_role;

alter table public.articles enable row level security;
create policy approved_article_read on public.articles for select to authenticated using(approved);
grant select on public.articles to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','editions','feedback','conversations','messages','memories','jobs','events','usage_ledger','rate_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy owner_read on public.%I for select to authenticated using (%I = auth.uid())',t,case when t='profiles' then 'id' else 'user_id' end);
  end loop;
end $$;
grant insert,update on public.profiles to authenticated;
create policy profile_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant insert on public.feedback to authenticated;
create policy feedback_insert on public.feedback for insert to authenticated with check(user_id=auth.uid());
-- Writes to editions, messages, memories, jobs and analytics are service-only.
-- In particular, a browser cannot manufacture an accepted memory or another user's message.
grant all on public.sources,public.articles,public.article_versions,public.article_briefs,public.profiles,public.editions,public.feedback,public.conversations,public.messages,public.memories,public.jobs,public.events,public.usage_ledger,public.rate_limits to service_role;

create function public.consume_rate_limit(p_action text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; start_at timestamptz; begin
  if auth.uid() is null then return false; end if;
  if p_action not in ('ask','edition','feedback','pdf','preferences','memory','telemetry') then return false; end if;
  -- Caller-supplied limits may only tighten server-defined maxima.
  p_limit := least(p_limit,case p_action when 'ask' then 20 when 'edition' then 5 when 'pdf' then 10 else 120 end);
  p_seconds := greatest(p_seconds,3600);
  start_at := to_timestamp(floor(extract(epoch from now())/p_seconds)*p_seconds);
  insert into public.rate_limits(user_id,action,window_start) values(auth.uid(),p_action,start_at)
    on conflict(user_id,action,window_start) do update set count=public.rate_limits.count+1 returning count into n;
  return n<=p_limit;
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,integer,integer) to authenticated;

create function public.claim_job(p_id uuid default null)
returns setof public.jobs language plpgsql security definer set search_path='' as $$
begin
  return query update public.jobs set status='running',attempts=attempts+1,locked_until=now()+interval '4 minutes'
  where id=(select id from public.jobs where (p_id is null or id=p_id)
    and ((status='queued' and available_at<=now()) or (status='running' and locked_until<now()))
    and attempts<3 order by created_at for update skip locked limit 1) returning *;
end $$;
revoke all on function public.claim_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_job(uuid) to service_role;

create function public.request_edition(p_user_id uuid,p_date date,p_preferences jsonb,p_version integer)
returns setof public.editions language plpgsql security definer set search_path='' as $$
declare e public.editions; begin
  insert into public.editions(user_id,edition_date,language,minutes,profile_version)
    values(p_user_id,p_date,p_preferences->>'language',(p_preferences->>'minutes')::integer,p_version)
    on conflict(user_id,edition_date) do nothing;
  select * into strict e from public.editions where user_id=p_user_id and edition_date=p_date;
  if e.status in ('pending','building') then
    insert into public.jobs(user_id,type,key,payload) values(p_user_id,'edition','edition:'||e.id::text,
      jsonb_build_object('edition_id',e.id,'preferences',p_preferences)) on conflict(key) do nothing;
  end if;
  return next e;
end $$;
revoke all on function public.request_edition(uuid,date,jsonb,integer) from public,anon,authenticated;
grant execute on function public.request_edition(uuid,date,jsonb,integer) to service_role;

create function public.enqueue_morning_editions() returns integer language plpgsql security definer set search_path='' as $$
declare p record; n integer:=0; local_time timestamp; begin
  for p in select * from public.profiles where onboarding_complete and last_active_at>now()-interval '7 days' loop
    begin local_time:=timezone(coalesce(p.preferences->>'timezone','Asia/Karachi'),now());
    exception when others then continue; end;
    if extract(hour from local_time)>=7 and not exists(select 1 from public.editions where user_id=p.id and edition_date=local_time::date) then
      perform public.request_edition(p.id,local_time::date,p.preferences,p.version);
      n:=n+1; if n>=100 then exit; end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.enqueue_morning_editions() from public,anon,authenticated;
grant execute on function public.enqueue_morning_editions() to service_role;

create function public.product_metrics() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
  'registered_readers',(select count(*) from public.profiles),
  'activated_readers',(select count(*) from public.profiles where onboarding_complete),
  'published_editions',(select count(*) from public.editions where status='published'),
  'failed_jobs',(select count(*) from public.jobs where status='failed'),
  'usage',coalesce((select jsonb_agg(t) from (select task,model,count(*) as calls,sum(tokens) as tokens from public.usage_ledger where created_at>now()-interval '30 days' group by task,model) t),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(t) from (select name,count(*) as count from public.events where created_at>now()-interval '30 days' group by name) t),'[]'::jsonb)
 )
$$;
revoke all on function public.product_metrics() from public,anon,authenticated;
grant execute on function public.product_metrics() to service_role;

create function public.propose_memory(p_user_id uuid,p_profile_version integer,p_message_id uuid,p_kind text,p_value text,p_quote text)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.profiles; message_text text; begin
  select * into p from public.profiles where id=p_user_id for update;
  if not found or p.version<>p_profile_version or coalesce((p.preferences->>'memory_enabled')::boolean,false)=false then return false; end if;
  select content into message_text from public.messages where id=p_message_id and user_id=p_user_id and role='user';
  if message_text is null or length(p_quote)=0 or position(p_quote in message_text)=0 then return false; end if;
  insert into public.memories(user_id,kind,value,evidence_message_id,status,expires_at)
    values(p_user_id,p_kind,p_value,p_message_id,'proposed',now()+interval '30 days')
    on conflict(user_id,kind,value) do nothing;
  return true;
end $$;
revoke all on function public.propose_memory(uuid,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.propose_memory(uuid,integer,uuid,text,text,text) to service_role;

create function public.bump_profile_version() returns trigger language plpgsql set search_path='' as $$
begin new.version:=old.version+1; return new; end $$;
create trigger profile_version before update of preferences on public.profiles for each row execute function public.bump_profile_version();

insert into storage.buckets(id,name,public) values('edition-pdfs','edition-pdfs',false) on conflict(id) do nothing;
create policy owner_pdf_read on storage.objects for select to authenticated
using(bucket_id='edition-pdfs' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
