import { chromium } from "playwright";

const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

const shot = async (name) => page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/${name}.png`, fullPage: true });

// 1. Login
await page.goto(`${base}/login`);
await shot("01-login");
await page.fill("#password", "devpassword");
await page.click('button[type=submit]');
await page.waitForURL(`${base}/`, { timeout: 15000 });
console.log("login -> dashboard OK");
await shot("02-dashboard-no-wallet");

// 2. Create a wallet in-browser (WebCrypto path, no network)
await page.goto(`${base}/wallet`);
await page.fill('input[type=password] >> nth=0', "a-very-strong-passphrase");
await page.fill('input[type=password] >> nth=1', "a-very-strong-passphrase");
await page.click('button:has-text("Create wallet")');
await page.waitForSelector('text=Public key', { timeout: 20000 });
const pubkey = await page.locator("button[title=Copy]").first().innerText();
console.log("wallet created:", pubkey.trim());
await shot("03-wallet");

// 3. Confirm the stored keystore is actually encrypted
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("launchpad.keystore.v1")));
console.log("keystore keys:", Object.keys(stored).join(","));
console.log("has plaintext secretKey field:", "secretKey" in stored);

// 4. Lock, then verify signing pages gate correctly
await page.click('button:has-text("Lock")');
await page.goto(`${base}/launch`);
await page.waitForSelector("text=Wallet locked", { timeout: 10000 });
console.log("launch page gated when locked OK");
await shot("04-launch-locked");

// 5. Unlock and render the launch form
await page.fill('input[type=password]', "a-very-strong-passphrase");
await page.click('button:has-text("Unlock")');
await page.waitForSelector("text=Revoke mint authority", { timeout: 15000 });
console.log("launch form renders OK");
await shot("05-launch-form");

// 6. Client-side validation should stop an empty submit
await page.click('button:has-text("Launch token")');
await page.waitForSelector("text=Name is required", { timeout: 10000 });
console.log("validation blocks empty launch OK");

// 7. A full reload must drop the in-memory key and re-lock
await page.goto(`${base}/liquidity`);
await page.waitForSelector("text=Wallet locked", { timeout: 10000 });
console.log("reload re-locks the wallet OK");
await page.fill('input[type=password]', "a-very-strong-passphrase");
await page.click('button:has-text("Unlock")');
await page.waitForSelector("text=Create pool", { timeout: 15000 });
await shot("06-liquidity");
console.log("/liquidity renders OK");

await page.goto(`${base}/inspect`);
await page.waitForSelector('input[placeholder="Paste any SPL mint address"]', { timeout: 15000 });
await shot("07-inspect");
console.log("/inspect renders OK");

// 8. Inspect rejects a bad address without touching the network
await page.fill("input", "not-a-real-mint");
await page.click('button:has-text("Check")');
await page.waitForSelector("text=isn't a valid mint address", { timeout: 10000 });
console.log("inspect rejects invalid mint OK");

const real = errors.filter((e) => !/Failed to fetch|net::ERR|ERR_|fetch failed|429|403/i.test(e));
console.log("\nunexpected errors:", real.length ? real : "none");
await browser.close();
