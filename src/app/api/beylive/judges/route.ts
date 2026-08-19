import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/adminServer";
import type { Profile } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

type JudgeRole = "judge" | "scorer";

function cleanLookup(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^beylive:player:/i, "")
    .replace(/^spindex:player:/i, "")
    .replace(/^@/, "");
}

async function requireTournamentHost(request: Request, tournamentId: string) {
  const admin = getAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "not_configured" }, { status: 503 }) };

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return { error: NextResponse.json({ error: "missing_session" }, { status: 401 }) };

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return { error: NextResponse.json({ error: "invalid_session" }, { status: 401 }) };

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id,host")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { error: NextResponse.json({ error: "tournament_not_found" }, { status: 404 }) };
  if (tournament.host !== user.id) return { error: NextResponse.json({ error: "not_host" }, { status: 403 }) };

  return { admin, user, tournament };
}

async function findProfile(admin: NonNullable<ReturnType<typeof getAdminClient>>, lookup: string) {
  const select = "id,handle,display_name,avatar_url,city,player_code,stars,wins,losses,is_walkin,created_at";
  if (UUID_RE.test(lookup)) {
    const { data } = await admin.from("profiles").select(select).eq("id", lookup).maybeSingle();
    if (data) return data as Profile;
  }

  for (const code of [lookup, lookup.toUpperCase()]) {
    const { data } = await admin.from("profiles").select(select).eq("player_code", code).maybeSingle();
    if (data) return data as Profile;
  }

  for (const handle of [lookup, lookup.toLowerCase()]) {
    const { data } = await admin.from("profiles").select(select).eq("handle", handle).maybeSingle();
    if (data) return data as Profile;
  }

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tournamentId?: string;
    lookup?: string;
    role?: JudgeRole;
  } | null;
  const tournamentId = body?.tournamentId;
  const lookup = cleanLookup(body?.lookup);
  const role: JudgeRole = body?.role === "scorer" ? "scorer" : "judge";

  if (!tournamentId || !lookup) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const auth = await requireTournamentHost(request, tournamentId);
  if ("error" in auth) return auth.error;

  const profile = await findProfile(auth.admin, lookup);
  if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  if (profile.is_walkin) return NextResponse.json({ error: "walkin_cannot_login" }, { status: 400 });

  const { error } = await auth.admin.from("beylive_judges").upsert({
    tournament_id: tournamentId,
    user_id: profile.id,
    role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ judge: { tournament_id: tournamentId, user_id: profile.id, role, profile } });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tournamentId?: string;
    userId?: string;
  } | null;
  const tournamentId = body?.tournamentId;
  const userId = body?.userId;

  if (!tournamentId || !userId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const auth = await requireTournamentHost(request, tournamentId);
  if ("error" in auth) return auth.error;
  if (userId === auth.tournament.host) {
    return NextResponse.json({ error: "cannot_remove_host" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("beylive_judges")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
