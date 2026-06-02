"""
Database operations for Qatar Price Comparison scraper
"""

import sqlite3
import os
import logging
from datetime import datetime
from difflib import SequenceMatcher
from models import CREATE_TABLES_SQL, SEED_COMPANIES_SQL
from utils import build_common_product_name, normalize_product_name

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "../frontend/data/products.db")


def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(DATABASE_PATH)), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.executescript(CREATE_TABLES_SQL)
        conn.executescript(SEED_COMPANIES_SQL)
        conn.commit()
        logger.info("Database initialized successfully")
    finally:
        conn.close()


def get_or_create_company(conn: sqlite3.Connection, name: str) -> int:
    row = conn.execute("SELECT id FROM companies WHERE name = ?", (name,)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT OR IGNORE INTO companies (name) VALUES (?)", (name,))
    conn.commit()
    return cur.lastrowid


def get_or_create_category(conn: sqlite3.Connection, name: str) -> int:
    if not name:
        name = "General"
    row = conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (name,))
    conn.commit()
    return conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()["id"]


def get_or_create_brand(conn: sqlite3.Connection, name: str) -> int:
    if not name:
        name = "Unknown"
    row = conn.execute("SELECT id FROM brands WHERE name = ?", (name,)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT OR IGNORE INTO brands (name) VALUES (?)", (name,))
    conn.commit()
    return conn.execute("SELECT id FROM brands WHERE name = ?", (name,)).fetchone()["id"]


def string_similarity(a: str, b: str) -> float:
    """Calculate string similarity ratio (0-1). Higher = more similar."""
    a = normalize_product_name(a)
    b = normalize_product_name(b)
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def find_matching_product_group(conn: sqlite3.Connection, product_name: str, threshold: float = 0.75) -> int | None:
    """Find a product group with similar name. Returns group_id or None."""
    target_name = normalize_product_name(product_name)
    if not target_name:
        return None

    rows = conn.execute("SELECT id, canonical_name FROM product_groups").fetchall()

    best_match = None
    best_score = threshold

    for row in rows:
        candidate_name = normalize_product_name(row["canonical_name"])
        if not candidate_name:
            continue
        if candidate_name == target_name:
            return row["id"]

        score = string_similarity(target_name, candidate_name)
        if score > best_score:
            best_score = score
            best_match = row["id"]

    return best_match


def create_product_group(conn: sqlite3.Connection, canonical_name: str) -> int:
    """Create new product group with canonical name."""
    common_name = build_common_product_name(canonical_name) or canonical_name
    cur = conn.execute(
        "INSERT INTO product_groups (canonical_name) VALUES (?)",
        (common_name,)
    )
    conn.commit()
    return cur.lastrowid


def upsert_product(
    conn: sqlite3.Connection,
    company_id: int,
    category_id: int,
    brand_id: int,
    product_name: str,
    product_url: str,
    image_url: str,
) -> int:
    row = conn.execute(
        "SELECT id FROM products WHERE company_id = ? AND product_name = ?",
        (company_id, product_name),
    ).fetchone()

    # Find or create product group for cross-company deduplication
    product_group_id = find_matching_product_group(conn, product_name)
    if product_group_id is None:
        product_group_id = create_product_group(conn, product_name)

    if row:
        conn.execute(
            "UPDATE products SET product_url=?, image_url=?, product_group_id=? WHERE id=?",
            (product_url, image_url, product_group_id, row["id"]),
        )
        conn.commit()
        return row["id"]

    cur = conn.execute(
        """INSERT INTO products (company_id, category_id, brand_id, product_name, product_url, image_url, product_group_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (company_id, category_id, brand_id, product_name, product_url, image_url, product_group_id),
    )
    conn.commit()
    return cur.lastrowid


def insert_price(
    conn: sqlite3.Connection,
    product_id: int,
    price: float,
    currency: str = "QAR",
):
    today = datetime.now().date().isoformat()
    existing = conn.execute(
        """SELECT id FROM price_history
           WHERE product_id = ? AND DATE(scraped_at) = ?""",
        (product_id, today),
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE price_history SET price=?, scraped_at=CURRENT_TIMESTAMP WHERE id=?",
            (price, existing["id"]),
        )
    else:
        conn.execute(
            "INSERT INTO price_history (product_id, price, currency) VALUES (?, ?, ?)",
            (product_id, price, currency),
        )
    conn.commit()


def save_product(product: dict):
    """Main entry point: save a scraped product dict to DB."""
    conn = get_connection()
    try:
        company_id = get_or_create_company(conn, product["company"])
        category_id = get_or_create_category(conn, product.get("category", "General"))
        brand_id = get_or_create_brand(conn, product.get("brand", "Unknown"))
        product_id = upsert_product(
            conn,
            company_id,
            category_id,
            brand_id,
            product["product_name"],
            product.get("product_url", ""),
            product.get("image_url", ""),
        )
        if product.get("price") is not None:
            insert_price(conn, product_id, product["price"], product.get("currency", "QAR"))
        logger.debug(f"Saved: {product['company']} - {product['product_name']} @ {product.get('price')}")
    except Exception as e:
        logger.error(f"Error saving product {product}: {e}")
    finally:
        conn.close()
