import { chromium } from "playwright";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const S = process.env.S;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 1440, height: 1050 } });
const errs = [];
page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errs.push(`console: ${m.text()}`));

await page.goto(`${base}/login`);
await page.fill("#password", "devpassword");
await page.click("button[type=submit]");
await page.waitForURL(`${base}/`);
await page.goto(`${base}/wallet`);
await page.fill("input[type=password] >> nth=0", "a-very-strong-passphrase");
await page.fill("input[type=password] >> nth=1", "a-very-strong-passphrase");
await page.click('button:has-text("Create wallet")');
await page.waitForSelector("text=Public key");

await page.goto(`${base}/studio`);
await page.fill('input[type=password]', "a-very-strong-passphrase");
await page.click('button:has-text("Unlock")');
await page.waitForSelector("text=It cannot spend", { timeout: 15000 });
await page.click('button:has-text("Automation")');
await page.waitForSelector("text=Unattended runs", { timeout: 10000 });
console.log("automation tab renders OK");

// Arm must be blocked until a brief exists.
const armDisabled = await page.locator('button:has-text("Arm")').isDisabled();
console.log("arm disabled without a brief:", armDisabled);

await page.fill("textarea", "A daily memecoin about software absurdity.");
await page.waitForTimeout(200);
console.log("arm enabled with a brief:", !(await page.locator('button:has-text("Arm")').isDisabled()));

// Defaults must be conservative.
const vals = await page.locator('input[inputmode="numeric"], input[inputmode="decimal"]').evaluateAll(
  (els) => els.map((e) => e.value));
console.log("defaults interval/runs/sol:", vals.join(" / "));
console.log("live runs off by default:", !(await page.locator('input[type=checkbox]').first().isChecked()));

// Status line must reflect the gate.
const statusRow = await page.locator("text=Status").locator("xpath=../dd").innerText();
console.log("status before arming:", statusRow);

await page.click('button:has-text("Arm")');
await page.waitForTimeout(600);
console.log("armed tag shown:", (await page.locator("text=Armed").count()) > 0);

// A run with no API key must log a failure, not crash or spend.
await page.click('button:has-text("Run once now")');
await page.waitForTimeout(3000);
const logText = await page.locator("main").innerText();
console.log("failure logged, not silent:", /failed/i.test(logText));
const count = async () => JSON.parse(await page.evaluate(() => localStorage.getItem("launchpad.schedule.log.v1")) ?? "[]").length;
const before = await count();
await page.waitForTimeout(6000);
console.log(`no spin after a failure: ${before} -> ${await count()} entries over 6s`);
console.log("caps still 0 spent:", logText.includes("0.0000 /"));
await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/a1-automation.png`, fullPage: true });

// Config must survive a reload.
await page.reload();
await page.fill('input[type=password]', "a-very-strong-passphrase");
await page.click('button:has-text("Unlock")');
await page.click('button:has-text("Automation")');
await page.waitForSelector("text=Unattended runs");
console.log("config persisted across reload:", (await page.locator("textarea").inputValue()).startsWith("A daily memecoin"));

const real = errs.filter((e) => !/Failed to fetch|net::ERR|ERR_|fetch failed|429|403|401|501|Failed to load resource/i.test(e));
console.log("\nunexpected errors:", real.length ? real.slice(0, 4) : "none");
await b.close();
