"""
Test script to verify scraper works and gets all products
"""

import asyncio
import logging
import sys
from datetime import datetime

from utils import setup_logging
from database import init_db
import rawabi
import family
import lulu

logger = logging.getLogger(__name__)


async def test_single_scraper(name: str, scraper_module) -> int:
    """Test a single scraper and return product count."""
    logger.info(f"\n{'='*60}")
    logger.info(f"Testing {name} scraper...")
    logger.info(f"{'='*60}")
    
    try:
        products = await scraper_module.scrape(headless=True)
        logger.info(f"✓ {name} scraper returned {len(products)} products")
        
        if products:
            # Show sample product
            sample = products[0]
            logger.info(f"  Sample: {sample['product_name'][:60]}... @ {sample.get('price')} {sample.get('currency')}")
        
        return len(products)
    except Exception as e:
        logger.error(f"✗ {name} scraper FAILED: {e}")
        return 0


async def test_all():
    """Test all scrapers."""
    logger.info(f"\n=== Qatar Price Comparison Scraper Test ===")
    logger.info(f"Started at {datetime.now().isoformat()}\n")
    
    # Initialize DB
    init_db()
    logger.info("Database initialized")
    
    # Test each scraper
    results = {
        "Rawabi": await test_single_scraper("Rawabi", rawabi),
        "Family": await test_single_scraper("Family Food Centre", family),
        "Lulu": await test_single_scraper("Lulu Hypermarket", lulu),
    }
    
    # Summary
    total = sum(results.values())
    logger.info(f"\n{'='*60}")
    logger.info(f"TEST SUMMARY:")
    logger.info(f"{'='*60}")
    for name, count in results.items():
        logger.info(f"  {name:20s}: {count:4d} products")
    logger.info(f"  {'TOTAL':20s}: {total:4d} products")
    logger.info(f"{'='*60}\n")
    
    if total > 64:
        logger.info("✓ SUCCESS: Got more than 64 products! Pagination is working.")
    else:
        logger.warning("⚠ WARNING: Still getting 64 or fewer products. Pagination might need more work.")


if __name__ == "__main__":
    setup_logging()
    asyncio.run(test_all())
