# Dip-buyer for btc-race-24h-20261117-0603

A bot that trades cbBTC/USDC on 1-minute bars, long only, starting with
$1,000 paper USDC. It buys a confirmed dip and sells the reversion.

## Strategy

- **Entry:** the close is at least 100 bps below the rolling 60-bar high
  AND the last 3 bars are net up (bounce confirmation — never catch a
  knife mid-plunge). Full cash in, one position at a time.
- **Exit:** the whole position when the close is 150 bps above the entry
  close (take profit), 200 bps below it (stop-loss, downtrend insurance),
  or after 720 bars in the position.
- **Orders:** at most one per reply, slippage capped at 100 bps.

## Why this shape

On 1-minute cbBTC bars the reliable edge is mean reversion after a sharp
dip. Trend-following (EMA cross), RSI/Bollinger and plain momentum variants
all lost money on the dev window. The parameters sit in the middle of a
broad plateau (60-bar lookback, dip 90–100 bps, TP 125–200 bps all score
+18 to +31 on dev), not on a spike — the neighbouring best (TP 175,
+31.6) was rejected because its second trade's peak was +174 bps, a
knife's edge. The stop-loss never fired on dev; it is there for a
downtrend day on the unseen race window.

## Local grade (dev window, official grader, `--driver process`)

- Net PnL: **+25.222849 USDC** (2x-fee sensitivity still +22.77)
- Trades: 5, max drawdown: 0.72%, fees: 2.44 USDC
- Determinism: L1 reproduced (the two graded runs match byte for byte)

## Layout

- `main.ts` — the bot (erasable TypeScript, Node 22, stdlib only).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's SDK shim.
