import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const PROFILE_SELECT =
  "id,handle,display_name,avatar_url,city,stars,wins,losses,created_at";

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

  const updates: Record<string, string | null> = {};

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

  const password = "password" in body ? body.password : undefined;
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "weak_password" }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0 && password === undefined) {
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

  if (typeof password === "string") {
    const { error } = await auth.admin.auth.admin.updateUserById(targetId, {
      password,
    });

    if (error) {
      return NextResponse.json({ error: "password_update_failed" }, { status: 400 });
    }
  }

  const { data, error } = await auth.admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", targetId)
    .single();

  if (error) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return NextResponse.json({ user: data });
}
