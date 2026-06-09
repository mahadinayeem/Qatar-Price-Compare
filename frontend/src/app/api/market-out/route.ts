import { NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    
    // Get the two most recent distinct scrape dates
    const datesRow = db.prepare(`
      SELECT DISTINCT DATE(scraped_at) AS scrape_date
      FROM price_history
      ORDER BY scrape_date DESC
      LIMIT 2
    `).all() as { scrape_date: string }[];

    if (datesRow.length < 2) {
      // Not enough history to detect market out
      return NextResponse.json({ products: [] });
    }

    const today = datesRow[0].scrape_date;
    const yesterday = datesRow[1].scrape_date;

    const sql = `
      WITH yesterday_groups AS (
        SELECT DISTINCT p.product_group_id
        FROM price_history ph
        JOIN products p ON ph.product_id = p.id
        WHERE DATE(ph.scraped_at) = ?
      ),
      today_groups AS (
        SELECT DISTINCT p.product_group_id
        FROM price_history ph
        JOIN products p ON ph.product_id = p.id
        WHERE DATE(ph.scraped_at) = ?
      )
      SELECT 
        pg.id AS product_group_id,
        pg.canonical_name AS product_name,
        pg.product_type,
        pg.origin_country,
        pg.standard_weight,
        pg.standard_unit,
        MAX(p.image_url) AS image_url,
        MIN(CASE WHEN co.name = 'Rawabi' THEN ph.price END) AS last_rawabi_price,
        MIN(CASE WHEN co.name = 'Family Food Centre' THEN ph.price END) AS last_family_price,
        MIN(CASE WHEN co.name = 'Lulu Hypermarket' THEN ph.price END) AS last_lulu_price
      FROM yesterday_groups yg
      LEFT JOIN today_groups tg ON yg.product_group_id = tg.product_group_id
      JOIN product_groups pg ON yg.product_group_id = pg.id
      JOIN products p ON pg.id = p.product_group_id
      LEFT JOIN price_history ph ON p.id = ph.product_id AND DATE(ph.scraped_at) = ?
      LEFT JOIN companies co ON p.company_id = co.id
      WHERE tg.product_group_id IS NULL
      GROUP BY pg.id
      ORDER BY pg.canonical_name ASC
    `;

    const rows = db.prepare(sql).all(yesterday, today, yesterday);

    return NextResponse.json({ products: rows, yesterday, today });
  } catch (err: any) {
    console.error("[/api/market-out] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
