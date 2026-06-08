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
            "div.rounded-v2-xs.border, [data-testid='product-price']",
            timeout=20000
        )
    except Exception:
        logger.warning("Lulu: Timeout waiting for products container selectors")

    await scroll_to_load(page)

    # Use robust card selectors directly
    items = await page.query_selector_all("div.rounded-v2-xs.border")
    logger.info(f"Lulu: Found {len(items)} product card containers")

    for item in items:
        try:
            # 1. Product Name from target elements
            name_el = await item.query_selector("a[data-testid]")
            full_name = ""
            if name_el:
                full_name = (await name_el.inner_text()).strip()
            if not full_name:
                name_el = await item.query_selector("a[class*='line-clamp']")
                full_name = (await name_el.inner_text()).strip() if name_el else ""
            
            # Fallback if names are badges
            if not full_name or full_name.lower() in ["lactose-icon", "fresh", "organic", "gluten-free"]:
                img_el = await item.query_selector("img[alt]:not([alt*='icon']):not([alt*='badge'])")
                if img_el:
                    full_name = (await img_el.get_attribute("alt") or "").strip()
            
            # If still nothing, query generic image alt
            if not full_name:
                img_el = await item.query_selector("img")
                if img_el:
                    full_name = (await img_el.get_attribute("alt") or "").strip()

            if not full_name or full_name.lower() in ["lactose-icon", "fresh", "organic", "gluten-free"]:
                continue

            # 2. Product URL
            product_url = ""
            if name_el:
                product_url = await name_el.get_attribute("href") or ""
            if not product_url:
                link_el = await item.query_selector("a")
                if link_el:
                    product_url = await link_el.get_attribute("href") or ""
            if product_url and product_url.startswith("/"):
                product_url = BASE_URL + product_url

            # 3. Product Image
            img_el = await item.query_selector("img[alt]:not([alt*='icon']):not([alt*='badge'])")
            if not img_el:
                img_el = await item.query_selector("img")
            image_url = ""
            if img_el:
                image_url = (
                    await img_el.get_attribute("src")
                    or await img_el.get_attribute("data-src")
                    or ""
                )
            if image_url and image_url.startswith("/"):
                image_url = BASE_URL + image_url

            # 4. Product Price
            price_el = await item.query_selector("[data-testid='product-price']")
            if not price_el:
                price_el = await item.query_selector(
                    "[class*='sale-price'], [class*='special-price'], [class*='current-price'], [class*='price']"
                )
            price_text = (await price_el.inner_text()).strip() if price_el else ""
            price = parse_price(price_text)

            # 5. Extract SKU from product URL or attributes if possible as fallback
            sku = None
            if product_url:
                # Lulu URLs often end with /p/SKU
                parts = product_url.split("/p/")
                if len(parts) > 1:
                    sku = parts[1].split("?")[0].split("/")[0]

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
            logger.warning(f"Lulu: Error parsing item: {e}")

    return products


async def click_next_page(page: Page, page_num: int) -> bool:
    """
    Click the next page button in the Lulu SPA pagination.
    Returns True if navigation succeeded and products loaded.
    """
    try:
        # Find anchor with href containing the next page number
        next_href = f"page={page_num + 1}"
        
        # Try Playwright's built-in click (handles React synthetic events properly)
        # Look for the link matching the next page number
        next_el = await page.query_selector(f"a[href*='{next_href}']")
        
        if not next_el:
            # Fallback: find via JS which anchor points to next page
            next_el_handle = await page.evaluate_handle(f"""() => {{
                return Array.from(document.querySelectorAll('a')).find(a =>
                    a.href && a.href.includes('{next_href}')
                );
            }}""")
            if next_el_handle:
                next_el = next_el_handle.as_element()

        if not next_el:
            logger.info(f"Lulu: No next page link found for page={page_num + 1}")
            return False

        prev_count = len(await page.query_selector_all("div.rounded-v2-xs.border"))
        await next_el.scroll_into_view_if_needed()
        await next_el.click()
        
        # Wait for new products to render
        try:
            await page.wait_for_function(
                f"""() => document.querySelectorAll('div.rounded-v2-xs.border').length > 0""",
                timeout=15000
            )
        except Exception:
            pass
        await asyncio.sleep(3)

        new_count = len(await page.query_selector_all("div.rounded-v2-xs.border"))
        logger.info(f"Lulu: Navigated to page {page_num + 1}, cards: {prev_count} -> {new_count}")
        return new_count > 0

    except Exception as e:
        logger.debug(f"Lulu: Error clicking next page: {e}")
        return False


async def scrape(headless: bool = True) -> list[dict]:
    """Main scraper entry point."""
    all_products = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)

        for page_num in range(1, 21):
            # Construct page URL
            if page_num == 1:
                url = START_URL
            else:
                url = f"https://gcc.luluhypermarket.com/en-qa/fresh-food-fruits-vegetables/?page={page_num}"

            logger.info(f"Lulu: Scraping page {page_num}: {url}")
            
            # Use a completely fresh context for each page to bypass SPA session/cookie rendering blocks
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 900},
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
            )
            
            page = await context.new_page()
            
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(5)  # Allow JS to fully render product cards

                products = await scrape_page(page)
                if not products:
                    logger.info(f"Lulu: No products found on page {page_num}. Ending scrape loop.")
                    await context.close()
                    break

                all_products.extend(products)
                logger.info(f"Lulu: Page {page_num} got {len(products)} products")

            except Exception as e:
                logger.error(f"Lulu: Error on page {page_num}: {e}")
                await context.close()
                break

            await context.close()

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
