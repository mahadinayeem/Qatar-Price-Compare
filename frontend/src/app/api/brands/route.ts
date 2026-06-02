import { NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT id, name FROM brands ORDER BY name").all();
    return NextResponse.json({ brands: rows });
  } catch (err) {
    console.error("Brands API error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
