"""
Database operations for Qatar Price Comparison scraper
"""

import sqlite3
import os
import logging
from datetime import datetime
from models import CREATE_TABLES_SQL, SEED_COMPANIES_SQL
from utils import build_common_product_name, normalize_product_name, extract_weight, extract_country, get_clean_match_name

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


def find_matching_product_group(
    conn: sqlite3.Connection, 
    product_name: str,
    country: str | None,
    weight: float | None,
    unit: str | None
) -> int | None:
    """Find a product group using multi-attribute matching logic."""
    clean_name = get_clean_match_name(product_name)
    if not clean_name:
        return None

    # 1. Try matching by Standardized Weight + Country + Clean Name
    sql = """
        SELECT id, canonical_name FROM product_groups 
        WHERE origin_country IS ? 
        AND standard_weight IS ? 
        AND standard_unit IS ?
    """
    rows = conn.execute(sql, (country, weight, unit)).fetchall()
    
    for row in rows:
        if get_clean_match_name(row["canonical_name"]) == clean_name:
            return row["id"]

    # 2. Fallback: If weight and country match, but name is slightly different
    # This currently only handles exact clean name match, but is extensible for fuzzy matching.
    
    return None


def classify_product_name(name: str) -> str:
    name_lower = name.lower()
    
    # 1. Specific/Exclusive Matches First
    if "organic" in name_lower:
        return "Organic Vegetables"
    if "cut fruit" in name_lower:
        return "Cut Fruits"
    if "basket" in name_lower or "combo" in name_lower or "pack" in name_lower or "pinakbet" in name_lower or "sambar" in name_lower or "aviyal mix" in name_lower or "salad" in name_lower:
        return "Combo Pack"
    
    # 2. Veg/Herb checks that might collide with fruits
    if "capsicum" in name_lower or "bell pepper" in name_lower:
        return "Capsicum"
    if "lemongrass" in name_lower or "lemon grass" in name_lower:
        return "Herbs"
    if "tomato" in name_lower or "tomatoes" in name_lower or "tommys" in name_lower:
        return "Tomato"
        
    # 3. Fruits
    if "apple" in name_lower or "rockit" in name_lower or "gala" in name_lower or "fuji" in name_lower or "golden" in name_lower:
        return "Apples"
    if "green mango" in name_lower:
        return "Green Mango"
    if "mango" in name_lower or "thottapuri" in name_lower:
        return "Mangoes"
    if "green banana" in name_lower or "ash banana" in name_lower or "curry banana" in name_lower:
        return "Green Banana"
    if "banana" in name_lower or "rasakadali" in name_lower or "poovan" in name_lower:
        return "Banana"
    if "cherry" in name_lower or "cherries" in name_lower or "strawberry" in name_lower or "berry" in name_lower or "berries" in name_lower or "physalis" in name_lower or "currant" in name_lower:
        return "Berries"
    if "orange" in name_lower or "mandarin" in name_lower or "lemon" in name_lower or "lime" in name_lower or "citrus" in name_lower or "valencia" in name_lower or "pomelo" in name_lower:
        return "Citrus Fruits"
    if "grape" in name_lower:
        return "Grapes"
    if "date" in name_lower or "dates" in name_lower:
        return "Fresh Dates"
    if "apricot" in name_lower or "apricots" in name_lower:
        return "Apricots"
    if "plum" in name_lower or "angelino" in name_lower:
        return "Plums"
    if "melon" in name_lower or "watermelon" in name_lower or "cantaloupe" in name_lower:
        return "Melons"
    if "nectarine" in name_lower:
        return "Nectarine"
    if "peach" in name_lower or "peaches" in name_lower:
        return "Peaches"
    if "pear" in name_lower or "pears" in name_lower:
        return "Pears"
    if "avocado" in name_lower or "hass" in name_lower:
        return "Avocado"
    if "coconut" in name_lower:
        return "Coconut"
    if "kiwi" in name_lower:
        return "Kiwi"
    if "papaya" in name_lower:
        return "Papaya"
    if "pineapple" in name_lower:
        return "Pineapple"
    if "pomegranate" in name_lower or "anar" in name_lower:
        return "Pomegranates"
    if "chickoo" in name_lower or "chikoo" in name_lower or "sapota" in name_lower:
        return "Chickoo"
    if "jackfruit" in name_lower:
        return "Jackfruit"
    if "chestnut" in name_lower or "chest nut" in name_lower or "almond" in name_lower:
        return "Fresh Nuts"
    
    # 4. Vegetables & Herbs
    if "potato" in name_lower and "sweet" not in name_lower and "chinese" not in name_lower:
        return "Potatoes & Starchy Vegetables"
    if "sweet potato" in name_lower or "tapioca" in name_lower or "yam" in name_lower or "suran" in name_lower or "taro" in name_lower or "koorka" in name_lower or "aravi" in name_lower or "colocasia" in name_lower or "kachil" in name_lower or "lothi" in name_lower:
        return "Potatoes & Starchy Vegetables"
    if "onion" in name_lower and "spring" not in name_lower and "shallot" not in name_lower:
        return "Onion"
    if "shallot" in name_lower or "shallots" in name_lower:
        return "Shallots"
    if "garlic" in name_lower:
        return "Garlic"
    if "leek" in name_lower or "spring onion" in name_lower or "spring onions" in name_lower:
        return "Leeks/Spring Onions"
    if "cabbage" in name_lower or "broccoli" in name_lower or "cauliflower" in name_lower or "kohlrabi" in name_lower or "knol-khol" in name_lower or "kohi" in name_lower or "bok choy" in name_lower or "bokchoy" in name_lower or "paksoy" in name_lower or "pak choy" in name_lower:
        return "Cabbage & Broccoli"
    if "lettuce" in name_lower or "spinach" in name_lower or "rocket" in name_lower or "rucola" in name_lower or "molokhiya" in name_lower or "molokhia" in name_lower or "chard" in name_lower or "arugula" in name_lower or "jerjir" in name_lower or "jerjer" in name_lower or "ruwaith" in name_lower or "kale" in name_lower or "cheera" in name_lower or "kangkong" in name_lower or "kangon" in name_lower or "pechay" in name_lower or "mustard leaves" in name_lower:
        return "Leafy Vegetables"
    if "coriander" in name_lower or "parsley" in name_lower or "parsely" in name_lower or "basil" in name_lower or "thyme" in name_lower or "mint" in name_lower or "celery" in name_lower or "fennel" in name_lower or "herbs" in name_lower or "curry leaves" in name_lower or "dill" in name_lower or "rosemary" in name_lower or "pandan" in name_lower or "galangal" in name_lower or "kalangal" in name_lower:
        return "Herbs"
    if "marrow" in name_lower or "kusa" in name_lower or "courgette" in name_lower or "zucchini" in name_lower or "artichoke" in name_lower:
        return "Courgettes & Artichoke"
    if "jalapeno" in name_lower or "chilli" in name_lower or "chilly" in name_lower or "ginger" in name_lower or "pepper" in name_lower:
        return "Chillies & Spicy"
    if "pumpkin" in name_lower or "butternut" in name_lower or "mathan" in name_lower:
        return "Pumpkin"
    if "gourd" in name_lower or "kumbalam" in name_lower or "dhundul" in name_lower or "tindly" in name_lower or "tindli" in name_lower or "kovakka" in name_lower or "kovakkai" in name_lower or "parwal" in name_lower or "usta" in name_lower or "ashgourd" in name_lower:
        return "Gourds"
    if "cucumber" in name_lower or "vellary" in name_lower or "vellery" in name_lower:
        return "Cucumber"
    if "mushroom" in name_lower or "mushrooms" in name_lower or "portobello" in name_lower or "agrico" in name_lower:
        return "Mushrooms"
    if "carrot" in name_lower or "carrots" in name_lower:
        return "Carrots"
    if "asparagus" in name_lower:
        return "Asparagus"
    if "radish" in name_lower or "raddish" in name_lower:
        return "Raddish"
    if "sprout" in name_lower or "sprouts" in name_lower:
        return "Sprouts"
    if "turmeric" in name_lower:
        return "Turmeric"
    if "chayote" in name_lower or "chow chow" in name_lower:
        return "Chayote"
    if "corn" in name_lower or "baby corn" in name_lower or "sweet corn" in name_lower:
        return "Corns & Baby Corn"
    if "lady finger" in name_lower or "lady's finger" in name_lower or "bhindi" in name_lower or "okra" in name_lower:
        return "Lady Finger"
    if "peas" in name_lower or "beans" in name_lower or "seem" in name_lower or "flat bean" in name_lower or "mangetout" in name_lower or "mutter" in name_lower or "sugar snaps" in name_lower:
        return "Peas & Beans"
    if "beetroot" in name_lower:
        return "Beetroot"

    
    # 4. Fallbacks
    veg_keywords = ["aloe vera", "amla", "aravi", "drumstick", "eggplant", "brinjal", "turnip", "bagal", "chow chow", "gooseberry"]
    for kw in veg_keywords:
        if kw in name_lower:
            return "Other Vegetables"
            
    fruit_keywords = ["fruit", "berry", "citrus", "nectarine", "plum", "peach", "pear", "apricot", "mango", "apple", "banana", "avocado", "coconut", "kiwi", "papaya", "pineapple", "pomegranate", "chickoo"]
    for kw in fruit_keywords:
        if kw in name_lower:
            return "Other Fruits"
            
    return "Other Vegetables"


