import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeMyPhone } from "@/lib/phone";

const HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const phone = typeof input.phone === "string" ? input.phone : "";
  const password = typeof input.password === "string" ? input.password : "";
  const handle = typeof input.handle === "string" ? input.handle.trim() : "";
  const displayName =
    typeof input.displayName === "string" ? input.displayName.trim() : "";
  const city = typeof input.city === "string" && input.city ? input.city : null;
  const e164 = normalizeMyPhone(phone);

  if (!e164) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    phone: e164,
    password,
    phone_confirm: true,
    user_metadata: {
      handle,
      display_name: displayName || handle,
      city,
    },
  });

  if (error || !data.user) {
    return NextResponse.json({ error: "register_failed" }, { status: 400 });
  }

  return NextResponse.json({ id: data.user.id });
}
