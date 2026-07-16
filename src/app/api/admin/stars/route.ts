import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const delta = typeof input.delta === "number" ? input.delta : Number(input.delta);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!UUID_RE.test(targetId)) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }
  if (!Number.isInteger(delta) || delta === 0 || delta < -1000 || delta > 1000) {
    return NextResponse.json({ error: "invalid_delta" }, { status: 400 });
  }
  if (reason.length > 240) {
    return NextResponse.json({ error: "reason_too_long" }, { status: 400 });
  }

  const { data, error } = await auth.admin.rpc("admin_adjust_stars", {
    p_admin: auth.user.id,
    p_target: targetId,
    p_delta: delta,
    p_reason: reason || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ user: data });
}
