"""
Family Food Centre scraper
URL: https://family.qa/en/products/8042?level=cat-level5
"""

import asyncio
import logging
from playwright.async_api import async_playwright, Page, BrowserContext

from utils import parse_price
from database import save_product

logger = logging.getLogger(__name__)

COMPANY = "Family Food Centre"
BASE_URL = "https://family.qa"
START_URL = "https://family.qa/en/products/8042?level=cat-level5"
CATEGORY = "Fruits & Vegetables"


async def scrape_page(page: Page) -> list[dict]:
    """Extract all products from the current page."""
    products = []

    try:
        await page.wait_for_selector(
            "[class*='group/card']",
            timeout=15000
        )
    except Exception:
        logger.warning("Family: Timeout waiting for products selector")

    items = await page.query_selector_all("[class*='group/card']")
    logger.info(f"Family: Using selector '[class*=group/card]', found {len(items)} items")

    for item in items:
        try:
            # Product name from h3
            name_el = await item.query_selector("h3")
            full_name = (await name_el.inner_text()).strip() if name_el else ""
            if not full_name:
                img_el = await item.query_selector("img")
                if img_el:
                    full_name = (await img_el.get_attribute("alt") or "").strip()

            # Price from the inline-flex whitespace-nowrap span (contains QAR + int + decimal)
            price_el = await item.query_selector("span.inline-flex.items-baseline, span[class*='whitespace-nowrap']")
            price_text = ""
            if price_el:
                price_text = (await price_el.inner_text()).strip().replace("\n", " ")
            price = parse_price(price_text)

            if price is None:
                # Fallback: gather QAR + number spans from the card
                spans = await item.query_selector_all("span")
                price_parts = []
                for s in spans:
                    text = (await s.inner_text()).strip()
                    if text == "QAR" or any(c.isdigit() for c in text) or text.startswith("."):
                        price_parts.append(text)
                if price_parts:
                    price = parse_price(" ".join(price_parts))

            img_el = await item.query_selector("img")
            image_url = await img_el.get_attribute("src") if img_el else ""
            if image_url and image_url.startswith("/"):
                image_url = BASE_URL + image_url

            # Item itself is an 'a' tag in Family F.C., but handle inner 'a' as fallback
            product_url = await item.get_attribute("href")
            if not product_url:
                link_el = await item.query_selector("a")
                product_url = await link_el.get_attribute("href") if link_el else ""
            if product_url and product_url.startswith("/"):
                product_url = BASE_URL + product_url

            # SKU extraction
            sku = None
            if product_url:
                # Family URLs often have the ID at the end: /products/ID
                parts = product_url.strip("/").split("/")
                if "products" in parts:
                    idx = parts.index("products")
                    if idx + 1 < len(parts):
                        sku = parts[idx + 1].split("?")[0]

            if not full_name:
                continue

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
            logger.warning(f"Family: Error parsing item: {e}")

    return products


async def click_view_more_buttons(page: Page):
    """
    Click all 'View More' sub-category expand buttons to show hidden items in the sidebar.
    These expand sub-category product lists (not main product list).
    """
    while True:
        view_more_btns = await page.query_selector_all("button:has-text('View More')")
        clicked = 0
        for btn in view_more_btns:
            try:
                if await btn.is_visible() and await btn.is_enabled():
                    await btn.click()
                    await asyncio.sleep(0.5)
                    clicked += 1
            except:
                pass
        if clicked == 0:
            break
    logger.info("Family: All 'View More' sub-category buttons expanded")


async def handle_pagination(page: Page) -> bool:
    """
    Click 'Load More' to load next batch of products.
    Returns True if more content was loaded.
    """
    try:
        # Try Load More button - text-based selectors
        load_more_selectors = [
            "button:has-text('Load More')",
            "button:has-text('Show More')",
            "button[class*='load-more']",
            "button[class*='LoadMore']",
            "[class*='load-more'] button",
        ]
        
        for selector in load_more_selectors:
            try:
                load_more = await page.query_selector(selector)
                if load_more:
                    is_visible = await load_more.is_visible()
                    is_enabled = await load_more.is_enabled()
                    if is_visible and is_enabled:
                        prev_count = len(await page.query_selector_all("[class*='group/card']"))
                        await load_more.click()
                        await asyncio.sleep(2.5)
                        new_count = len(await page.query_selector_all("[class*='group/card']"))
                        if new_count > prev_count:
                            logger.info(f"Family: Load More clicked, {prev_count} -> {new_count} items")
                            return True
                        else:
                            logger.info("Family: Load More clicked but no new items, stopping")
                            return False
            except:
                pass

    except Exception as e:
        logger.debug(f"Family: Pagination check: {e}")

    return False


async def scrape(headless: bool = True) -> list[dict]:
    """Main scraper entry point."""
    all_products = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        context: BrowserContext = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        logger.info(f"Family: Loading {START_URL}")
        try:
            await page.goto(START_URL, wait_until="domcontentloaded", timeout=30000)
            # Wait for the initial product cards to render, indicating the page JS is running
            try:
                await page.wait_for_selector("[class*='group/card']", timeout=20000)
            except Exception:
                logger.warning("Family: Timeout waiting for initial product cards to render")
            await asyncio.sleep(2)

            # Exhaust all Load More clicks to get all products
            load_count = 0
            while True:
                has_more = await handle_pagination(page)
                if not has_more or load_count >= 30:  # Safety limit
                    break
                load_count += 1

            logger.info(f"Family: Finished loading, clicked Load More {load_count} times")
            all_products = await scrape_page(page)

        except Exception as e:
            logger.error(f"Family: Scrape error: {e}")

        await browser.close()

    logger.info(f"Family: Total scraped {len(all_products)} products")
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
            logger.error(f"Family: Failed to save {p.get('product_name')}: {e}")
            failed += 1
    logger.info(f"Family: Saved={saved} Failed={failed}")


if __name__ == "__main__":
    from utils import setup_logging
    setup_logging()
    asyncio.run(run())
