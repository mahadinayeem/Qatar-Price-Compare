import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const typesParam = searchParams.get("types") || ""; // comma-separated
    const types = typesParam ? typesParam.split(",").filter(Boolean) : [];
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

    if (types.length > 0) {
      const placeholders = types.map(() => "?").join(", ");
      conditions.push(`pg.product_type IN (${placeholders})`);
      params.push(...types);
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
        pg.product_type AS product_type,
        pg.origin_country AS origin_country,
        pg.standard_weight AS standard_weight,
        pg.standard_unit AS standard_unit,
        MAX(p.sku) AS sku,
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
      GROUP BY pg.id, pg.canonical_name, pg.product_type, pg.origin_country, pg.standard_weight, pg.standard_unit
      ORDER BY last_updated DESC, pg.canonical_name ASC
      LIMIT ? OFFSET ?
    `;

    // Build count SQL
    const countConditions: string[] = [
      "EXISTS (SELECT 1 FROM products p JOIN price_history ph ON ph.product_id = p.id WHERE p.product_group_id = pg.id)"
    ];
    const countParams: (string | number)[] = [];
    if (search) {
      countConditions.push("LOWER(pg.canonical_name) LIKE ?");
      countParams.push(`%${search.toLowerCase()}%`);
    }
    if (types.length > 0) {
      const placeholders = types.map(() => "?").join(", ");
      countConditions.push(`pg.product_type IN (${placeholders})`);
      countParams.push(...types);
    }
    const countSql = `
      SELECT COUNT(*) AS total FROM product_groups pg
      WHERE ${countConditions.join(" AND ")}
    `;

    const rows = db.prepare(sql).all([...params, limit, offset]);
    const countRow = db.prepare(countSql).get(countParams) as { total: number };
    const lastScrapedRow = db.prepare("SELECT MAX(scraped_at) AS last_scraped FROM price_history").get() as { last_scraped: string | null } | undefined;
    const lastScraped = lastScrapedRow?.last_scraped || null;

    // Get product types + counts (filtered only by search, not by selected types)
    const typesSqlConditions: string[] = [];
    const typesQueryParams: (string | number)[] = [];
    if (search) {
      typesSqlConditions.push("LOWER(pg.canonical_name) LIKE ?");
      typesQueryParams.push(`%${search.toLowerCase()}%`);
    }
    const typesSql = `
      SELECT pg.product_type, COUNT(DISTINCT pg.id) AS count
      FROM product_groups pg
      JOIN products p ON p.product_group_id = pg.id
      JOIN price_history ph ON ph.product_id = p.id
      ${typesSqlConditions.length ? "WHERE " + typesSqlConditions.join(" AND ") : ""}
      GROUP BY pg.product_type
      ORDER BY count DESC
    `;
    const productTypes = db.prepare(typesSql).all(typesQueryParams);

    const storeCounts = db.prepare(`
      SELECT co.name, COUNT(*) AS count
      FROM products p
      JOIN companies co ON p.company_id = co.id
      GROUP BY co.name
    `).all() as { name: string; count: number }[];

    return NextResponse.json({
      products: rows,
      total: countRow?.total || 0,
      page,
      limit,
      productTypes,
      lastScraped,
      storeCounts,
    });
  } catch (err) {
    console.error("Products API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
