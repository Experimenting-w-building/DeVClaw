const { chromium } = require("playwright");

async function main() {
  const args = JSON.parse(process.env.BROWSER_ARGS || "{}");
  const { url, action = "extract_text", selector, waitMs = 3000 } = args;

  if (!url) {
    console.error(JSON.stringify({ error: "URL is required" }));
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(waitMs);

    let result;

    switch (action) {
      case "extract_text": {
        const body = selector
          ? await page.locator(selector).textContent()
          : await page.locator("body").innerText();

        // Sanitize: strip excessive whitespace, limit length
        const cleaned = (body || "")
          .replace(/\s+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
          .slice(0, 30000);

        result = { text: cleaned, url: page.url(), title: await page.title() };
        break;
      }

      case "extract_links": {
        const links = await page.locator("a[href]").evaluateAll((els) =>
          els
            .map((a) => ({ text: a.textContent?.trim(), href: a.href }))
            .filter((l) => l.href && !l.href.startsWith("javascript:"))
            .slice(0, 100)
        );
        result = { links, url: page.url(), title: await page.title() };
        break;
      }

      case "screenshot": {
        const buf = await page.screenshot({ fullPage: false });
        result = {
          screenshot: buf.toString("base64").slice(0, 50000),
          url: page.url(),
          title: await page.title(),
        };
        break;
      }

      default:
        result = { error: `Unknown action: ${action}` };
    }

    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
