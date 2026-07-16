import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Profile } from "@/lib/supabase";

interface AdminAuthOk {
  ok: true;
  admin: SupabaseClient;
  user: User;
  profile: Profile;
}

interface AdminAuthFail {
  ok: false;
  response: NextResponse;
}

export type AdminAuthResult = AdminAuthOk | AdminAuthFail;

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireSuperadmin(request: Request): Promise<AdminAuthResult> {
  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not_configured" }, { status: 503 }),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "missing_session" }, { status: 401 }),
    };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_session" }, { status: 401 }),
    };
  }

  const { data: superadmin } = await admin
    .from("superadmins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!superadmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { ok: true, admin, user, profile: profile as Profile };
}
