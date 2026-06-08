"""
cleanup_database.py — Clean up stale/buggy products (no price updates today) and re-classify categories.
"""

import sqlite3
import os
import logging
from datetime import datetime
from database import get_connection, classify_product_name
from rebuild_groups import rebuild_groups
from utils import setup_logging

logger = logging.getLogger(__name__)

def cleanup():
    conn = get_connection()
    try:
        today = datetime.now().date().isoformat()
        logger.info(f"=== Starting database cleanup for today: {today} ===")

        # Step 1: Count before
        total_before = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        
        # Step 2: Delete price histories of stale products
        # Stale products are those that do NOT have any price history scraped today
        logger.info("Identifying and deleting stale price histories...")
        conn.execute("""
            DELETE FROM price_history
            WHERE product_id IN (
                SELECT p.id FROM products p
                WHERE NOT EXISTS (
                    SELECT 1 FROM price_history ph
                    WHERE ph.product_id = p.id AND DATE(ph.scraped_at) = ?
                )
            )
        """, (today,))
        
        # Step 3: Delete the stale products themselves
        logger.info("Deleting stale products...")
        cur = conn.execute("""
            DELETE FROM products
            WHERE NOT EXISTS (
                SELECT 1 FROM price_history ph
                WHERE ph.product_id = products.id AND DATE(ph.scraped_at) = ?
            )
        """, (today,))
        deleted_products = cur.rowcount
        conn.commit()

        total_after = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        logger.info(f"Deleted {deleted_products} stale products. Products count: {total_before} -> {total_after}")

        # Step 4: Rebuild groups from scratch using exact-match and update classifications
        logger.info("Rebuilding product groups...")
        
    finally:
        conn.close()

    # Rebuild all groups using rebuild_groups from rebuild_groups.py
    rebuild_groups()

if __name__ == "__main__":
    setup_logging()
    cleanup()
