import asyncio
import logging
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inspect_lulu")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("https://gcc.luluhypermarket.com/en-qa/fresh-food-fruits-vegetables/", wait_until="domcontentloaded")
            await asyncio.sleep(5)
            
            # Find data-testid="product-price"
            prices = await page.query_selector_all("[data-testid='product-price']")
            logger.info(f"Lulu: Found {len(prices)} product-price elements")
            
            if prices:
                # Traverse up to find a container
                price_el = prices[0]
                parent = await price_el.evaluate_handle("""el => {
                    let p = el;
                    for (let i = 0; i < 8; i++) {
                        if (p.parentElement) {
                            p = p.parentElement;
                            if (p.querySelector('img') && p.querySelector('a') && p.textContent.length < 1000) {
                                return p;
                            }
                        }
                    }
                    return el.parentElement;
                }""")
                
                tag_name = await parent.evaluate("el => el.tagName")
                class_name = await parent.evaluate("el => el.className")
                outer_html = await parent.evaluate("el => el.outerHTML")
                
                logger.info(f"Found container: Tag={tag_name} Class={class_name}")
                logger.info(f"Container HTML:\n{outer_html[:1500]}")
                
        except Exception as e:
            logger.error(e)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
