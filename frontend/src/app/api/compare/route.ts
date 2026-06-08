/**
 * /api/compare/route.ts
 *
 * Fetches "Our Store Prices" from the publicly-published Google Sheet CSV,
 * then joins them with competitor prices from the local SQLite database.
 *
 * Returns a JSON array with comparison data including:
 *  - our_price, lulu_price, rawabi_price, family_price
 *  - status: "Overpriced" | "Margin Opportunity" | "Competitive"
 *  - cheapest_competitor_price, potential_saving (if overpriced)
 *  - potential_gain (if margin opportunity)
 */

import { NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

// Public CSV URL of the Google Sheet (published to web)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrVppxohEpKOjcsLHThQY7u7dlja8aC0I_oW4LV-Wa27a-NxT6r-fKYwW0irXH5eWOsk62jz6xB-RV/pub?gid=0&single=true&output=csv";

// If our price exceeds the cheapest competitor by more than this %, flag as "Overpriced"
const OVERPRICED_THRESHOLD = 0.0; // 0% = any higher price is flagged

// If our price is below the LOWEST competitor by more than this %, flag as "Margin Opportunity"
const MARGIN_THRESHOLD = 0.05; // 5%

interface SheetRow {
  sku: string;
  product_name: string;
  category: string;
  origin: string;
  unit: string;
  our_price: number | null;
}

interface CompareRow extends SheetRow {
  lulu_price: number | null;
  rawabi_price: number | null;
  family_price: number | null;
  avg_competitor_price: number | null;
  cheapest_competitor: string | null;
  cheapest_competitor_price: number | null;
  status: "Overpriced" | "Margin Opportunity" | "Competitive" | "No Match";
  potential_saving: number | null;
  potential_gain: number | null;
  image_url: string | null;
  product_group_id: number | null;
}

/** Parse a CSV string into an array of objects using the first row as headers. */
function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
}

/** Fuzzy name match: strip non-alpha chars, lowercase, check containment. */
function namesMatch(sheetName: string, dbName: string): boolean {
  const clean = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const a = clean(sheetName);
  const b = clean(dbName);
  if (!a || !b) return false;
  // Exact or one contains the other
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  // Check first two words match (handles "Apple Fuji" vs "Fuji Apple India 1kg")
  const aWords = a.split(" ").slice(0, 2).join(" ");
  const bWords = b.split(" ").slice(0, 2).join(" ");
  return aWords.length > 3 && (b.includes(aWords) || a.includes(bWords));
}

