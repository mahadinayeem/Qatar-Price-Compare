import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;

    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      conditions.push("LOWER(pg.canonical_name) LIKE ?");
      params.push(`%${search.toLowerCase()}%`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const latestPriceJoin = `
      JOIN price_history ph ON ph.product_id = p.id
        AND ph.id IN (
          SELECT id FROM price_history ph2
          WHERE ph2.product_id = p.id
          ORDER BY ph2.scraped_at DESC
          LIMIT 1
        )
    `;

    const sql = `
      SELECT
        pg.id AS product_group_id,
        pg.canonical_name AS product_name,
        MAX(NULLIF(p.image_url, '')) AS image_url,
        MIN(CASE WHEN co.name = 'Rawabi' THEN ph.price END) AS rawabi_price,
        MIN(CASE WHEN co.name = 'Family Food Centre' THEN ph.price END) AS family_price,
        MIN(CASE WHEN co.name = 'Lulu Hypermarket' THEN ph.price END) AS lulu_price,
        ROUND(AVG(ph.price), 2) AS avg_price,
        MAX(ph.scraped_at) AS last_updated
      FROM product_groups pg
      JOIN products p ON p.product_group_id = pg.id
      JOIN companies co ON p.company_id = co.id
      ${latestPriceJoin}
      ${whereClause}
      GROUP BY pg.id, pg.canonical_name
      ORDER BY pg.canonical_name
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM product_groups pg
      WHERE EXISTS (
        SELECT 1
        FROM products p
        JOIN price_history ph ON ph.product_id = p.id
        WHERE p.product_group_id = pg.id
      )
      ${search ? "AND LOWER(pg.canonical_name) LIKE ?" : ""}
    `;

    const rows = db.prepare(sql).all([...params, limit, offset]);
    const countParams = search ? [`%${search.toLowerCase()}%`] : [];
    const countRow = db.prepare(countSql).get(countParams) as { total: number };

    return NextResponse.json({
      products: rows,
      total: countRow?.total || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("Products API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
