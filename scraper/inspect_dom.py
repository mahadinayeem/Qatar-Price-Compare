import asyncio
import logging
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inspect_dom")

async def inspect_rawabi():
    logger.info("=== Inspecting Rawabi ===")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("https://rawabihypermarket.com/fruit-and-vegetables/3/749/0/0", wait_until="domcontentloaded")
            await asyncio.sleep(4)
            items = await page.query_selector_all(".product-card")
            logger.info(f"Rawabi: Found {len(items)} .product-card elements")
            if items:
                html = await items[0].inner_html()
                logger.info(f"First item HTML:\n{html[:1500]}")
        except Exception as e:
            logger.error(e)
        await browser.close()

async def inspect_lulu():
    logger.info("=== Inspecting Lulu ===")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("https://gcc.luluhypermarket.com/en-qa/fresh-food-fruits-vegetables/", wait_until="domcontentloaded")
            await asyncio.sleep(4)
            
            # Let's inspect divs that contain text 'QAR'
            elements = await page.evaluate("""() => {
                const results = [];
                document.querySelectorAll('*').forEach(el => {
                    if (el.textContent && el.textContent.includes('QAR') && el.children.length === 0) {
                        // Find parent elements
                        let parent = el.parentElement;
                        let depth = 0;
                        while (parent && depth < 3) {
                            if (parent.textContent.includes('QAR') && parent.textContent.length < 200) {
                                results.push({
                                    tagName: parent.tagName,
                                    className: parent.className,
                                    text: parent.textContent.trim().replace(/\\s+/g, ' '),
                                    html: parent.outerHTML.slice(0, 400)
                                });
                                break;
                            }
                            parent = parent.parentElement;
                            depth++;
                        }
                    }
                });
                return results.slice(0, 10);
            }""")
            for idx, el in enumerate(elements):
                logger.info(f"Match {idx}: Tag={el['tagName']} Class={el['className']}\nText={el['text']}\nHTML={el['html']}\n")
        except Exception as e:
            logger.error(e)
        await browser.close()

async def inspect_family():
    logger.info("=== Inspecting Family ===")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("https://family.qa/en/products/8042?level=cat-level5", wait_until="domcontentloaded")
            await asyncio.sleep(4)
            # Find the element with group/card class
            items = await page.query_selector_all("[class*='group/card']")
            logger.info(f"Family: Found {len(items)} group/card elements")
            if items:
                html = await items[0].inner_html()
                logger.info(f"First item HTML:\n{html[:1500]}")
            else:
                # Find elements containing 'QAR' and see parents
                elements = await page.evaluate("""() => {
                    const results = [];
                    document.querySelectorAll('*').forEach(el => {
                        if (el.textContent && el.textContent.includes('QAR') && el.children.length === 0) {
                            let parent = el.parentElement;
                            let depth = 0;
                            while (parent && depth < 4) {
                                if (parent.textContent.includes('QAR') && parent.textContent.length < 300) {
                                    results.push({
                                        tagName: parent.tagName,
                                        className: parent.className,
                                        text: parent.textContent.trim().replace(/\\s+/g, ' '),
                                        html: parent.outerHTML.slice(0, 500)
                                    });
                                    break;
                                }
                                parent = parent.parentElement;
                                depth++;
                            }
                        }
                    });
                    return results.slice(0, 10);
                }""")
                for idx, el in enumerate(elements):
                    logger.info(f"Match {idx}: Tag={el['tagName']} Class={el['className']}\nText={el['text']}\nHTML={el['html']}\n")
        except Exception as e:
            logger.error(e)
        await browser.close()

async def main():
    await inspect_rawabi()
    await inspect_lulu()
    await inspect_family()

if __name__ == "__main__":
    asyncio.run(main())
