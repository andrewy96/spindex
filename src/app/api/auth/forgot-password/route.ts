import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/adminServer";
import { normalizeMyPhone } from "@/lib/phone";

/**
 * File a password reset request for a phone number.
 *
 * Answers the same way whether or not the number belongs to an account, so it
 * cannot be used to find out who is registered. Nothing is sent and no password
 * changes here — a superadmin issues the temporary password from the admin
 * panel and passes it to the blader out of band.
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
  if (!e164) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const { data: profileId, error: lookupError } = await admin.rpc("profile_id_for_phone", {
    p_phone: e164,
  });

  // Never report success on a broken lookup — the blader would sit waiting for
  // a host who was never told anything.
  if (lookupError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (typeof profileId === "string") {
    // A code that ran out of time must not block a fresh request forever.
    await admin
      .from("password_reset_requests")
      .update({ status: "dismissed", code: null })
      .eq("profile_id", profileId)
      .eq("status", "issued")
      .lt("expires_at", new Date().toISOString());

    // Asking twice must not flood the admin queue. The partial unique index
    // settles any race this check loses; a rejected insert is the right answer.
    const { data: open } = await admin
      .from("password_reset_requests")
      .select("id")
      .eq("profile_id", profileId)
      .in("status", ["pending", "issued"])
      .maybeSingle();
    if (!open) {
      const { error: insertError } = await admin
        .from("password_reset_requests")
        .insert({ profile_id: profileId });
      // 23505 is the partial unique index catching a request we raced with —
      // one is already queued, which is the outcome we wanted anyway.
      if (insertError && insertError.code !== "23505") {
        return NextResponse.json({ error: "request_failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
