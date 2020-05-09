const puppeteer = require("puppeteer-core");

const runner = async search => {
  let data = [];

  console.log("Opening browser");
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'google-chrome-stable',
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  async function cleanup() {
    try {
      console.log("Cleaning up instances");
      await page.close();
      await browser.close();
    } catch (e) {
      console.log("Cannot cleanup instances");
    }
  }

  try {
    console.log("Navigating url");
    await page.goto("https://duckduckgo.com/", { waitUntil: "networkidle2" });
    console.log("Typing text");
    await page.type("input#search_form_input_homepage", search, { delay: 50 });
    await page.click("#search_form_homepage_top .search__button");
    console.log("Wait for results");
    await page.waitForSelector(".results--main");
    await page.waitFor(750);
    data = await page.evaluate(() => {
      let data = [];
      for (let node of document.querySelectorAll("a.result__a")) {
        data.push(node.getAttribute('href'));
      }
      return data;
    });
    console.log("Extracted data: " + JSON.stringify(data));
    await cleanup();
  } catch (e) {
    console.log("Error happened", e);
    await page.screenshot({ path: "error.png" });
    await cleanup();
  }
  return data;
};

module.exports = runner;

(async () => {
  await runner('hello world');
})();