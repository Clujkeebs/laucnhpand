# Launchpad

A private, single-user Solana token launcher. Creates SPL tokens with metadata,
seeds Raydium liquidity, and tracks what you've launched. Runs on Vercel.

The wallet is generated in your browser and encrypted with a passphrase you
choose. The secret key is never sent to the server, and there is no database —
this app has no account system because it has exactly one user.

## What it does

| | |
|---|---|
| **Recovery** | Closes empty token accounts and returns the rent locked in them. The one screen that produces SOL instead of spending it. |
| **Ledger** | Balances, USD portfolio value via Jupiter, and every token you've issued from this browser. |
| **Studio** | Work through a token with the assistant, then have it draft one. It calls tools to model pools and fee earnings, and proposes launches you confirm. |
| **Curve** | Issue against a Raydium LaunchLab bonding curve — no pool to fund, so the outlay is account rent. Buyers trade the curve, your share of the trade fee accrues to a vault, and you claim it. Migrates to a real pool when it raises its target. |
| **Issue** | Create an SPL mint, upload image + metadata to IPFS, mint the full supply to yourself, and revoke the mint and freeze authorities in the same flow. |
| **Market** | Create a Raydium CPMM pool against SOL. Permanently lock LP so the liquidity can't be withdrawn. |
| **Examine** | Point at any mint and read its authorities, supply and holder concentration straight from the chain. Any token can be used as a *configuration* template for a new issuance. |
| **Bridge** | Move value between Solana and Ethereum through Wormhole Connect. |
| **Custody** | Generate or import a Solana keypair. Encrypted at rest (AES-256-GCM, PBKDF2-SHA256, 600k iterations). Export to Phantom any time. Auto-locks after 15 minutes idle and on every page reload. |

### The studio agent

The assistant in the studio has tools and runs a real agent loop. Read-only and
arithmetic tools — modelling a pool, projecting fee earnings — execute on the
server inside the loop. Anything that spends money does not.

**It cannot sign anything.** Your key is decrypted only in your browser, so the
loop physically cannot move value: when the model decides a token is worth
making it calls `propose_launch`, which stops the loop and hands a draft to the
browser. You see the name, ticker, supply, generated artwork and its reasoning,
and nothing happens until you press confirm — at which point *your* browser
signs it. The outcome is fed back so the conversation continues, and the token
appears on your ledger.

That split is deliberate. An agent that could sign would be one prompt injection
away from spending your wallet.

The same refusals apply here as everywhere else in the app: it will not propose
a token that imitates an existing one, help disguise who controls a token, plan
a liquidity pull, or claim a token will go up.

### Getting off zero

Every SPL token account you have ever used locks about 0.002 SOL as rent. When
the balance hits zero the account stays open and that rent stays locked, so a
wallet with any trading history is usually sitting on real SOL it cannot see.
The recovery panel on the ledger scans for those accounts, shows the total net
of transaction fees, and closes them in batches.

Accounts still holding tokens are never touched — closing one burns what is in
it — and the reclaim path refuses outright if a non-empty account reaches it.

This matters because there is no zero-cost path onto Solana: the chain charges
rent for every account, so opening even a bonding-curve launch costs roughly
0.02-0.03 SOL. Recovery is the only way the app can hand you SOL rather than
ask for it.

### Automation

The studio has an automation tab: give it a standing brief and an interval, and
it drafts and launches on its own. It ships disarmed, devnet-only, one run a
day, 0.1 SOL a day, and live runs need a separate explicit toggle. Every
attempt — launched, skipped or failed — lands in an audit log with what it
spent, and skipped or failed runs never count against the caps.

**It only runs while the tab is open.** There is no server-side cron, because a
scheduled job on the server would need your private key sitting in an
environment variable. That is a trade this app does not make.

Be clear-eyed about the arithmetic before arming it: each launch costs rent
whether or not anyone ever trades the token, and mass-produced tokens
overwhelmingly are not traded. A daily run for a month is roughly 0.6 SOL out
against fees earned only on volume you do not have yet. The caps exist because
this is exactly the shape of spend that runs away quietly.

