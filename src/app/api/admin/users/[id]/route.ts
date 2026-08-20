import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSuperadmin } from "@/lib/adminServer";
import { deleteAdminManagedUser } from "@/lib/adminUsers";
import { normalizeMyPhone } from "@/lib/phone";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_SELECT =
  "id,handle,display_name,avatar_url,city,player_code,approved_host,beylive_judge,admin_deleted_at,stars,wins,losses,is_walkin,created_at";
const HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/;
const BIRTHDAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function ageFromBirthday(birthday: string | null): number | null {
  if (!birthday) return null;
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
  if (age < 0 || age > 120) return null;
  return age;
}

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

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const { id: targetId } = await context.params;
  if (!UUID_RE.test(targetId)) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { data: existingProfile, error: existingError } = await auth.admin
    .from("profiles")
    .select("is_walkin")
    .eq("id", targetId)
    .single();
  if (existingError) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  if (existingProfile.is_walkin && ("phone" in body || "password" in body)) {
    return NextResponse.json({ error: "walkin_has_no_account" }, { status: 400 });
  }

  const updates: Record<string, string | number | boolean | null> = {};

  if ("handle" in body) {
    if (typeof body.handle !== "string") {
      return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
    }
    const handle = body.handle.trim();
    if (!HANDLE_RE.test(handle)) {
      return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
    }
    updates.handle = handle;
  }

  if ("displayName" in body) {
    if (typeof body.displayName !== "string") {
      return NextResponse.json({ error: "invalid_display_name" }, { status: 400 });
    }
    const displayName = body.displayName.trim();
    if (displayName.length > 60) {
      return NextResponse.json({ error: "invalid_display_name" }, { status: 400 });
    }
    updates.display_name = displayName;
  }

  if ("city" in body) {
    if (body.city !== null && typeof body.city !== "string") {
      return NextResponse.json({ error: "invalid_city" }, { status: 400 });
    }
    const city = typeof body.city === "string" ? body.city.trim() : "";
    updates.city = city || null;
  }

  if ("avatarUrl" in body) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== "string") {
      return NextResponse.json({ error: "invalid_avatar_url" }, { status: 400 });
    }
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";
    if (avatarUrl && (avatarUrl.length > 2048 || !isHttpUrl(avatarUrl))) {
      return NextResponse.json({ error: "invalid_avatar_url" }, { status: 400 });
    }
    updates.avatar_url = avatarUrl || null;
  }

  if ("beyliveJudge" in body) {
    if (typeof body.beyliveJudge !== "boolean") {
      return NextResponse.json({ error: "invalid_beylive_judge" }, { status: 400 });
    }
    if (body.beyliveJudge && existingProfile.is_walkin) {
      return NextResponse.json({ error: "walkin_cannot_login" }, { status: 400 });
    }
    updates.beylive_judge = body.beyliveJudge;
  }

  if ("approvedHost" in body) {
    if (typeof body.approvedHost !== "boolean") {
      return NextResponse.json({ error: "invalid_approved_host" }, { status: 400 });
    }
    if (body.approvedHost && existingProfile.is_walkin) {
      return NextResponse.json({ error: "walkin_cannot_login" }, { status: 400 });
    }
    updates.approved_host = body.approvedHost;
  }

  const password = "password" in body ? body.password : undefined;
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "weak_password" }, { status: 400 });
    }
  }

  let phone: string | undefined;
  if ("phone" in body) {
    if (body.phone !== null && typeof body.phone !== "string") {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }
    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
    const normalized = rawPhone ? normalizeMyPhone(rawPhone) : null;
    if (!normalized) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }
    phone = normalized;
  }

  let privateUpdates:
    | {
        id: string;
        gender?: "male" | "female" | null;
        birthday?: string | null;
        age?: number | null;
      }
    | undefined;

  if ("gender" in body || "birthday" in body) {
    privateUpdates = { id: targetId };
    if ("gender" in body) {
      if (body.gender !== null && body.gender !== "" && body.gender !== "male" && body.gender !== "female") {
        return NextResponse.json({ error: "invalid_gender" }, { status: 400 });
      }
      privateUpdates.gender =
        body.gender === "male" || body.gender === "female" ? body.gender : null;
    }
    if ("birthday" in body) {
      if (body.birthday !== null && typeof body.birthday !== "string") {
        return NextResponse.json({ error: "invalid_birthday" }, { status: 400 });
      }
      const birthday = typeof body.birthday === "string" && body.birthday ? body.birthday : null;
      const age = ageFromBirthday(birthday);
      if (birthday && age == null) {
        return NextResponse.json({ error: "invalid_birthday" }, { status: 400 });
      }
      privateUpdates.birthday = birthday;
      privateUpdates.age = age;
    }
  }

  if (
    Object.keys(updates).length === 0 &&
    password === undefined &&
    phone === undefined &&
    privateUpdates === undefined
  ) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await auth.admin
      .from("profiles")
      .update(updates)
      .eq("id", targetId);

    if (error) {
      return NextResponse.json({ error: "profile_update_failed" }, { status: 400 });
    }
  }

  if (privateUpdates) {
    const { error } = await auth.admin
      .from("profile_private")
      .upsert(privateUpdates, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ error: "private_profile_update_failed" }, { status: 400 });
    }
  }

  const authUpdates: Record<string, unknown> = {};
  if (typeof password === "string") authUpdates.password = password;
  if (typeof phone === "string") {
    authUpdates.phone = phone;
    authUpdates.phone_confirm = true;
  }
  if (
    "handle" in updates ||
    "display_name" in updates ||
    "city" in updates ||
    privateUpdates ||
    "approved_host" in updates ||
    "beylive_judge" in updates
  ) {
    const payload = await adminUserPayload(auth.admin, targetId);
    authUpdates.user_metadata = {
      handle: updates.handle ?? payload?.handle,
      display_name: updates.display_name ?? payload?.display_name,
      city: "city" in updates ? updates.city : payload?.city,
      gender: privateUpdates && "gender" in privateUpdates ? privateUpdates.gender : payload?.gender,
      birthday:
        privateUpdates && "birthday" in privateUpdates
          ? privateUpdates.birthday
          : payload?.birthday,
      age: privateUpdates && "age" in privateUpdates ? privateUpdates.age : payload?.age,
      approved_host:
        "approved_host" in updates ? Boolean(updates.approved_host) : payload?.approved_host,
      beylive_judge:
        "beylive_judge" in updates ? Boolean(updates.beylive_judge) : payload?.beylive_judge,
    };
  }

  if (!existingProfile.is_walkin && Object.keys(authUpdates).length > 0) {
    const { error } = await auth.admin.auth.admin.updateUserById(targetId, authUpdates);
    if (error) {
      return NextResponse.json({ error: "auth_update_failed" }, { status: 400 });
    }
  }

  const user = await adminUserPayload(auth.admin, targetId);

  if (!user) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const { id: targetId } = await context.params;
  if (!UUID_RE.test(targetId)) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }
  if (targetId === auth.user.id) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  const deleted = await deleteAdminManagedUser(auth.admin, targetId);
  if (!deleted.deleted) {
    return NextResponse.json({ error: deleted.error ?? "delete_failed" }, { status: 400 });
  }

  return NextResponse.json(deleted);
}
