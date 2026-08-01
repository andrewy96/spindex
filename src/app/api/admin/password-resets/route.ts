import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";
import { CODE_TTL_HOURS, generateResetCode } from "@/lib/passwordReset";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

interface RequestRow {
  id: string;
  profile_id: string;
  status: string;
  created_at: string;
  expires_at: string | null;
}

/** The open reset queue, newest first, with enough detail to identify a blader. */
export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.admin
    .from("password_reset_requests")
    .select("id,profile_id,status,created_at,expires_at")
    .in("status", ["pending", "issued"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "load_failed" }, { status: 500 });

  const rows = (data ?? []) as RequestRow[];
  const ids = rows.map((row) => row.profile_id);
  const { data: profiles } = ids.length
    ? await auth.admin.from("profiles").select("id,handle,display_name").in("id", ids)
    : { data: [] };
  const byId = new Map(
    ((profiles ?? []) as { id: string; handle: string; display_name: string }[]).map(
      (profile) => [profile.id, profile]
    )
  );

  const requests = await Promise.all(
    rows.map(async (row) => {
      const profile = byId.get(row.profile_id);
      const { data: authUser } = await auth.admin.auth.admin.getUserById(row.profile_id);
      return {
        ...row,
        handle: profile?.handle ?? "",
        display_name: profile?.display_name ?? "",
        phone: authUser.user?.phone ?? "",
      };
    })
  );

  return NextResponse.json({ requests });
}

/**
 * Issue a one-time code for a request, or dismiss it.
 *
 * The code is returned once, for the superadmin to read out. Nothing about the
 * account changes here — the blader sets their own password when they redeem
 * it, so the account never holds a value anybody else has seen.
 */
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
  const id = typeof input.id === "string" ? input.id : "";
  const action = input.action === "dismiss" ? "dismiss" : "issue";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { data: row } = await auth.admin
    .from("password_reset_requests")
    .select("id,profile_id,status")
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ((row as RequestRow).status !== "pending") {
    return NextResponse.json({ error: "already_handled" }, { status: 409 });
  }

  if (action === "dismiss") {
    const { error } = await auth.admin
      .from("password_reset_requests")
      .update({ status: "dismissed", handled_by: auth.user.id })
      .eq("id", id)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, code: null });
  }

  const code = generateResetCode(randomBytes);
  const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 60 * 60 * 1000);

  // Guarded on status so two superadmins clicking at once cannot both issue.
  const { data: updated, error } = await auth.admin
    .from("password_reset_requests")
    .update({
      status: "issued",
      code,
      expires_at: expiresAt.toISOString(),
      attempts: 0,
      issued_at: new Date().toISOString(),
      handled_by: auth.user.id,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "already_handled" }, { status: 409 });

  return NextResponse.json({ ok: true, code, expiresAt: expiresAt.toISOString() });
}