export async function GET() {
  try {
    // 1. Fetch Google Sheet CSV
    const sheetRes = await fetch(SHEET_CSV_URL, {
      next: { revalidate: 300 }, // cache 5 minutes
    });
    if (!sheetRes.ok) {
      return NextResponse.json({ error: "Failed to fetch Google Sheet" }, { status: 502 });
    }
    const csvText = await sheetRes.text();
    const rawRows = parseCsv(csvText);

    // Parse sheet rows
    const sheetRows: SheetRow[] = rawRows
      .filter((r) => r.product_name || r["product name"])
      .map((r) => ({
        sku: r.sku || "",
        product_name: (r.product_name || r["product name"] || "").trim(),
        category: (r.category || "").trim(),
        origin: (r.origin || "").trim(),
        unit: (r.unit || "").trim(),
        our_price: parseFloat(r.our_price || r["our price"] || "") || null,
      }))
      .filter((r) => r.product_name);

    if (sheetRows.length === 0) {
      return NextResponse.json({ compare: [], summary: { overpriced: 0, margin: 0, competitive: 0, no_match: 0 } });
    }

    // 2. Fetch competitor prices from SQLite
    const db = getDb();
    const dbProducts = db
      .prepare(
        `SELECT
           pg.id              AS product_group_id,
           pg.canonical_name  AS product_name,
           pg.product_type,
           p.image_url,
           c.name             AS company_name,
           ph.price
         FROM price_history ph
         JOIN products       p  ON ph.product_id     = p.id
         JOIN product_groups pg ON p.product_group_id = pg.id
         JOIN companies      c  ON p.company_id       = c.id
         WHERE DATE(ph.scraped_at) = DATE('now')
         ORDER BY pg.id`
      )
      .all() as {
      product_group_id: number;
      product_name: string;
      product_type: string;
      image_url: string;
      company_name: string;
      price: number;
    }[];

    // Group DB rows by product_group_id
    const dbGrouped = new Map<
      number,
      {
        product_name: string;
        product_type: string;
        image_url: string;
        lulu_price: number | null;
        rawabi_price: number | null;
        family_price: number | null;
      }
    >();

    for (const row of dbProducts) {
      if (!dbGrouped.has(row.product_group_id)) {
        dbGrouped.set(row.product_group_id, {
          product_name: row.product_name,
          product_type: row.product_type,
          image_url: row.image_url,
          lulu_price: null,
          rawabi_price: null,
          family_price: null,
        });
      }
      const grp = dbGrouped.get(row.product_group_id)!;
      const company = row.company_name.toLowerCase();
      if (company.includes("lulu")) grp.lulu_price = row.price;
      else if (company.includes("rawabi")) grp.rawabi_price = row.price;
      else if (company.includes("family")) grp.family_price = row.price;
    }

    const dbList = Array.from(dbGrouped.entries()).map(([id, v]) => ({ id, ...v }));

    // 3. Match sheet rows with DB products
    const compareRows: CompareRow[] = sheetRows.map((sr) => {
      // Find best DB match
      const match = dbList.find((db) => namesMatch(sr.product_name, db.product_name));

      if (!match) {
        return {
          ...sr,
          lulu_price: null,
          rawabi_price: null,
          family_price: null,
          avg_competitor_price: null,
          cheapest_competitor: null,
          cheapest_competitor_price: null,
          status: "No Match" as const,
          potential_saving: null,
          potential_gain: null,
          image_url: null,
          product_group_id: null,
        };
      }

      const prices: [string, number | null][] = [
        ["Lulu", match.lulu_price],
        ["Rawabi", match.rawabi_price],
        ["Family", match.family_price],
      ];
      const validPrices = prices.filter(([, p]) => p != null) as [string, number][];
      const competitorPrices = validPrices.map(([, p]) => p);

      const avg =
        competitorPrices.length > 0
          ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length
          : null;

      const cheapestEntry =
        validPrices.length > 0
          ? validPrices.reduce((a, b) => (a[1] <= b[1] ? a : b))
          : null;

      const cheapestName = cheapestEntry ? cheapestEntry[0] : null;
      const cheapestPrice = cheapestEntry ? cheapestEntry[1] : null;

      let status: CompareRow["status"] = "Competitive";
      let potential_saving: number | null = null;
      let potential_gain: number | null = null;

      if (sr.our_price != null && cheapestPrice != null) {
        if (sr.our_price > cheapestPrice * (1 + OVERPRICED_THRESHOLD)) {
          status = "Overpriced";
          potential_saving = parseFloat((sr.our_price - cheapestPrice).toFixed(2));
        } else {
          const maxPrice = Math.max(...competitorPrices);
          if (maxPrice > sr.our_price * (1 + MARGIN_THRESHOLD)) {
            status = "Margin Opportunity";
            // Suggest raising price to just below the cheapest competitor
            const suggestedPrice = cheapestPrice * 0.99;
            potential_gain =
              suggestedPrice > sr.our_price
                ? parseFloat((suggestedPrice - sr.our_price).toFixed(2))
                : null;
          }
        }
      }

      return {
        ...sr,
        lulu_price: match.lulu_price,
        rawabi_price: match.rawabi_price,
        family_price: match.family_price,
        avg_competitor_price: avg !== null ? parseFloat(avg.toFixed(2)) : null,
        cheapest_competitor: cheapestName,
        cheapest_competitor_price: cheapestPrice,
        status,
        potential_saving,
        potential_gain,
        image_url: match.image_url || null,
        product_group_id: match.id,
      };
    });

    // 4. Summary counts
    const summary = {
      overpriced: compareRows.filter((r) => r.status === "Overpriced").length,
      margin: compareRows.filter((r) => r.status === "Margin Opportunity").length,
      competitive: compareRows.filter((r) => r.status === "Competitive").length,
      no_match: compareRows.filter((r) => r.status === "No Match").length,
    };

    return NextResponse.json({ compare: compareRows, summary });
  } catch (err: any) {
    console.error("[/api/compare] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
