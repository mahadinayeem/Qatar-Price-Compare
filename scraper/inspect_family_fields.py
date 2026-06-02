import asyncio
import logging
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inspect_fields")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("https://family.qa/en/products/8042?level=cat-level5", wait_until="domcontentloaded")
            await asyncio.sleep(5)
            
            # Run JS script to extract all text elements and details from the first card
            card_info = await page.evaluate("""() => {
                const card = document.querySelector("[class*='group/card']");
                if (!card) return null;
                
                const elements = [];
                card.querySelectorAll('*').forEach(el => {
                    if (el.children.length === 0 && el.textContent.trim()) {
                        elements.push({
                            tagName: el.tagName,
                            className: el.className,
                            text: el.textContent.trim()
                        });
                    }
                });
                return {
                    href: card.getAttribute('href'),
                    imgAlt: card.querySelector('img') ? card.querySelector('img').getAttribute('alt') : '',
                    imgSrc: card.querySelector('img') ? card.querySelector('img').getAttribute('src') : '',
                    elements: elements
                };
            }""")
            
            logger.info(f"Card Info: {card_info}")
        except Exception as e:
            logger.error(e)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
