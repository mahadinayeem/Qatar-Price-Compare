"""
Lulu Hypermarket scraper
URL: https://gcc.luluhypermarket.com/en-qa/fresh-food-fruits-vegetables/
"""

import asyncio
import logging
from playwright.async_api import async_playwright, Page, BrowserContext

from utils import parse_price
from database import save_product

logger = logging.getLogger(__name__)

COMPANY = "Lulu Hypermarket"
BASE_URL = "https://gcc.luluhypermarket.com"
START_URL = "https://gcc.luluhypermarket.com/en-qa/fresh-food-fruits-vegetables/"
CATEGORY = "Fruits & Vegetables"


async def scroll_to_load(page: Page):
    """Scroll page to trigger lazy loading."""
    prev_height = 0
    for _ in range(10):
        curr_height = await page.evaluate("document.body.scrollHeight")
        if curr_height == prev_height:
            break
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(1.5)
        prev_height = curr_height


async def scrape_page(page: Page) -> list[dict]:
    """Extract all products from the current page."""
    products = []

    try:
        await page.wait_for_selector(
            "[data-testid='product-price']",
            timeout=15000
        )
    except Exception:
        logger.warning("Lulu: Timeout waiting for product-price selector")

    await scroll_to_load(page)

    price_elements = await page.query_selector_all("[data-testid='product-price']")
    logger.info(f"Lulu: Found {len(price_elements)} price elements")

    items = []
    for price_el in price_elements:
        try:
            container = await price_el.evaluate_handle("""el => {
                let p = el;
                for (let i = 0; i < 8; i++) {
                    if (p.parentElement) {
                        p = p.parentElement;
                        if (p.querySelector('img') && p.querySelector('a') && p.textContent.length < 1000) {
                            return p;
                        }
                    }
                }
                return null;
            }""")
            if container:
                element = container.as_element()
                if element and element not in items:
                    items.append(element)
        except Exception as e:
            logger.debug(f"Lulu: Error resolving container: {e}")

    logger.info(f"Lulu: Resolved {len(items)} unique item containers")

    for item in items:
        try:
            img_el = await item.query_selector("img")
            full_name = ""
            if img_el:
                full_name = (await img_el.get_attribute("alt") or "").strip()

            if not full_name:
                name_el = await item.query_selector(
                    "[class*='name'], [class*='title'], [class*='Name'], h2, h3, p[class*='name']"
                )
                full_name = (await name_el.inner_text()).strip() if name_el else ""

            price_el = await item.query_selector("[data-testid='product-price']")
            if not price_el:
                price_el = await item.query_selector(
                    "[class*='sale-price'], [class*='special-price'], [class*='current-price'], [class*='price']"
                )
            price_text = (await price_el.inner_text()).strip() if price_el else ""
            price = parse_price(price_text)

            image_url = ""
            if img_el:
                image_url = (
                    await img_el.get_attribute("src")
                    or await img_el.get_attribute("data-src")
                    or ""
                )
            if image_url and image_url.startswith("/"):
                image_url = BASE_URL + image_url

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
            logger.warning(f"Lulu: Error parsing item: {e}")

    return products


async def get_next_page_url(page: Page) -> str | None:
    """Return next page URL or None."""
    try:
        # Try different selector patterns for next page button
        selectors = [
            "a[rel='next']",
            "[class*='pagination'] [class*='next']:not([class*='disabled']) a",
            ".pagination-next:not(.disabled) a",
            "a:has-text('Next')",
            "[class*='next-page'] a:not([class*='disabled'])",
        ]
        
        for selector in selectors:
            try:
                next_el = await page.query_selector(selector)
                if next_el:
                    href = await next_el.get_attribute("href")
                    if href:
                        return href if href.startswith("http") else BASE_URL + href
            except:
                pass
    except Exception as e:
        logger.debug(f"Lulu: Error finding next page: {e}")
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
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        page = await context.new_page()

        page_num = 1
        while current_url:
            logger.info(f"Lulu: Scraping page {page_num}: {current_url}")
            try:
                await page.goto(current_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)

                products = await scrape_page(page)
                all_products.extend(products)
                logger.info(f"Lulu: Page {page_num} got {len(products)} products")

                next_url = await get_next_page_url(page)
                current_url = next_url
                page_num += 1

                if page_num > 20:
                    logger.warning("Lulu: Hit page limit (20), stopping")
                    break

            except Exception as e:
                logger.error(f"Lulu: Error on page {page_num}: {e}")
                break

        await browser.close()

    logger.info(f"Lulu: Total scraped {len(all_products)} products")
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
            logger.error(f"Lulu: Failed to save {p.get('product_name')}: {e}")
            failed += 1
    logger.info(f"Lulu: Saved={saved} Failed={failed}")


if __name__ == "__main__":
    from utils import setup_logging
    setup_logging()
    asyncio.run(run())
