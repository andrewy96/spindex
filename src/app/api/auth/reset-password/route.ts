import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/adminServer";
import { normalizeMyPhone } from "@/lib/phone";
import { MAX_ATTEMPTS, normalizeResetCode } from "@/lib/passwordReset";

interface IssuedRow {
  id: string;
  code: string | null;
  expires_at: string | null;
  attempts: number;
}

function codesMatch(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Redeem a one-time code and set the password the blader has chosen.
 *
 * Every failure answers "invalid_code" so the endpoint cannot be used to work
 * out which numbers are registered or which have a code outstanding.
 */
export async function POST(request: Request) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const e164 = normalizeMyPhone(typeof input.phone === "string" ? input.phone : "");
  const code = normalizeResetCode(typeof input.code === "string" ? input.code : "");
  const password = typeof input.password === "string" ? input.password : "";

  if (password.length < 8) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }
  if (!e164 || !code) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { data: profileId, error: lookupError } = await admin.rpc("profile_id_for_phone", {
    p_phone: e164,
  });
  if (lookupError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (typeof profileId !== "string") {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { data } = await admin
    .from("password_reset_requests")
    .select("id,code,expires_at,attempts")
    .eq("profile_id", profileId)
    .eq("status", "issued")
    .maybeSingle();

  const row = data as IssuedRow | null;
  if (!row || !row.code) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Burn a code that has run out of guesses or time rather than leaving it live.
  const expired = !row.expires_at || new Date(row.expires_at).getTime() < Date.now();
  if (expired || row.attempts >= MAX_ATTEMPTS) {
    await admin
      .from("password_reset_requests")
      .update({ status: "dismissed", code: null })
      .eq("id", row.id);
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  if (!codesMatch(row.code, code)) {
    await admin
      .from("password_reset_requests")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Spend the code first. If the password update then fails the blader can ask
  // again, which is better than leaving a valid code lying around on a retry.
  const { data: spent } = await admin
    .from("password_reset_requests")
    .update({ status: "used", code: null, used_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();

  if (!spent) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    password,
  });
  if (authError) {
    return NextResponse.json({ error: "reset_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
