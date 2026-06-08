"""
Main scraper orchestrator - runs all scrapers concurrently,
then exports today's data to CSV and uploads to Google Drive.
"""

import asyncio
import logging
import time
from datetime import datetime

from utils import setup_logging
from database import init_db
import rawabi
import family
import lulu

logger = logging.getLogger(__name__)


async def run_all():
    """Run all scrapers and report results."""
    start = time.time()
    logger.info(f"=== Qatar Price Comparison Scraper started at {datetime.now().isoformat()} ===")

    # Initialize DB
    init_db()
    logger.info("Database initialized")

    # Run scrapers concurrently
    results = await asyncio.gather(
        rawabi.run(),
        family.run(),
        lulu.run(),
        return_exceptions=True,
    )

    scraper_ok = True
    for name, result in zip(["Rawabi", "Family", "Lulu"], results):
        if isinstance(result, Exception):
            logger.error(f"{name} scraper FAILED: {result}")
            scraper_ok = False
        else:
            logger.info(f"{name} scraper completed successfully")

    elapsed = time.time() - start
    logger.info(f"=== Scraping complete in {elapsed:.1f}s ===")

    if scraper_ok:
        logger.info("=== Starting CSV export & Drive upload ===")
        try:
            from export_csv import export_and_upload
            export_and_upload()
            logger.info("=== CSV export & Drive upload complete ===")
        except Exception as e:
            logger.error(f"CSV export/upload FAILED: {e}")
            scraper_ok = False # Mark as failed if export fails
    else:
        logger.warning("Skipping CSV export because one or more scrapers failed.")

    if not scraper_ok:
        import sys
        logger.error("Scraping or Export process failed.")
        sys.exit(1)


if __name__ == "__main__":
    setup_logging()
    asyncio.run(run_all())
