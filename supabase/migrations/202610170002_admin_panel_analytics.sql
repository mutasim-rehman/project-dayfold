-- Admin-only aggregate product analytics and shared sign-in throttling.
-- No raw IP address, email, name, or user-level analytics are exposed.
begin;

create table public.admin_login_limits_dayfold (
  ip_hash text primary key check (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0)
);
alter table public.admin_login_limits_dayfold enable row level security;
revoke all on public.admin_login_limits_dayfold from public, anon, authenticated;
grant all on public.admin_login_limits_dayfold to service_role;

create function public.consume_admin_login_limit_dayfold(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare attempt_count integer;
begin
  if p_ip_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from public.admin_login_limits_dayfold where window_started_at < now() - interval '1 day';
  insert into public.admin_login_limits_dayfold(ip_hash, window_started_at, attempts)
    values (p_ip_hash, now(), 1)
    on conflict (ip_hash) do update set
      window_started_at = case
        when public.admin_login_limits_dayfold.window_started_at <= now() - interval '15 minutes' then now()
        else public.admin_login_limits_dayfold.window_started_at
      end,
      attempts = case
        when public.admin_login_limits_dayfold.window_started_at <= now() - interval '15 minutes' then 1
        else public.admin_login_limits_dayfold.attempts + 1
      end
    returning attempts into attempt_count;
  return attempt_count <= 8;
end;
$$;
revoke all on function public.consume_admin_login_limit_dayfold(text) from public, anon, authenticated;
grant execute on function public.consume_admin_login_limit_dayfold(text) to service_role;

create index if not exists events_dayfold_created_idx on public.events_dayfold(created_at desc);
create index if not exists usage_ledger_dayfold_created_idx on public.usage_ledger_dayfold(created_at desc);

create function public.admin_analytics_dayfold()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with feature_catalog(feature_key, event_name, label) as (
    values
      ('paper', 'edition_opened', 'Read daily paper'),
      ('ask', 'ask_completed', 'Ask Dayfold'),
      ('pdf', 'pdf_download_requested', 'Download PDF'),
      ('source', 'source_link_opened', 'Open original source'),
      ('feedback', 'feedback_submitted', 'Send recommendation feedback'),
      ('changes', 'change_brief_opened', 'Check what changed'),
      ('onboarding', 'onboarding_completed', 'Complete personalization')
  ),
  event_window as (
    select e.user_id, e.name, e.created_at
    from public.events_dayfold e
    where e.created_at >= now() - interval '30 days'
  ),
  user_feature_counts as (
    select c.feature_key, e.user_id, count(*) as event_count
    from feature_catalog c
    join event_window e on e.name = c.event_name
    group by c.feature_key, e.user_id
  ),
  feature_metrics as (
    select c.feature_key, c.label,
      coalesce(sum(u.event_count), 0)::bigint as events,
      count(u.user_id)::bigint as users,
      count(u.user_id) filter (where u.event_count >= 2)::bigint as repeat_users
    from feature_catalog c
    left join user_feature_counts u on u.feature_key = c.feature_key
    group by c.feature_key, c.label
  ),
  day_series as (
    select day::date as day
    from generate_series(current_date - 13, current_date, interval '1 day') as days(day)
  ),
  daily_metrics as (
    select d.day, count(e.user_id)::bigint as events, count(distinct e.user_id)::bigint as users
    from day_series d
    left join public.events_dayfold e on e.created_at >= d.day::timestamptz
      and e.created_at < (d.day + 1)::timestamptz
    group by d.day
  ),
  new_readers as (
    select p.id, p.onboarding_complete
    from public.profiles_dayfold p
    where p.created_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'overview', jsonb_build_object(
      'registered_readers', (select count(*) from public.profiles_dayfold),
      'activated_readers', (select count(*) from public.profiles_dayfold where onboarding_complete),
      'active_readers_30d', (select count(*) from public.profiles_dayfold where last_active_at >= now() - interval '30 days'),
      'published_editions_30d', (select count(*) from public.editions_dayfold where status = 'published' and published_at >= now() - interval '30 days'),
      'failed_jobs_30d', (select count(*) from public.jobs_dayfold where status = 'failed' and created_at >= now() - interval '30 days')
    ),
    'funnel_30d', jsonb_build_array(
      jsonb_build_object('key','signup','label','New accounts','users',(select count(*) from new_readers)),
      jsonb_build_object('key','onboarding','label','Finished setup','users',(select count(*) from new_readers where onboarding_complete)),
      jsonb_build_object('key','paper','label','Opened a paper','users',(select count(distinct e.user_id) from event_window e join new_readers n on n.id=e.user_id where e.name='edition_opened')),
      jsonb_build_object('key','ask','label','Asked a question','users',(select count(distinct e.user_id) from event_window e join new_readers n on n.id=e.user_id where e.name='ask_completed'))
    ),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', f.feature_key, 'label', f.label, 'events', f.events, 'users', f.users,
        'repeat_users', f.repeat_users,
        'repeat_rate', case when f.users=0 then 0 else round(100.0*f.repeat_users/f.users,1) end,
        'active_reader_reach', case when (select count(*) from public.profiles_dayfold where last_active_at >= now()-interval '30 days')=0 then 0
          else round(100.0*f.users/(select count(*) from public.profiles_dayfold where last_active_at >= now()-interval '30 days'),1) end
      ) order by f.events desc, f.users desc, f.feature_key)
      from feature_metrics f
    ), '[]'::jsonb),
    'daily_activity', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'events', d.events, 'users', d.users) order by d.day)
      from daily_metrics d
    ), '[]'::jsonb),
    'model_usage_30d', coalesce((
      select jsonb_agg(jsonb_build_object('task', u.task, 'model', u.model, 'calls', u.calls, 'tokens', u.tokens)
        order by u.tokens desc, u.task, u.model)
      from (
        select l.task, l.model, count(*)::bigint as calls, sum(l.tokens)::bigint as tokens
        from public.usage_ledger_dayfold l
        where l.created_at >= now() - interval '30 days'
        group by l.task, l.model
      ) u
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.admin_analytics_dayfold() from public, anon, authenticated;
grant execute on function public.admin_analytics_dayfold() to service_role;

commit;