### Launching without capital

The curve desk is the honest version of "launch for free and earn from it".
You are not funding a pool, so you spend only account rent. A disclosed trade
fee is taken on every buy and sell against the curve, and the creator's share
accrues to a vault you claim from. The rate is on chain — every buyer can read
it before they trade — so the earnings come from trading volume rather than
from anyone being misled.

The page reads the live rates and does the arithmetic for you, because the
arithmetic is the whole story: **your fee is a fixed cut of volume, with no
leverage in it.** At a 0.1% creator share, earning 0.1 SOL takes roughly 100 SOL
of trading through your curve; 1 SOL takes about 1,000. A curve nobody trades
pays exactly nothing. That is not a flaw in the mechanism, it is the mechanism —
and it is why the app spends more effort on making a token worth trading than on
the launch button.

### The assistant

Two things on the issuance form, both optional:

**Names** come from Claude (`claude-opus-5`) — three candidates with symbol and
description, from a one-line brief. Needs `ANTHROPIC_API_KEY`; without it the
panel says so and the rest of the form works normally. The model is instructed
never to propose a name that imitates an existing token or implies the token
will gain value, and to ignore a brief that asks it to.

**Artwork** is generated locally — four styles, deterministic from the token's
name, rendered to PNG in the browser. No API key, no network call, no cost, and
the same name always produces the same mark. It goes straight into the metadata
upload.

### The projection

Before you create a pool, the market page plots what that pool will actually do:
the price curve every buyer walks up, the price move a 1 SOL buy causes, the SOL
needed to double the price, and the share of supply you are actually putting in.

All of it comes from the two reserve amounts alone — no market data, no oracle —
so it works before the token has ever traded. It is also where thin liquidity
becomes obvious: 800M tokens against 5 SOL means a single 1 SOL buy moves the
price 44%, and the first seller moves it back just as hard.

### The report

Every issuance is graded live as you compose it, and any existing mint can be
graded from the Examine desk. The report scores the things anyone evaluating
your token can check for themselves — mint authority, freeze authority,
metadata completeness, public presence, holder concentration — and states in
plain language what each one signals.

