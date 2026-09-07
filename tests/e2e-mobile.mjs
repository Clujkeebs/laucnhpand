import { chromium, devices } from "playwright";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const S = process.env.S;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ ...devices["iPhone 13"] });
const overflow = async (label) => {
  const m = await page.evaluate(() => ({
    s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  const bad = m.s > m.c + 1;
  console.log(`  ${label.padEnd(11)} scrollW=${m.s} clientW=${m.c} ${bad ? "OVERFLOW ⚠" : "ok"}`);
  return !bad;
};

await page.goto(`${base}/login`);
let allOk = await overflow("/login");
await page.fill("#password", "devpassword");
await page.click("button[type=submit]");
await page.waitForURL(`${base}/`);

await page.goto(`${base}/wallet`);
await page.waitForSelector('button:has-text("Create wallet")');
allOk = (await overflow("/wallet")) && allOk;
await page.fill("input[type=password] >> nth=0", "a-very-strong-passphrase");
await page.fill("input[type=password] >> nth=1", "a-very-strong-passphrase");
await page.click('button:has-text("Create wallet")');
await page.waitForSelector("text=Public key", { timeout: 15000 });
console.log("  wallet created by tapping on a phone: yes");
await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/m1-wallet.png`, fullPage: true });

for (const path of ["/", "/studio", "/free", "/liquidity", "/inspect", "/launch"]) {
  await page.goto(base + path);
  const pw = page.locator('input[type=password]');
  if (await pw.count()) { await pw.first().fill("a-very-strong-passphrase"); await page.click('button:has-text("Unlock")'); }
  await page.waitForTimeout(900);
  allOk = (await overflow(path)) && allOk;
}
await page.goto(`${base}/`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/m2-ledger.png`, fullPage: true });

// Network switch and sign-out must be reachable on a phone.
console.log("  network switch visible:", await page.locator('button:has-text("Test")').first().isVisible());
console.log("  sign out visible:", await page.locator('button:has-text("Sign out")').first().isVisible());
await b.close();
if (!allOk) {
  console.error("\nFAIL: horizontal overflow on at least one page");
  process.exit(1);
}
console.log("\nno horizontal overflow anywhere");