def create_product_group(
    conn: sqlite3.Connection, 
    canonical_name: str,
    country: str | None,
    weight: float | None,
    unit: str | None
) -> int:
    """Create new product group with standardized attributes."""
    display_name = build_common_product_name(canonical_name) or canonical_name
    product_type = classify_product_name(display_name)
    cur = conn.execute(
        """INSERT INTO product_groups (canonical_name, product_type, origin_country, standard_weight, standard_unit) 
           VALUES (?, ?, ?, ?, ?)""",
        (canonical_name, product_type, country, weight, unit)
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
    sku: str = None,
) -> int:
    # Extract attributes for matching and storage
    country = extract_country(product_name)
    weight, unit = extract_weight(product_name)

    row = conn.execute(
        "SELECT id FROM products WHERE company_id = ? AND product_name = ?",
        (company_id, product_name),
    ).fetchone()

    # Find or create product group for cross-company deduplication
    product_group_id = find_matching_product_group(conn, product_name, country, weight, unit)
    if product_group_id is None:
        product_group_id = create_product_group(conn, product_name, country, weight, unit)

    if row:
        conn.execute(
            """UPDATE products SET 
               product_url=?, image_url=?, product_group_id=?, sku=?, 
               origin_country=?, standard_weight=?, standard_unit=? 
               WHERE id=?""",
            (product_url, image_url, product_group_id, sku, country, weight, unit, row["id"]),
        )
        conn.commit()
        return row["id"]

    cur = conn.execute(
        """INSERT INTO products (company_id, category_id, brand_id, product_name, product_url, image_url, product_group_id, sku, origin_country, standard_weight, standard_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (company_id, category_id, brand_id, product_name, product_url, image_url, product_group_id, sku, country, weight, unit),
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
            product.get("sku"),
        )
        if product.get("price") is not None:
            insert_price(conn, product_id, product["price"], product.get("currency", "QAR"))
        logger.debug(f"Saved: {product['company']} - {product['product_name']} @ {product.get('price')}")
    except Exception as e:
        logger.error(f"Error saving product {product}: {e}")
    finally:
        conn.close()
