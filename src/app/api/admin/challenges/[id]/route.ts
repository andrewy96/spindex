import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_challenge" }, { status: 400 });
  }

  const { data: challenge, error: loadError } = await auth.admin
    .from("challenges")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  if (!challenge) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await auth.admin.from("challenges").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}
