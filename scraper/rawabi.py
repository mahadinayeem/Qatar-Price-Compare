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

            # SKU extraction
            sku = None
            if product_url:
                # Rawabi URLs often have an ID at the end
                parts = product_url.strip("/").split("/")
                if len(parts) > 0:
                    last_part = parts[-1].split("?")[0]
                    if any(c.isdigit() for c in last_part):
                        sku = last_part

            if not full_name:
                continue

            # Use full product name for better deduplication across websites
            products.append({
                "company": COMPANY,
                "category": CATEGORY,
                "brand": None,
                "product_name": full_name,
                "sku": sku,
                "price": price,
                "currency": "QAR",
                "image_url": image_url,
                "product_url": product_url,
            })

        except Exception as e:
            logger.warning(f"Rawabi: Error parsing item: {e}")

    return products


async def scrape(headless: bool = True) -> list[dict]:
    """Main scraper entry point using infinite scroll."""
    all_products = []
    current_url = START_URL

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        context: BrowserContext = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        logger.info(f"Rawabi: Loading start URL: {current_url}")
        try:
            await page.goto(current_url, wait_until="domcontentloaded", timeout=45000)
            await asyncio.sleep(3)  # Let initial items render

            last_count = 0
            no_change_count = 0
            scroll_count = 0
            max_scrolls = 40  # Safety limit

            while scroll_count < max_scrolls:
                items = await page.query_selector_all(".product-card")
                current_count = len(items)
                logger.info(f"Rawabi: Scroll {scroll_count} - Found {current_count} items")

                if current_count == last_count:
                    no_change_count += 1
                    if no_change_count >= 3:
                        logger.info("Rawabi: Item count stable, reached end of list.")
                        break
                else:
                    no_change_count = 0

                last_count = current_count

                # Scroll down
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(2)
                scroll_count += 1

            all_products = await scrape_page(page)

        except Exception as e:
            logger.error(f"Rawabi: Error during scraping: {e}")

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
