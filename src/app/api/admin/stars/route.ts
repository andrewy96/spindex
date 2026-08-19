import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSuperadmin } from "@/lib/adminServer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POINTS = 2147483647;
const MIN_DELTA = -2147483648;
const MAX_DELTA = 2147483647;
const PROFILE_SELECT =
  "id,handle,display_name,avatar_url,city,stars,wins,losses,is_walkin,created_at";

async function adminUserPayload(admin: SupabaseClient, targetId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", targetId)
    .single();

  if (error) return null;

  const { data: privateRow } = await admin
    .from("profile_private")
    .select("gender,birthday,age")
    .eq("id", targetId)
    .maybeSingle();
  const { data: authUser } = await admin.auth.admin.getUserById(targetId);

  return {
    ...data,
    phone: authUser.user?.phone ?? "",
    gender: privateRow?.gender ?? null,
    birthday: privateRow?.birthday ?? null,
    age: privateRow?.age ?? null,
  };
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const targetId = typeof input.targetId === "string" ? input.targetId : "";
  const mode = input.mode === "set" ? "set" : "adjust";
  let delta = typeof input.delta === "number" ? input.delta : Number(input.delta);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!UUID_RE.test(targetId)) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  if (mode === "set") {
    const points = typeof input.points === "number" ? input.points : Number(input.points);
    if (!Number.isInteger(points) || points < 0 || points > MAX_POINTS) {
      return NextResponse.json({ error: "invalid_points" }, { status: 400 });
    }

    const { data: current, error: currentError } = await auth.admin
      .from("profiles")
      .select("stars")
      .eq("id", targetId)
      .single();

    if (currentError) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    delta = points - current.stars;
    if (delta === 0) {
      const user = await adminUserPayload(auth.admin, targetId);
      return user
        ? NextResponse.json({ user })
        : NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
  }

  if (!Number.isInteger(delta) || delta === 0 || delta < MIN_DELTA || delta > MAX_DELTA) {
    return NextResponse.json({ error: "invalid_delta" }, { status: 400 });
  }
  if (reason.length > 240) {
    return NextResponse.json({ error: "reason_too_long" }, { status: 400 });
  }

  const { error } = await auth.admin.rpc("admin_adjust_stars", {
    p_admin: auth.user.id,
    p_target: targetId,
    p_delta: delta,
    p_reason: reason || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const user = await adminUserPayload(auth.admin, targetId);
  if (!user) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}
