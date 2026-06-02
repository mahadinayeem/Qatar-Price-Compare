"""
Main scraper orchestrator - runs all scrapers concurrently
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

    for name, result in zip(["Rawabi", "Family", "Lulu"], results):
        if isinstance(result, Exception):
            logger.error(f"{name} scraper FAILED: {result}")
        else:
            logger.info(f"{name} scraper completed successfully")

    elapsed = time.time() - start
    logger.info(f"=== Scraping complete in {elapsed:.1f}s ===")


if __name__ == "__main__":
    setup_logging()
    asyncio.run(run_all())
