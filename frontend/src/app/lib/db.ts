import Database from "better-sqlite3";
import path from "path";

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "products.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export type Product = {
  product_group_id: number;
  product_name: string;
  product_type: string | null;
  sku: string | null;
  origin_country: string | null;
  standard_weight: number | null;
  standard_unit: string | null;
  rawabi_price: number | null;
  family_price: number | null;
  lulu_price: number | null;
  avg_price: number | null;
  image_url: string;
  last_updated: string;
};

export type PriceHistory = {
  date: string;
  price: number;
  company: string;
};
