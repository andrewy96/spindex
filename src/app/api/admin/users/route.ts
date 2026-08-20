import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";
import { deleteAdminManagedUser } from "@/lib/adminUsers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_SELECT =
  "id,handle,display_name,avatar_url,city,player_code,approved_host,beylive_judge,admin_deleted_at,stars,wins,losses,is_walkin,created_at";
const ROW_LIMITS = [30, 60, 100, 200, 1000] as const;
const MAX_BULK_DELETE_IDS = 200;

interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  player_code: string | null;
  approved_host: boolean;
  beylive_judge: boolean;
  admin_deleted_at: string | null;
  stars: number;
  wins: number;
  losses: number;
  is_walkin: boolean;
  created_at: string;
}

interface PrivateRow {
  id: string;
  gender: "male" | "female" | null;
  birthday: string | null;
  age: number | null;
}

export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get("q") ?? "").trim();
  const searchQuery = rawQuery
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9_ -]/g, "")
    .trim()
    .slice(0, 60);
  const scopeParam = url.searchParams.get("scope") ?? url.searchParams.get("type");
  const scope =
    scopeParam === "walkins" || scopeParam === "all" ? scopeParam : "registered";
  const status = url.searchParams.get("status");
  const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
  const limit = ROW_LIMITS.includes(requestedLimit as (typeof ROW_LIMITS)[number])
    ? requestedLimit
    : 100;

  let query = auth.admin
    .from("profiles")
    .select(PROFILE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "archived") {
    query = query.not("admin_deleted_at", "is", null);
  } else if (status !== "all") {
    query = query.is("admin_deleted_at", null);
  }

  if (scope === "registered") {
    query = query.eq("is_walkin", false);
  } else if (scope === "walkins") {
    query = query.eq("is_walkin", true);
  }

  if (rawQuery) {
    if (!searchQuery) return NextResponse.json({ users: [], total: 0, limit });
    const like = `%${searchQuery.replace(/\s+/g, "%")}%`;
    query = query.or(
      `handle.ilike.${like},display_name.ilike.${like},player_code.ilike.${like},city.ilike.${like}`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const profiles = (data ?? []) as ProfileRow[];
  const ids = profiles.map((profile) => profile.id);
  const { data: privateRows } = ids.length
    ? await auth.admin
        .from("profile_private")
        .select("id,gender,birthday,age")
        .in("id", ids)
    : { data: [] };
  const privateById = new Map(
    ((privateRows ?? []) as PrivateRow[]).map((row) => [row.id, row])
  );

  const users = await Promise.all(
    profiles.map(async (profile) => {
      const { data: authUser } = await auth.admin.auth.admin.getUserById(profile.id);
      const user = authUser.user;
      if (user?.deleted_at) return null;
      const priv = privateById.get(profile.id);
      return {
        ...profile,
        phone: user?.phone ?? "",
        gender: priv?.gender ?? null,
        birthday: priv?.birthday ?? null,
        age: priv?.age ?? null,
      };
    })
  );

  return NextResponse.json({ users: users.filter(Boolean), total: count ?? users.length, limit });
}

export async function DELETE(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  if (!Array.isArray(body?.ids)) {
    return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
  }

  const ids = [...new Set(body.ids)]
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim());

  if (
    ids.length === 0 ||
    ids.length > MAX_BULK_DELETE_IDS ||
    ids.some((id) => !UUID_RE.test(id))
  ) {
    return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
  }

  if (ids.includes(auth.user.id)) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  const deletedIds: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    const result = await deleteAdminManagedUser(auth.admin, id);
    if (result.deleted) deletedIds.push(id);
    else failed.push({ id, error: result.error ?? "delete_failed" });
  }

  return NextResponse.json({ deletedIds, failedIds: failed.map((item) => item.id), failed });
}
