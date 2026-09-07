# Launchpad

A private, single-user Solana token launcher. Creates SPL tokens with metadata,
seeds Raydium liquidity, and tracks what you've launched. Runs on Vercel.

The wallet is generated in your browser and encrypted with a passphrase you
choose. The secret key is never sent to the server, and there is no database —
this app has no account system because it has exactly one user.

## What it does

| | |
|---|---|
| **Wallet** | Generate or import a Solana keypair. Encrypted at rest (AES-256-GCM, PBKDF2-SHA256, 600k iterations). Export to Phantom any time. Auto-locks after 15 minutes idle and on every page reload. |
| **Launch** | Create an SPL mint, upload image + metadata to IPFS, mint the full supply to yourself, and optionally revoke the mint and freeze authorities in the same flow. |
| **Liquidity** | Create a Raydium CPMM pool against SOL. Permanently lock LP so the liquidity can't be withdrawn. |
| **Inspect** | Point at any mint and read its authorities, supply and top-holder concentration straight from the chain. |
| **Dashboard** | Balances, USD portfolio value via Jupiter, and every token you've launched from this browser. |

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

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · `@solana/web3.js` ·
`@solana/spl-token` · Metaplex Umi + `mpl-token-metadata` ·
`@raydium-io/raydium-sdk-v2` · Jupiter price API

## Layout

```
src/
  app/
    page.tsx           dashboard
    launch/            token creation
    liquidity/         pool creation + LP locking
    inspect/           mint + holder analysis
    wallet/            key management
    login/             password gate
    api/
      auth/            session cookie issue + clear
      market/          Jupiter price + token metadata proxy
      upload/          IPFS pinning for image + metadata JSON
  components/          Shell, WalletGate, UI primitives
  lib/
    keystore.ts        browser-side encryption
    wallet.tsx         wallet context, auto-lock
    token.ts           mint creation, metadata, authority revocation
    pool.ts            Raydium CPMM
    portfolio.ts       balances, valuation, holder concentration
    amount.ts          decimal <-> base unit conversion
    auth.ts            HMAC session tokens
  middleware.ts        route gate
tests/                 unit tests + Playwright walkthrough
```
