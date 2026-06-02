"""
Rawabi Hypermarket scraper
URL: https://rawabihypermarket.com/fruit-and-vegetables/3/749/0/0
"""

import asyncio
import logging
from playwright.async_api import async_playwright, Page, BrowserContext

from utils import parse_price
from database import save_product

logger = logging.getLogger(__name__)

COMPANY = "Rawabi"
BASE_URL = "https://rawabihypermarket.com"
START_URL = "https://rawabihypermarket.com/fruit-and-vegetables/3/749/0/0"
CATEGORY = "Fruits & Vegetables"


async def scrape_page(page: Page) -> list[dict]:
    """Extract all products from the current page."""
    products = []

    await page.wait_for_selector(".product-item, .product-card, [class*='product']", timeout=15000)

    items = await page.query_selector_all(".product-item, .product-card")

    if not items:
        # Try alternative selectors
        items = await page.query_selector_all("[class*='product-item'], [class*='product-card']")

    logger.info(f"Rawabi: Found {len(items)} items on page")

    for item in items:
        try:
            # Product name
            name_el = await item.query_selector(
                ".p-description p, .p-description a, .product-name, .product-title, h2, h3, [class*='name'], [class*='title']"
            )
            full_name = (await name_el.inner_text()).strip() if name_el else ""

            # Price
            price_el = await item.query_selector(
                ".price, .product-price, [class*='price'], span[class*='price']"
            )
            price_text = (await price_el.inner_text()).strip() if price_el else ""
            price = parse_price(price_text)

            # Image
            img_el = await item.query_selector("img")
            image_url = await img_el.get_attribute("src") if img_el else ""
            if image_url and image_url.startswith("/"):
                image_url = BASE_URL + image_url

            # URL
            link_el = await item.query_selector("a")
            product_url = await link_el.get_attribute("href") if link_el else ""
            if product_url and product_url.startswith("/"):
                product_url = BASE_URL + product_url

            if not full_name:
                continue

            # Use full product name for better deduplication across websites
            products.append({
                "company": COMPANY,
                "category": CATEGORY,
                "brand": None,
                "product_name": full_name,
                "price": price,
                "currency": "QAR",
                "image_url": image_url,
                "product_url": product_url,
            })

        except Exception as e:
            logger.warning(f"Rawabi: Error parsing item: {e}")

    return products


async def has_next_page(page: Page) -> str | None:
    """Return URL of next page, or None if last page."""
    try:
        # Try different selector patterns for next page button
        selectors = [
            "a[rel='next']",
            ".pagination .next:not(.disabled) a",
            "[class*='next-page']:not([disabled])",
            "a:has-text('Next')",
            "[class*='pagination'] a[class*='next']",
        ]
        
        for selector in selectors:
            try:
                next_btn = await page.query_selector(selector)
                if next_btn:
                    href = await next_btn.get_attribute("href")
                    if href:
                        return href if href.startswith("http") else BASE_URL + href
            except:
                pass
    except Exception as e:
        logger.debug(f"Rawabi: Error finding next page: {e}")
    return None


async def scrape(headless: bool = True) -> list[dict]:
    """Main scraper entry point."""
    all_products = []
    current_url = START_URL

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        context: BrowserContext = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        page_num = 1
        while current_url:
            logger.info(f"Rawabi: Scraping page {page_num}: {current_url}")
            try:
                await page.goto(current_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(2)  # Let JS render

                products = await scrape_page(page)
                all_products.extend(products)
                logger.info(f"Rawabi: Page {page_num} got {len(products)} products")

                next_url = await has_next_page(page)
                current_url = next_url
                page_num += 1

                if page_num > 20:  # Safety limit
                    logger.warning("Rawabi: Hit page limit (20), stopping")
                    break

            except Exception as e:
                logger.error(f"Rawabi: Error on page {page_num}: {e}")
                break

        await browser.close()

    logger.info(f"Rawabi: Total scraped {len(all_products)} products")
    return all_products


async def run():
    """Run scraper and save to DB."""
    products = await scrape()
    saved = 0
    failed = 0
    for p in products:
        try:
            save_product(p)
            saved += 1
        except Exception as e:
            logger.error(f"Rawabi: Failed to save {p.get('product_name')}: {e}")
            failed += 1
    logger.info(f"Rawabi: Saved={saved} Failed={failed}")


if __name__ == "__main__":
    from utils import setup_logging
    setup_logging()
    asyncio.run(run())
