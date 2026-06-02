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
            "[class*='group/card'], [class*='product'], .item, .card, [data-product]",
            timeout=15000
        )
    except Exception:
        logger.warning("Family: Timeout waiting for products selector")

    # Try multiple selector strategies
    selectors = [
        "[class*='group/card']",
        ".product-item",
        ".product-card",
        "[class*='ProductCard']",
        "[class*='product-item']",
        ".item",
    ]

    items = []
    for sel in selectors:
        items = await page.query_selector_all(sel)
        if items:
            logger.info(f"Family: Using selector '{sel}', found {len(items)} items")
            break

    for item in items:
        try:
            name_el = await item.query_selector(
                "[class*='name'], [class*='title'], h2, h3, p.name"
            )
            full_name = (await name_el.inner_text()).strip() if name_el else ""
            if not full_name:
                # Fallback to image alt text
                img_el = await item.query_selector("img")
                if img_el:
                    full_name = (await img_el.get_attribute("alt") or "").strip()

            price_el = await item.query_selector(
                "[class*='price'], .price, span[class*='Price']"
            )
            price_text = (await price_el.inner_text()).strip() if price_el else ""
            price = parse_price(price_text)

            if price is None:
                # Concatenate all span text contents that are part of price (e.g. QAR, 53, .00)
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
            logger.warning(f"Family: Error parsing item: {e}")

    return products


async def handle_pagination(page: Page) -> bool:
    """
    Click 'Load More' or go to next page.
    Returns True if more content was loaded.
    """
    try:
        # Try Load More button first
        load_more_selectors = [
            "button[class*='load-more']",
            "button[class*='LoadMore']",
            "[class*='load-more'] button",
            "button:has-text('Load More')",
            "button:has-text('Show More')",
        ]
        
        for selector in load_more_selectors:
            try:
                load_more = await page.query_selector(selector)
                if load_more:
                    is_visible = await load_more.is_visible()
                    is_enabled = await load_more.is_enabled()
                    if is_visible and is_enabled:
                        await load_more.click()
                        await asyncio.sleep(2)
                        return True
            except:
                pass

        # Try next page link
        next_selectors = [
            "a[rel='next']",
            ".pagination .next:not(.disabled) a",
            "[class*='next']:not([disabled]) a",
            "a:has-text('Next')",
        ]
        
        for selector in next_selectors:
            try:
                next_btn = await page.query_selector(selector)
                if next_btn:
                    await next_btn.click()
                    await page.wait_for_load_state("domcontentloaded")
                    await asyncio.sleep(2)
                    return True
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
            await asyncio.sleep(3)

            page_num = 1
            seen_count = 0

            while True:
                products = await scrape_page(page)
                new_products = products[seen_count:]
                all_products.extend(new_products)
                logger.info(f"Family: Page {page_num} got {len(new_products)} new products")
                seen_count = len(products)

                has_more = await handle_pagination(page)
                if not has_more or page_num >= 20:
                    break
                page_num += 1

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
