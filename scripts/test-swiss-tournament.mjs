import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  fourPlayerSwissTournamentConfig,
  normalizeTournamentFormatConfig,
  tournamentFormatConfigForSave,
  tournamentSwissStageSettings,
  tournamentPoolAdvancementInfo,
} from "../src/lib/tournamentFormat.ts";

const db = new PGlite();
const migration = "20260909000100_large_swiss_pools_finals_score.sql";
const readMigration = (file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
function functionSql(file, name) {
  const text = readMigration(file);
  const start = text.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  return text.slice(start, text.indexOf("$$;", start) + 3);
}
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const host = uid(1);
const config = fourPlayerSwissTournamentConfig(80);
assert.deepEqual(JSON.parse(JSON.stringify(tournamentFormatConfigForSave(config, "swiss", 80, 4))), JSON.parse(JSON.stringify(config)));
assert.deepEqual(tournamentSwissStageSettings(config, "swiss", 80), {
  groups: 20, advanceCount: 40, rounds: 3, minPlayers: 40,
});
assert.equal(normalizeTournamentFormatConfig(config, "swiss", 80).stages[1].semifinalFinalTargetScore, 7);
assert.deepEqual(tournamentPoolAdvancementInfo(config, "swiss", 80), {
  groups: 20, totalAdvance: 40, perPoolCut: 2, rounds: 3,
  label: "top 2 per pool / top 40 advance / after 3 Swiss rounds",
});
const twentyQualifierPlan = structuredClone(config);
twentyQualifierPlan.stages[0].advanceCount = 20;
assert.equal(tournamentPoolAdvancementInfo(twentyQualifierPlan, "swiss", 80).perPoolCut, 1);
const unevenCut = structuredClone(config);
unevenCut.stages[0].advanceCount = 41;
assert.equal(tournamentPoolAdvancementInfo(unevenCut, "swiss", 80).perPoolCut, 2);
assert.match(tournamentPoolAdvancementInfo(unevenCut, "swiss", 80).label, /1 additional qualifiers/);

// Minimal storage/auth fixture; tournament execution functions are loaded directly
// from the real migrations, including pairing, pool drawing, byes and placement.
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create sequence public.profile_player_code_seq;
  create table profiles (id uuid primary key, display_name text, player_code text);
  create table tournaments (
    id uuid primary key, host uuid, format text, max_players int,
    format_config jsonb, target_score int default 4, current_round int,
    live_enabled boolean default false, status text default 'open',
    winner_id uuid, winner_team_id uuid, beylive_stadium_count int default 2
  );
  create table tournament_players (
    tournament_id uuid, user_id uuid, status text default 'joined', seed int,
    pool_no int check (pool_no is null or pool_no between 1 and 8),
    primary key (tournament_id, user_id)
  );
  create table beylive_judges (tournament_id uuid, user_id uuid, role text,
    primary key (tournament_id, user_id));
  create table beylive_matches (
    id uuid primary key default gen_random_uuid(), tournament_id uuid,
    round_no int, bracket text constraint beylive_matches_bracket_check
      check (bracket in ('main','losers','grand','leaderboard') or bracket ~ '^pool_[1-8]$'),
    match_no int, table_no int, target_score int, status text, winner_id uuid,
    completed_at timestamptz, unique(tournament_id, round_no, bracket, match_no)
  );
  create table beylive_match_players (
    match_id uuid, user_id uuid, slot_no int, result text, score int default 0,
    primary key(match_id, user_id)
  );
  create function public.can_manage_beylive(tid uuid, who uuid) returns boolean
    language sql as $$select exists(select 1 from tournaments where id=tid and host=who)$$;
`);
const swissFile = "20260824000100_swiss_pools_top_cut.sql";
const functions = [
  ["20260820001200_custom_group_stage_count.sql", "beylive_group_stage_pool_count"],
  ["20260808000300_pg_safeupdate_fix.sql", "assign_group_stage_pools"],
  ["20260820000800_fix_double_elimination_algorithm.sql", "beylive_seed_slots"],
  ["20260821000100_beylive_stadium_assignments.sql", "beylive_effective_table_no"],
  ["20260821000100_beylive_stadium_assignments.sql", "create_beylive_match"],
  ...["beylive_swiss_stage_target_score", "beylive_swiss_advance_count",
    "create_beylive_swiss_pool_round", "start_beylive_swiss_top_cut",
    "draw_group_stage_pools", "set_tournament_player_pool"].map((name) => [swissFile, name]),
];
for (const [file, name] of functions) await db.exec(functionSql(file, name));
await db.exec(readMigration(migration));
await db.exec(readMigration("20260909000200_swiss_performance_seeding.sql"));
await db.exec(`create trigger ensure_third_place after insert on beylive_match_players
  for each row execute function ensure_beylive_third_place_match()`);
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [host]);

async function scalar(sql, args = []) {
  const { rows } = await db.query(sql, args);
  return Object.values(rows[0])[0];
}
async function createEvent(id, players, plan) {
  await db.query("insert into tournaments(id,host,format,max_players,format_config) values ($1,$2,'swiss',$3,$4)",
    [id, host, players, JSON.stringify(plan)]);
  for (let i = 1; i <= players; i++) {
    await db.query("insert into profiles(id,display_name) values($1,$2) on conflict do nothing", [uid(i), `Club${i} Player`]);
    await db.query("insert into tournament_players(tournament_id,user_id,seed) values($1,$2,$3)", [id, uid(i), i]);
  }
}
async function finishRound(id) {
  await db.query(`update beylive_match_players mp set
    score=case when slot_no=1 then m.target_score else 1 end,
    result=case when slot_no=1 then 'win' else 'loss' end
    from beylive_matches m, tournaments t
    where mp.match_id=m.id and m.tournament_id=t.id and t.id=$1
      and m.round_no=t.current_round and m.status='scheduled'`, [id]);
  await db.query(`update beylive_matches m set status='completed', winner_id=mp.user_id
    from beylive_match_players mp, tournaments t
    where mp.match_id=m.id and mp.slot_no=1 and m.tournament_id=t.id and t.id=$1
      and m.round_no=t.current_round and m.status='scheduled'`, [id]);
  await db.query("select advance_beylive_swiss_top_cut($1)", [id]);
}

const event = uid(1000);
await createEvent(event, 80, config);
await db.query("select set_tournament_player_pool($1,$2,20)", [event, uid(80)]);
await db.query("select draw_group_stage_pools($1)", [event]);
const pools = (await db.query("select pool_no,count(*)::int n from tournament_players where tournament_id=$1 group by pool_no order by pool_no", [event])).rows;
assert.equal(pools.length, 20);
assert.ok(pools.every((p) => p.n === 4));
assert.equal(await scalar("select pool_no from tournament_players where tournament_id=$1 and user_id=$2", [event, uid(80)]), 20);
await db.query("select start_beylive_swiss_top_cut($1)", [event]);
await assert.rejects(db.query("select advance_beylive_swiss_top_cut($1)", [event]), /round_not_complete/);
for (let round = 1; round <= 3; round++) {
  assert.equal(await scalar("select count(*)::int from beylive_matches where tournament_id=$1 and round_no=$2 and target_score=4", [event, round]), 40);
  await finishRound(event);
}
// Every qualifier must be one of the top two in their own pool, with no missing pools.
const qualified = (await db.query(`select tp.pool_no, count(*)::int n from beylive_match_players mp
  join beylive_matches m on m.id=mp.match_id
  join tournament_players tp on tp.user_id=mp.user_id and tp.tournament_id=m.tournament_id
  where m.tournament_id=$1 and m.bracket='main' and m.round_no=4
  group by tp.pool_no`, [event])).rows;
assert.equal(qualified.length, 20);
assert.ok(qualified.every((p) => p.n === 2));
assert.equal(await scalar(`with ranked as (
  select tp.user_id, row_number() over(partition by tp.pool_no order by
    count(*) filter(where mp.result='win') desc,
    sum(mp.score - (select coalesce(sum(other.score),0) from beylive_match_players other where other.match_id=mp.match_id and other.user_id<>mp.user_id)) desc,
    sum(mp.score) desc, count(*) filter(where mp.result='loss'), tp.seed, tp.user_id) r
  from tournament_players tp join beylive_match_players mp on mp.user_id=tp.user_id
  join beylive_matches m on m.id=mp.match_id and m.tournament_id=tp.tournament_id and m.bracket='pool_'||tp.pool_no
  where tp.tournament_id=$1 group by tp.user_id,tp.pool_no,tp.seed
) select count(*)::int from ranked r join beylive_match_players mp on mp.user_id=r.user_id
join beylive_matches m on m.id=mp.match_id where m.tournament_id=$1 and m.bracket='main' and m.round_no=4 and r.r>2`, [event]), 0);
assert.equal(await scalar("select count(*)::int from beylive_matches where tournament_id=$1 and round_no=4 and status='completed'", [event]), 24);
for (const [index, count] of [32, 16, 8, 4, 2, 1].entries()) {
  const round = index + 4;
  const target = count <= 2 ? 7 : 4;
  assert.equal(await scalar("select count(*)::int from beylive_matches where tournament_id=$1 and round_no=$2 and bracket='main' and target_score=$3", [event, round, target]), count);
  await finishRound(event);
}
assert.equal(await scalar("select status from tournaments where id=$1", [event]), "completed");
assert.equal(await scalar("select count(*)::int from beylive_matches where tournament_id=$1 and bracket='losers'", [event]), 0);
assert.equal(await scalar(`select count(*)::int from beylive_matches m where tournament_id=$1 and bracket='main'
  and (select count(*) from beylive_match_players where match_id=m.id)=2`, [event]), 39);

// Legacy score plans retain their target. Small cuts get their final override
// immediately, and explicitly enabled third-place matches are still generated.
const legacy = { stages: [{ type: "knockout", targetScore: 6 }] };
assert.equal(await scalar("select beylive_swiss_knockout_target_score($1,4,7)", [JSON.stringify(legacy)]), 6);
assert.equal(await scalar("select beylive_swiss_pool_count(80,80,'{}')"), 5);
assert.equal(await scalar("select beylive_swiss_pool_count(256,256,$1)", [JSON.stringify({ stages: [{ type: "swiss", groups: 128 }] })]), 128);
assert.equal(await scalar("select beylive_swiss_round_limit(80,20,'{}')"), 2);
assert.equal(await scalar("select beylive_swiss_knockout_target_score($1,2,4)", [JSON.stringify(config)]), 7);
const small = fourPlayerSwissTournamentConfig(8);
small.stages[1].thirdPlace = true;
const smallId = uid(1001);
await createEvent(smallId, 8, small);
await db.query("select start_beylive_swiss_top_cut($1)", [smallId]);
for (let i = 0; i < 4; i++) await finishRound(smallId);
assert.equal(await scalar("select count(*)::int from beylive_matches where tournament_id=$1 and bracket='losers' and target_score=7", [smallId]), 1);
await finishRound(smallId);
assert.equal(await scalar("select status from tournaments where id=$1", [smallId]), "completed");
// Give later-numbered pools the strongest runners-up. Group 15 has a tied
// 2-win winner with weaker stats than other pools' runners-up; group 16 has
// a 1-win runner-up with better difference than several 2-win runners-up.
// This distinguishes group position, wins, difference, and points scored.
const rankedEvent = uid(1002);
await createEvent(rankedEvent, 80, config);
await db.query("update tournaments set current_round=3,status='started',live_enabled=true where id=$1", [rankedEvent]);
for (let pool = 1; pool <= 20; pool++) {
  const ids = [0, 1, 2, 3].map((offset) => uid((pool - 1) * 4 + offset + 1));
  await db.query("update tournament_players set pool_no=$2 where tournament_id=$1 and user_id=any($3::uuid[])", [rankedEvent, pool, ids]);
  const lossPoints = pool === 18 ? 1 : pool === 19 ? 2 : pool === 20 ? 3 : 0;
  const opponentPoints = pool === 20 ? 1 : pool >= 17 ? 0 : 3;
  let results = [[0,1,lossPoints],[0,2,0],[0,3,0],[1,2,opponentPoints],[1,3,opponentPoints],[2,3,0]];
  if (pool === 15) results = [[0,1,3],[0,3,3],[1,2,3],[1,3,3],[2,0,3],[2,3,3]];
  if (pool === 16) results = [[0,1,3],[0,2,0],[0,3,0],[2,1,3],[1,3,0],[3,2,0]];
  for (const [index, [winner, loser, loserScore]] of results.entries()) {
    const mid = await scalar("select create_beylive_match($1,1,$2,$3,1,4,$4::uuid[])", [rankedEvent, `pool_${pool}`, index + 1, [ids[winner], ids[loser]]]);
    await db.query("update beylive_match_players set score=case when slot_no=1 then 4 else $2 end,result=case when slot_no=1 then 'win' else 'loss' end where match_id=$1", [mid, loserScore]);
    await db.query("update beylive_matches set status='completed',winner_id=$2 where id=$1", [mid, ids[winner]]);
  }
}
await db.query("select advance_beylive_swiss_top_cut($1)", [rankedEvent]);
const byeIds = (await db.query("select winner_id from beylive_matches where tournament_id=$1 and bracket='main' and status='completed'", [rankedEvent])).rows.map((r) => r.winner_id);
const winners = Array.from({ length: 20 }, (_, i) => uid(i * 4 + 1));
const runnersByPerformance = [19,20,18,17,15,...Array.from({length:14},(_,i)=>i+1),16].map((p) => uid((p-1)*4+2));
assert.equal(byeIds.length, 24);
assert.deepEqual([...byeIds].sort(), [...winners,...runnersByPerformance.slice(0,4)].sort());
// Read the generated bracket slots back into seed order to check ALL runner-up
// ranks, including the points-scored tiebreak between pools 20 and 18.
const slots = await scalar("select beylive_seed_slots(40)");
const entrants = (await db.query(`select mp.user_id from beylive_matches m join beylive_match_players mp on mp.match_id=m.id
  where m.tournament_id=$1 and m.bracket='main' order by m.match_no,mp.slot_no`, [rankedEvent])).rows.map((r)=>r.user_id);
const seeds = [];
let entrantIndex = 0;
for (const seed of slots) if (seed <= 40) seeds[seed-1] = entrants[entrantIndex++];
assert.deepEqual(new Set(seeds.slice(0,20)), new Set(winners));
assert.deepEqual(seeds.slice(20), runnersByPerformance);
// Calling advance while the play-in is incomplete must not reseed it.
await assert.rejects(db.query("select advance_beylive_swiss_top_cut($1)", [rankedEvent]), /round_not_complete/);
assert.equal(await scalar("select count(*)::int from beylive_matches where tournament_id=$1 and bracket='main'", [rankedEvent]), 32);
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid(99)]);
await assert.rejects(db.query("select advance_beylive_swiss_top_cut($1)", [event]), /not_allowed/);
await assert.rejects(db.exec("insert into beylive_matches(bracket) values ('pool_129')"), /check constraint/);
await assert.rejects(db.exec("insert into tournament_players(tournament_id,user_id,pool_no) values(gen_random_uuid(),gen_random_uuid(),129)"), /check constraint/);
await db.close();
console.log("PASS: 80 players, 20 Swiss pools, top 2 each, performance-ranked qualifiers and 24 byes, 39 knockout matches, semifinal/final FT7, optional third place, legacy scores and authorization.");
