import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";

const HANDLE_SEARCH_RE = /[^a-zA-Z0-9_]/g;

export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get("q") ?? "").trim();
  const handleQuery = rawQuery.replace(/^@/, "").replace(HANDLE_SEARCH_RE, "");

  let query = auth.admin
    .from("profiles")
    .select("id,handle,display_name,avatar_url,city,stars,wins,losses,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (rawQuery) {
    if (!handleQuery) return NextResponse.json({ users: [] });
    query = query.ilike("handle", `%${handleQuery}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
