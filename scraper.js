const playwright = require('playwright');
const axios = require('axios');

async function scrape(properties, context) {
    const goToUrl = "https://aicado.ai";

    let htmlResponse = null;
    let errorResponse = null;
    let browser = null;

    const controller = new AbortController(); // Timeout için kontrol mekanizması
    const timeoutMs = 90000;

    async function run() {
        const AUTH = 'brd-customer-hl_09c58e44-zone-scraping_browser1:y4lmaoq62yae';
        const SBR_CDP = `wss://${AUTH}@brd.superproxy.io:9222`;

        try {
            console.log('Connecting to Scraping Browser...');
            browser = await playwright.chromium.connectOverCDP(SBR_CDP);
            console.log('Connected! Navigating...');

            const page = await browser.newPage();
            await page.goto(goToUrl, { timeout: 120000, signal: controller.signal });

            console.log('Scraping page content...');
            htmlResponse = await page.content();

            console.log('Closing browser...');
            await browser.close();
        } catch (error) {
            if (controller.signal.aborted) {
                console.error("Timeout occurred. Aborting...");
                errorResponse = "Timeout exceeded";
            } else {
                console.error("Scraping error:", error);
                errorResponse = error.toString();
            }
        }
    }

    return Promise.race([
        new Promise(async (resolve) => {
            setImmediate(async () => {
                await run();
                const result = htmlResponse
                    ? { returnedData: htmlResponse, error: false, errorMessage: null }
                    : { error: true, errorMessage: errorResponse };

                // API'ye POST isteği gönder
                try {
                    await axios.post('https://run.aicado.ai/version-test/api/1.1/wf/bright-data-script', result, {
                        headers: {
                            'Authorization': 'Bearer c942006ad488e67d09ea868c44cbf242',
                            'Content-Type': 'application/json'
                        }
                    });
                    console.log('Data sent to API successfully');
                } catch (apiError) {
                    console.error('Error sending data to API:', apiError);
                }

                resolve(result);
            });
        }),
        new Promise((resolve) => {
            setTimeout(() => {
                console.log("Timeout reached, aborting...");
                controller.abort(); // Playwright'i durdur
                if (browser) {
                    browser.close().catch(() => {}); // Hata olursa yoksay
                }
                const timeoutResult = { error: true, errorMessage: "timeout" };

                // Timeout durumunda da API'ye POST isteği gönder
                axios.post('https://run.aicado.ai/version-test/api/1.1/wf/bright-data-script', timeoutResult, {
                    headers: {
                        'Authorization': 'Bearer c942006ad488e67d09ea868c44cbf242',
                        'Content-Type': 'application/json'
                    }
                }).then(() => {
                    console.log('Timeout data sent to API successfully');
                }).catch(apiError => {
                    console.error('Error sending timeout data to API:', apiError);
                });

                resolve(timeoutResult);
            }, timeoutMs);
        })
    ]);
}
