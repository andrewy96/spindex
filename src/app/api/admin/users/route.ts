import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";

const HANDLE_SEARCH_RE = /[^a-zA-Z0-9_]/g;
const PROFILE_SELECT =
  "id,handle,display_name,avatar_url,city,stars,wins,losses,is_walkin,created_at";

interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
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
  const handleQuery = rawQuery.replace(/^@/, "").replace(HANDLE_SEARCH_RE, "");
  const scopeParam = url.searchParams.get("scope");
  const scope =
    scopeParam === "walkins" || scopeParam === "all" ? scopeParam : "registered";

  let query = auth.admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (scope === "registered") {
    query = query.eq("is_walkin", false);
  } else if (scope === "walkins") {
    query = query.eq("is_walkin", true);
  }

  if (rawQuery) {
    if (!handleQuery) return NextResponse.json({ users: [] });
    query = query.or(
      `handle.ilike.%${handleQuery}%,display_name.ilike.%${handleQuery}%`
    );
  }

  const { data, error } = await query;
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

  return NextResponse.json({ users: users.filter(Boolean) });
}
