"""
export_csv.py
=============
After the scraper runs, this script:
1. Reads today's prices from the SQLite database.
2. Builds a clean, structured CSV with columns:
       date | category | product_name | product_type | origin | unit |
       lulu_price | rawabi_price | family_price |
       price_per_kg_lulu | price_per_kg_rawabi | price_per_kg_family |
       cheapest_store | status
3. Downloads the existing master CSV from Google Drive (if any).
4. Detects "Market Out" products (present yesterday, absent today).
5. Prepends today's rows to the master CSV (newest data on top).
6. Uploads the updated master CSV back to Google Drive.

Environment variables required:
    GOOGLE_CREDENTIALS      - Service-account JSON as a string
    GOOGLE_DRIVE_FOLDER_ID  - ID of the target Google Drive folder
"""

import csv
import io
import json
import logging
import os
import sqlite3
from datetime import datetime, date

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
DATABASE_PATH = os.getenv("DATABASE_PATH", "../frontend/data/products.db")
MASTER_FILENAME = "master_prices.csv"
COMPANY_MAP = {
    "Lulu Hypermarket": "lulu",
    "Rawabi": "rawabi",
    "Family Food Centre": "family",
}
CSV_COLUMNS = [
    "date",
    "category",
    "product_name",
    "product_type",
    "origin",
    "unit",
    "lulu_price",
    "rawabi_price",
    "family_price",
    "price_per_kg_lulu",
    "price_per_kg_rawabi",
    "price_per_kg_family",
    "cheapest_store",
    "status",
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _format_unit(weight: float | None, unit: str | None) -> str:
    """Convert stored standard weight back to a human-readable unit string.

    The DB stores weight in base units (g / ml) and a base unit label.
    Examples:
        weight=1000, unit="g"  -> "1kg"
        weight=500,  unit="g"  -> "500g"
        weight=1000, unit="ml" -> "1ltr"
    """
    if weight is None or unit is None:
        return ""
    if unit == "g":
        if weight >= 1000 and weight % 1000 == 0:
            return f"{int(weight // 1000)}kg"
        return f"{int(weight)}g"
    if unit == "ml":
        if weight >= 1000 and weight % 1000 == 0:
            return f"{int(weight // 1000)}ltr"
        return f"{int(weight)}ml"
    return f"{weight}{unit}"


def _price_per_kg(price: float | None, weight_g: float | None) -> float | None:
    """Normalise price to per-KG equivalent (works for g/ml base units)."""
    if price is None or not weight_g or weight_g <= 0:
        return None
    return round(price / weight_g * 1000, 2)


def _cheapest(lulu, rawabi, family) -> str:
    """Return the store name with the lowest price per KG."""
    candidates = {
        k: v
        for k, v in {"Lulu": lulu, "Rawabi": rawabi, "Family": family}.items()
        if v is not None
    }
    if not candidates:
        return ""
    return min(candidates, key=candidates.get)


def _broad_category(product_type: str) -> str:
    """Map specific product_type to broad Fruits / Vegetables category."""
    fruit_types = {
        "Apples", "Mangoes", "Green Mango", "Banana", "Green Banana",
        "Berries", "Citrus Fruits", "Grapes", "Fresh Dates", "Apricots",
        "Plums", "Melons", "Nectarine", "Peaches", "Pears", "Avocado",
        "Coconut", "Kiwi", "Papaya", "Pineapple", "Pomegranates", "Chickoo",
        "Jackfruit", "Fresh Nuts", "Cut Fruits", "Other Fruits",
    }
    return "Fruits" if product_type in fruit_types else "Vegetables"


# ── Core export logic ──────────────────────────────────────────────────────────

def build_today_rows(today: str) -> list[dict]:
    """Query SQLite and build one row per product_group for today."""
    conn = _get_connection()
    try:
        # Fetch today's prices joined with product / product_group info
        sql = """
            SELECT
                pg.id              AS group_id,
                pg.canonical_name,
                pg.product_type,
                pg.origin_country,
                pg.standard_weight,
                pg.standard_unit,
                c.name             AS company_name,
                ph.price
            FROM price_history ph
            JOIN products      p  ON ph.product_id    = p.id
            JOIN product_groups pg ON p.product_group_id = pg.id
            JOIN companies      c  ON p.company_id    = c.id
            WHERE DATE(ph.scraped_at) = ?
        """
        rows = conn.execute(sql, (today,)).fetchall()
    finally:
        conn.close()

    # Group by product_group_id
    groups: dict[int, dict] = {}
    for row in rows:
        gid = row["group_id"]
        if gid not in groups:
            groups[gid] = {
                "canonical_name": row["canonical_name"],
                "product_type": row["product_type"] or "Other Vegetables",
                "origin": (row["origin_country"] or "").title(),
                "weight": row["standard_weight"],
                "unit_label": row["standard_unit"],
                "prices": {},
            }
        store_key = COMPANY_MAP.get(row["company_name"])
        if store_key:
            groups[gid]["prices"][store_key] = row["price"]

    # Build clean display name (strip origin + unit from canonical name)
    from utils import get_display_name

    result_rows = []
    for gid, g in groups.items():
        lulu_p   = g["prices"].get("lulu")
        rawabi_p = g["prices"].get("rawabi")
        family_p = g["prices"].get("family")

        # Normalised price per KG
        ppk_lulu   = _price_per_kg(lulu_p,   g["weight"])
        ppk_rawabi = _price_per_kg(rawabi_p, g["weight"])
        ppk_family = _price_per_kg(family_p, g["weight"])

        result_rows.append({
            "date":               today,
            "category":           _broad_category(g["product_type"]),
            "product_name":       get_display_name(g["canonical_name"]),
            "product_type":       g["product_type"],
            "origin":             g["origin"],
            "unit":               _format_unit(g["weight"], g["unit_label"]),
            "lulu_price":         lulu_p,
            "rawabi_price":       rawabi_p,
            "family_price":       family_p,
            "price_per_kg_lulu":  ppk_lulu,
            "price_per_kg_rawabi": ppk_rawabi,
            "price_per_kg_family": ppk_family,
            "cheapest_store":     _cheapest(ppk_lulu, ppk_rawabi, ppk_family),
            "status":             "Active",
        })

    # Sort: category → product_type → product_name
    result_rows.sort(key=lambda r: (r["category"], r["product_type"], r["product_name"]))
    logger.info(f"export_csv: Built {len(result_rows)} rows for {today}")
    return result_rows


def detect_market_out(today_rows: list[dict], master_rows: list[dict], today: str) -> list[dict]:
    """
    Compare today's active products with yesterday's.
    Add 'Market Out' rows for products present yesterday but gone today.
    """
    if not master_rows:
        return []

    yesterday = None
    for r in master_rows:
        d = r.get("date", "")
        if d and d != today:
            yesterday = d
            break

    if not yesterday:
        return []

    yesterday_names = {
        r["product_name"]
        for r in master_rows
        if r.get("date") == yesterday and r.get("status") == "Active"
    }
    today_names = {r["product_name"] for r in today_rows}
    market_out_names = yesterday_names - today_names

    market_out_rows = []
    for r in master_rows:
        if r.get("date") == yesterday and r.get("product_name") in market_out_names:
            new_row = dict(r)
            new_row["date"] = today
            new_row["status"] = "Market Out"
            new_row["lulu_price"] = None
            new_row["rawabi_price"] = None
            new_row["family_price"] = None
            new_row["price_per_kg_lulu"] = None
            new_row["price_per_kg_rawabi"] = None
            new_row["price_per_kg_family"] = None
            new_row["cheapest_store"] = ""
            market_out_rows.append(new_row)

    if market_out_rows:
        logger.info(f"export_csv: Detected {len(market_out_rows)} Market Out products")
    return market_out_rows


def rows_to_csv_string(rows: list[dict]) -> str:
    """Serialise list of dicts to a CSV string."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def csv_string_to_rows(csv_str: str) -> list[dict]:
    """Parse a CSV string back into a list of dicts."""
    reader = csv.DictReader(io.StringIO(csv_str))
    return list(reader)


# ── Google Drive helpers ───────────────────────────────────────────────────────

def _build_drive_service():
    """Build an authenticated Google Drive API service from env credentials."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        creds_json = os.environ.get("GOOGLE_CREDENTIALS")
        if not creds_json:
            raise ValueError("GOOGLE_CREDENTIALS environment variable not set")

        creds_info = json.loads(creds_json)
        logger.info(f"Connecting to Google Drive with Service Account: {creds_info.get('client_email')}")

        scopes = [
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive",
        ]
        credentials = service_account.Credentials.from_service_account_info(
            creds_info, scopes=scopes
        )
        return build("drive", "v3", credentials=credentials, cache_discovery=False)
    except Exception as e:
        logger.error(f"Failed to build Google Drive service: {e}")
        raise


def find_master_file(service, folder_id: str) -> str | None:
    """Return the file ID of the master CSV if it already exists in Drive."""
    query = (
        f"'{folder_id}' in parents "
        f"and name='{MASTER_FILENAME}' "
        f"and trashed=false"
    )
    response = service.files().list(q=query, fields="files(id, name)").execute()
    files = response.get("files", [])
    return files[0]["id"] if files else None


def download_master_csv(service, file_id: str) -> str:
    """Download the master CSV from Google Drive and return as a string."""
    from googleapiclient.http import MediaIoBaseDownload

    buf = io.BytesIO()
    request = service.files().get_media(fileId=file_id)
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue().decode("utf-8")


def upload_master_csv(service, folder_id: str, csv_content: str, existing_file_id: str | None):
    """Upload (create or update) the master CSV on Google Drive."""
    from googleapiclient.http import MediaInMemoryUpload

    media = MediaInMemoryUpload(
        csv_content.encode("utf-8"),
        mimetype="text/csv",
        resumable=False,
    )
    if existing_file_id:
        service.files().update(
            fileId=existing_file_id,
            media_body=media,
        ).execute()
        logger.info(f"export_csv: Updated existing master file ({existing_file_id}) on Drive")
    else:
        metadata = {"name": MASTER_FILENAME, "parents": [folder_id]}
        result = service.files().create(
            body=metadata,
            media_body=media,
            fields="id",
        ).execute()
        logger.info(f"export_csv: Created new master file on Drive (id={result['id']})")


# ── Main entry point ───────────────────────────────────────────────────────────

def export_and_upload():
    """Full pipeline: build CSV → merge with Drive master → upload."""
    today = date.today().isoformat()
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")

    if not folder_id:
        logger.warning("GOOGLE_DRIVE_FOLDER_ID not set — skipping Drive upload. CSV will be saved locally only.")

    # 1. Build today's rows from SQLite
    today_rows = build_today_rows(today)
    if not today_rows:
        logger.warning("export_csv: No rows found for today. Nothing to export.")
        return

    # 2. Download existing master CSV from Drive (if available)
    master_rows: list[dict] = []
    existing_file_id: str | None = None

    if folder_id:
        try:
            service = _build_drive_service()
            existing_file_id = find_master_file(service, folder_id)
            if existing_file_id:
                raw = download_master_csv(service, existing_file_id)
                master_rows = csv_string_to_rows(raw)
                logger.info(f"export_csv: Downloaded master with {len(master_rows)} existing rows")
        except Exception as e:
            logger.error(f"export_csv: Could not download master from Drive: {e}")

    # 3. Detect Market Out products
    market_out_rows = detect_market_out(today_rows, master_rows, today)

    # 4. Combine: today (active + market-out) on top, then older rows
    all_new_rows = today_rows + market_out_rows
    # Remove any previous rows for today (avoid duplicates on re-run)
    historical_rows = [r for r in master_rows if r.get("date") != today]
    final_rows = all_new_rows + historical_rows

    # 5. Serialise to CSV
    csv_content = rows_to_csv_string(final_rows)

    # 6. Save locally as backup (always)
    local_dir = os.path.join(os.path.dirname(__file__), "..", "data", "daily")
    os.makedirs(local_dir, exist_ok=True)
    local_path = os.path.join(local_dir, f"{today}.csv")
    with open(local_path, "w", newline="", encoding="utf-8") as f:
        f.write(csv_content)
    logger.info(f"export_csv: Saved local CSV → {local_path}")

    # 7. Upload to Google Drive
    if folder_id:
        try:
            upload_master_csv(service, folder_id, csv_content, existing_file_id)
            logger.info("export_csv: Upload to Google Drive complete ✓")
        except Exception as e:
            logger.error(f"export_csv: Drive upload failed: {e}")


if __name__ == "__main__":
    from utils import setup_logging
    setup_logging()
    export_and_upload()
