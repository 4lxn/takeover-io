-- takeover.io: accounts, progression, match history and leaderboards.
-- Clients only read their own rows; every write goes through the functions below,
-- which enforce the caps from the account-progression spec.

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16),
  selected_skin text check (selected_skin is null or selected_skin ~ '^[A-Za-z0-9_-]{1,24}$'),
  created_at timestamptz not null default now()
);

create table public.progression (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lifetime_xp bigint not null default 0 check (lifetime_xp >= 0),
  games int not null default 0,
  takeovers int not null default 0,
  deletions int not null default 0,
  deaths int not null default 0,
  best_round_xp int not null default 0,
  single_day date,
  single_day_xp int not null default 0,
  imported_local boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.match_results (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('single', 'multi')),
  room text,
  xp int not null check (xp >= 0),
  deletions int not null default 0,
  deaths int not null default 0,
  placement int,
  takeover boolean not null default false,
  created_at timestamptz not null default now()
);
create index match_results_user_recent on public.match_results (user_id, created_at desc);
create index match_results_recent on public.match_results (created_at);

-- ---------- new users get a profile and a progression row ----------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, 'Unit-' || lpad(floor(random() * 100)::int::text, 2, '0'));
  insert into public.progression (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row-level security: read your own rows, write nothing directly ----------

alter table public.profiles enable row level security;
alter table public.progression enable row level security;
alter table public.match_results enable row level security;

create policy "read own profile" on public.profiles for select using (id = auth.uid());
create policy "update own skin" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "read own progression" on public.progression for select using (user_id = auth.uid());
create policy "read own matches" on public.match_results for select using (user_id = auth.uid());

-- only the selected skin is directly updatable; names go through set_display_name (blocklist)
revoke insert, update, delete on public.profiles, public.progression, public.match_results from anon, authenticated;
grant update (selected_skin) on public.profiles to authenticated;

-- ---------- display names ----------

create function public.set_display_name(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  clean text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  blocked text[] := array['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'nazi', 'hitler', 'rape', 'puta', 'verga', 'pendej', 'maric'];
  w text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  clean := left(clean, 16);
  if char_length(clean) < 1 then raise exception 'empty_name'; end if;
  foreach w in array blocked loop
    if position(w in lower(clean)) > 0 then raise exception 'blocked_name'; end if;
  end loop;
  update public.profiles set display_name = clean where id = auth.uid();
  return clean;
end $$;

-- ---------- crediting ----------

-- Multiplayer: called only by the game server (service role) with the XP it computed.
create function public.credit_match(p_user uuid, p_room text, p_xp int, p_deletions int, p_deaths int,
                                    p_placement int, p_takeover boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare amount int := least(greatest(coalesce(p_xp, 0), 0), 3000);
begin
  update public.progression set
    lifetime_xp = lifetime_xp + amount,
    games = games + 1,
    takeovers = takeovers + (case when p_takeover then 1 else 0 end),
    deletions = deletions + greatest(coalesce(p_deletions, 0), 0),
    deaths = deaths + greatest(coalesce(p_deaths, 0), 0),
    best_round_xp = greatest(best_round_xp, amount),
    updated_at = now()
  where user_id = p_user;
  if not found then return 0; end if;
  insert into public.match_results (user_id, mode, room, xp, deletions, deaths, placement, takeover)
    values (p_user, 'multi', left(p_room, 16), amount, greatest(coalesce(p_deletions, 0), 0),
            greatest(coalesce(p_deaths, 0), 0), p_placement, coalesce(p_takeover, false));
  return amount;
end $$;

-- Single player: called by the browser with the player's own token. Runs client-side, so it is capped:
-- 600 XP per match, 1500 per UTC day, and at most one credit every 20 seconds.
create function public.credit_single(p_xp int, p_deletions int, p_deaths int, p_placement int,
                                     p_takeover boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  used int;
  amount int;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.match_results
             where user_id = me and mode = 'single' and created_at > now() - interval '20 seconds') then
    return json_build_object('credited', 0, 'reason', 'too_soon');
  end if;
  select case when single_day = today then single_day_xp else 0 end into used
    from public.progression where user_id = me for update;
  amount := greatest(0, least(least(greatest(coalesce(p_xp, 0), 0), 600), 1500 - coalesce(used, 0)));
  update public.progression set
    lifetime_xp = lifetime_xp + amount,
    games = games + 1,
    takeovers = takeovers + (case when p_takeover then 1 else 0 end),
    deletions = deletions + greatest(coalesce(p_deletions, 0), 0),
    deaths = deaths + greatest(coalesce(p_deaths, 0), 0),
    best_round_xp = greatest(best_round_xp, amount),
    single_day = today,
    single_day_xp = coalesce(used, 0) + amount,
    updated_at = now()
  where user_id = me;
  insert into public.match_results (user_id, mode, xp, deletions, deaths, placement, takeover)
    values (me, 'single', amount, greatest(coalesce(p_deletions, 0), 0), greatest(coalesce(p_deaths, 0), 0),
            p_placement, coalesce(p_takeover, false));
  return json_build_object('credited', amount, 'daily_left', 1500 - (coalesce(used, 0) + amount));
end $$;

-- One-time import of progress the earlier version kept in localStorage (capped at the top skin tier).
create function public.import_local_progress(p_xp int) returns int
language plpgsql security definer set search_path = '' as $$
declare amount int := least(greatest(coalesce(p_xp, 0), 0), 6000);
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.progression set lifetime_xp = lifetime_xp + amount, imported_local = true, updated_at = now()
    where user_id = auth.uid() and not imported_local;
  if not found then return 0; end if;
  return amount;
end $$;

-- ---------- leaderboards: top 50 plus the caller's own row ----------

create function public.leaderboard(p_period text) returns table (rank bigint, display_name text, xp bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with scores as (
    select p.user_id, p.lifetime_xp as xp from public.progression p
      where p_period = 'all' and p.lifetime_xp > 0
    union all
    select m.user_id, sum(m.xp)::bigint from public.match_results m
      where p_period = 'week' and m.created_at > now() - interval '7 days'
      group by m.user_id having sum(m.xp) > 0
  ), ranked as (
    select rank() over (order by s.xp desc) as rank, pr.display_name, s.xp, s.user_id = auth.uid() as is_me
      from scores s join public.profiles pr on pr.id = s.user_id
  )
  select rank, display_name, xp, is_me from ranked where rank <= 50 or is_me order by rank limit 51;
$$;

-- ---------- who may call what ----------

revoke execute on function public.credit_match, public.credit_single, public.import_local_progress,
  public.set_display_name, public.leaderboard, public.handle_new_user from public, anon, authenticated;
grant execute on function public.credit_match to service_role;
grant execute on function public.credit_single, public.import_local_progress, public.set_display_name to authenticated;
grant execute on function public.leaderboard to anon, authenticated;
