// Dip-buyer for the BTC 24h race (cbBTC/USDC, 1-minute bars, long only).
//
// Strategy: buy a confirmed dip, sell the reversion.
//   - Entry: the close is at least DIP_BPS below the rolling HIGH_BARS-bar high
//     AND the last 3 bars are net up (the dip has stopped falling — a bounce
//     confirmation, so we do not catch a knife mid-plunge). Full cash in.
//   - Exit: the whole position when the close is TP_BPS above the entry close,
//     or SL_BPS below it (downtrend insurance), or after MAX_HOLD_BARS bars.
//   - One position at a time; at most one order per reply.
//
// Why this shape: on 1-minute cbBTC bars the reliable edge is mean reversion
// after a sharp dip (trend-following and RSI/Bollinger variants all lost on
// the dev window). The parameters sit in the middle of a broad plateau
// (W 45–60, dip 90–100, TP 125–200 all score +18 to +31 on dev), not on a
// spike: the neighbouring best (TP 175, +31.6) was rejected because its
// second trade's peak was +174 bps — a knife's edge. A 150 bp target leaves
// headroom on the trades that matter. The stop-loss never fired on dev;
// it is there for a downtrend day on the unseen race window.
//
// All decisions are exact bigint comparisons on closes the harness has sent:
// no floats, no clock, no randomness, no environment — the run is fully
// deterministic.

import { runBars, type BarsState, type Batch, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Rolling-high lookback, in bars. */
const HIGH_BARS = 60;
/** Entry: close at least this far below the rolling high, in bps. */
const DIP_BPS = 100n;
/** Exit: take profit this far above the entry close, in bps. */
const TP_BPS = 150n;
/** Exit: stop loss this far below the entry close, in bps. */
const SL_BPS = 200n;
/** Exit: give up after this many bars in the position. */
const MAX_HOLD_BARS = 720;
/** Bounce confirmation: the close must be above the close 3 bars ago. */
const BOUNCE_BARS = 3;
/** Slippage cap on every order, in bps (1% past the decision close). */
const MAX_SLIPPAGE_BPS = 100;

const BPS = 10_000n;

/** Closes seen so far, oldest first (one per batch, in order). */
const closes: bigint[] = [];
/** The entry close of the open position (the close of the batch the buy was decided on). */
let entryClose: bigint | null = null;
/** The batch seq the buy was decided on. */
let entrySeq = 0;

function rollingHigh(): bigint {
  let high = closes[closes.length - 1];
  const from = closes.length > HIGH_BARS ? closes.length - HIGH_BARS : 0;
  for (let i = from; i < closes.length; i++) {
    if (closes[i] > high) high = closes[i];
  }
  return high;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);
    const k = closes.length - 1;
    const held = state.positions.get(SYMBOL);

    if (held !== undefined) {
      // Holding: exit on take-profit, stop-loss, or max hold.
      if (entryClose === null) {
        // A fill we did not record (defensive; cannot happen on a clean run):
        // anchor the entry at the first close seen while holding.
        entryClose = close;
        entrySeq = batch.seq;
      }
      const atTp = close * BPS >= entryClose * (BPS + TP_BPS);
      const atSl = close * BPS <= entryClose * (BPS - SL_BPS);
      const tooLong = batch.seq - entrySeq >= MAX_HOLD_BARS;
      if (atTp || atSl || tooLong) {
        entryClose = null;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // Flat: enter on a confirmed dip.
    entryClose = null;
    if (closes.length <= HIGH_BARS || k < BOUNCE_BARS) return [];
    const high = rollingHigh();
    const dipped = close * BPS <= high * (BPS - DIP_BPS);
    const bouncing = close > closes[k - BOUNCE_BARS];
    if (!dipped || !bouncing) return [];
    const cash = state.cash;
    if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryClose = close;
    entrySeq = batch.seq;
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy];
  },
});
