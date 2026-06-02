import asyncio
import logging
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("debug_scraper")

async def debug_site(name, url):
    logger.info(f"=== Debugging {name}: {url} ===")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(5)
            
            # Print page title
            title = await page.title()
            logger.info(f"Title: {title}")
            
            # Get some HTML snippets or selector match counts
            # Let's count some standard element types
            div_count = await page.locator("div").count()
            logger.info(f"Number of divs: {div_count}")
            
            # Find elements with product class names
            all_classes = await page.evaluate("""() => {
                const classes = new Set();
                document.querySelectorAll('*').forEach(el => {
                    if (el.className && typeof el.className === 'string') {
                        el.className.split(/\\s+/).forEach(c => {
                            if (c.toLowerCase().includes('product') || c.toLowerCase().includes('price') || c.toLowerCase().includes('item') || c.toLowerCase().includes('card')) {
                                classes.add(c);
                            }
                        });
                    }
                });
                return Array.from(classes).slice(0, 50);
            }""")
            logger.info(f"Matching classes: {all_classes}")
            
            # Take a screenshot to visualize
            screenshot_path = f"debug_{name.lower().replace(' ', '_')}.png"
            await page.screenshot(path=screenshot_path)
            logger.info(f"Saved screenshot to {screenshot_path}")
            
            # Dump first 2000 chars of HTML body
            body_text = await page.locator("body").inner_text()
            logger.info(f"Body text preview: {body_text[:1000]}")
            
        except Exception as e:
            logger.error(f"Error debugging {name}: {e}")
        finally:
            await browser.close()

async def main():
    await debug_site("Rawabi", "https://rawabihypermarket.com/fruit-and-vegetables/3/749/0/0")
    await debug_site("Lulu", "https://gcc.luluhypermarket.com/en-qa/fresh-food-fruits-vegetables/")
    await debug_site("Family", "https://family.qa/en/products/8042?level=cat-level5")

if __name__ == "__main__":
    asyncio.run(main())
