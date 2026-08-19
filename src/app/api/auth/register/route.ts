import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OVERDRIVE_SIGNUP_POINTS } from "@/lib/overdrive";
import { normalizeMyPhone } from "@/lib/phone";

const HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/;
const BIRTHDAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function ageFromBirthday(birthday: string): number | null {
  if (!BIRTHDAY_RE.test(birthday)) return null;
  const birthDate = new Date(`${birthday}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  if (birthDate.toISOString().slice(0, 10) !== birthday) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

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
  const gender = typeof input.gender === "string" ? input.gender : "";
  const birthday = typeof input.birthday === "string" ? input.birthday : "";
  const referralCode =
    typeof input.referralCode === "string" ? input.referralCode.trim() : "";
  const age = ageFromBirthday(birthday);
  const e164 = normalizeMyPhone(phone);

  if (!e164) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  if (gender !== "male" && gender !== "female") {
    return NextResponse.json({ error: "invalid_gender" }, { status: 400 });
  }
  if (age == null || age < 0 || age > 120) {
    return NextResponse.json({ error: "invalid_birthday" }, { status: 400 });
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
      gender,
      birthday,
      age,
    },
  });

  if (error || !data.user) {
    return NextResponse.json({ error: "register_failed" }, { status: 400 });
  }

  const { error: profileError } = await admin
    .from("profile_private")
    .upsert({ id: data.user.id, gender, birthday, age });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: "profile_update_failed" }, { status: 400 });
  }

  const { error: pointsError } = await admin
    .from("profiles")
    .update({ stars: OVERDRIVE_SIGNUP_POINTS })
    .eq("id", data.user.id);

  if (pointsError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: "profile_update_failed" }, { status: 400 });
  }

  let referralApplied = false;
  if (referralCode) {
    const { data: applied } = await admin.rpc("apply_referral_code", {
      p_referred: data.user.id,
      p_code: referralCode,
    });
    referralApplied = applied === true;
  }

  return NextResponse.json({ id: data.user.id, referralApplied });
}
