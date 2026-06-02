import asyncio
import logging
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inspect_family")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("https://family.qa/en/products/8042?level=cat-level5", wait_until="domcontentloaded")
            await asyncio.sleep(5)
            
            # Find group/card elements
            items = await page.query_selector_all("[class*='group/card']")
            logger.info(f"Family: Found {len(items)} items")
            
            if items:
                # Let's inspect the first item
                item = items[0]
                outer_html = await item.evaluate("el => el.outerHTML")
                logger.info(f"Container HTML:\n{outer_html[:3000]}")
                
        except Exception as e:
            logger.error(e)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
