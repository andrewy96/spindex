import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminServer";

export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ profile: auth.profile });
}
