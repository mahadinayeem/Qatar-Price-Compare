import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productGroupId = parseInt(searchParams.get("group") || "", 10);

    if (!productGroupId) {
      return NextResponse.json({ error: "group is required" }, { status: 400 });
    }

    const db = getDb();

    const sql = `
      SELECT
        DATE(ph.scraped_at) AS date,
        co.name AS company,
        ROUND(MIN(ph.price), 2) AS price
      FROM price_history ph
      JOIN products p ON ph.product_id = p.id
      JOIN companies co ON p.company_id = co.id
      WHERE p.product_group_id = ?
      GROUP BY DATE(ph.scraped_at), co.name
      ORDER BY DATE(ph.scraped_at) ASC, co.name ASC
    `;

    const rows = db.prepare(sql).all(productGroupId);
    return NextResponse.json({ history: rows });
  } catch (err) {
    console.error("Price history API error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