It does not predict whether a token will sell. Nothing can. It tells you what
a buyer sees when they look, which is the part you control. Keeping both
authorities drops a launch from the mid-80s to the high-20s and stamps it
`HOSTILE`, because that is exactly how a scanner will read it.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in APP_PASSWORD and AUTH_SECRET
npm run dev
```

`AUTH_SECRET` should be random — `openssl rand -hex 32`.

### Deploying to Vercel

```bash
npx vercel
```

Set `APP_PASSWORD` and `AUTH_SECRET` in the Vercel project's environment
variables. Add `NEXT_PUBLIC_MAINNET_RPC` before you use mainnet for anything
real (see below). `PINATA_JWT` is optional — without it the launch form still
works, but you'll need to host the metadata JSON yourself and paste its URL.

### Tests

```bash
npm test        # amount math, keystore encryption, session auth
npm run typecheck
npm run test:e2e   # Playwright walkthrough against a running server
```

## Before you spend real SOL

**Use devnet first.** The network toggle is in the sidebar. Devnet SOL is free
from the faucet on the wallet page and worthless everywhere. Run a complete
launch there — mint, metadata, pool, lock — before you touch mainnet. Every
mistake you're going to make is cheaper to make on devnet.

**Get a real RPC endpoint.** The public `api.mainnet-beta.solana.com` endpoint
is aggressively rate-limited and *will* drop requests partway through a
multi-transaction launch, leaving you with a half-created token and spent SOL.
Helius, QuickNode and Triton all have free tiers that are fine for this.

**There is no free launch.** Solana charges rent for every account you create,
and the app shows you the real number before you sign:

- mint account: ~0.0015 SOL
- metadata account: ~0.0056 SOL
- your token account: ~0.002 SOL
- transaction fees: ~0.00003 SOL

That's under 0.01 SOL to create a token. What actually costs money is
liquidity: a pool with 5 SOL in it needs 5 SOL, and that SOL is real, spendable,
and no longer yours to freely take back.

**Back up your key immediately.** The wallet lives in one browser profile's
localStorage. Clearing site data, using a different browser, or a different
device means it's gone. Export the secret key from the wallet page and store it
offline the moment you create it. There is no password reset and no recovery —
nobody, including you, can decrypt that keystore without the passphrase.

## Why the authority toggles default to on

Two fields on every SPL mint are public, and every token scanner reads them:

- **Mint authority** — if set, whoever holds it can create unlimited new supply
  at any time, diluting everyone who bought.
- **Freeze authority** — if set, whoever holds it can freeze any holder's token
  account, making it impossible for them to sell. This is the standard honeypot
  construction.

Revoking both is permanent and it is the baseline expectation for a token
anyone will take seriously. If you leave either in place, assume people will
notice within minutes and price it in. The launch form warns you rather than
blocking you, because there are legitimate reasons to keep mint authority (a
token with a planned emissions schedule, for instance) — but "I'll revoke it
later" is not one, and buyers know it.

The same logic applies to liquidity. A pool whose LP is locked or burned can't
be drained; a pool whose LP sits in the creator's wallet can be emptied at any
moment, and that's the single most common way these things end. The Inspect
page exists so you can check this on other people's tokens, and so you know
what people will see when they check yours.

## What this app deliberately doesn't do

It doesn't create tokens across multiple wallets to simulate demand, it doesn't
generate lookalikes of existing tokens, and it doesn't automate withdrawing
liquidity out from under buyers. Those aren't missing features — bundling,
impersonation, and rug pulls are how people end up as defendants, and the
tooling for them is not something this repo will grow.

## Design

Set like a printed prospectus rather than a dashboard: paper and ink, hairline
rules, no floating cards or drop shadows, section plates numbered down the
page. Display type is Instrument Serif, running text is Archivo, and every
number, address and label is JetBrains Mono so figures line up in columns.

All three faces are self-hosted from `public/fonts` (107 KB total, latin
subsets only) — the app makes no external font requests. Paper and dark themes
are both first-class; the toggle sits under the wordmark and the choice is
remembered, with a pre-paint script so the page never flashes the wrong ground.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · self-hosted webfonts ·
`@solana/web3.js` ·
`@solana/spl-token` · Metaplex Umi + `mpl-token-metadata` ·
`@raydium-io/raydium-sdk-v2` · Jupiter price API · `@anthropic-ai/sdk` ·
`@wormhole-foundation/wormhole-connect`

## Layout

```
src/
  app/
    page.tsx           ledger
    free/              bonding-curve issuance + fee claiming
    studio/            agent chat
    launch/            issuance
    liquidity/         pool creation + LP locking
    inspect/           examination desk
    bridge/            Wormhole transfer
    wallet/            custody
    login/             password gate
    api/
      auth/            session cookie issue + clear
      ai/agent/        studio agent loop (tools, client-confirmed actions)
      ai/concept/      naming assistant (Claude)
      market/          Jupiter price + token metadata proxy
      upload/          IPFS pinning for image + metadata JSON
  components/          Shell, WalletGate, ReportSheet, Chart, Assist,
                       PoolPreview, BridgeWidget, Logo, UI primitives
  lib/
    keystore.ts        browser-side encryption
    wallet.tsx         wallet context, auto-lock
    token.ts           mint creation, metadata, authority revocation
    pool.ts            Raydium CPMM
    portfolio.ts       balances, valuation, holder concentration
    amount.ts          decimal <-> base unit conversion
    amm.ts             constant-product pool math
    agent-tools.ts     tool definitions + server-side executors
    fees.ts            creator fee economics (pure)
    reclaim.ts         closing empty accounts on chain
    rent.ts            rent-recovery arithmetic and safety rules (pure)
    scheduler.ts       automation config, caps, audit log
    launchpad.ts       Raydium LaunchLab bonding curve
    report.ts          token grading, planned and observed
    tokenart.ts        procedural artwork generator
    theme.tsx          paper/dark switching
    auth.ts            HMAC session tokens
  middleware.ts        route gate
tests/                 unit tests + Playwright walkthrough
```
