# @himalaya-quant/ctrader-x

A TypeScript client for the [cTrader Open API](https://help.ctrader.com/open-api/messages). Strongly typed, with a clean abstraction over the underlying ProtoBuffer protocol.

```sh
npm i @himalaya-quant/ctrader-x
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [Connection Lifecycle](#connection-lifecycle)
- [Symbols](#symbols)
- [Live Bars](#live-bars)
- [Orders & Positions](#orders--positions)
- [Order Events](#order-events)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Design Behaviours](#design-behaviours)

---

## Quick Start

```ts
import { cTraderX } from '@himalaya-quant/ctrader-x';

const client = new cTraderX();

await client.connect();

const symbols = await client.symbols.getSymbolsList();
console.log(symbols);

client.disconnect();
```

---

## Configuration

All options are optional. When omitted, credentials are read from environment variables (see [Authentication](#authentication)).

```ts
const client = new cTraderX({
    live: false, // Connect to live API. Defaults to demo.
    clientId: '...',
    clientSecret: '...',
    accessToken: '...',
    ctidTraderAccountId: 123456,
    debug: false, // Enable verbose debug logs
    autoReconnect: true, // Auto-reconnect on server disconnection
    reconnectIntervalMs: 5000, // Wait 5s between reconnection attempts
    logger: customLogger, // Custom ILogger implementation
});
```

| Option                | Type      | Default  | Description                                                        |
| --------------------- | --------- | -------- | ------------------------------------------------------------------ |
| `live`                | `boolean` | `false`  | Connects to `live.ctraderapi.com` instead of `demo.ctraderapi.com` |
| `clientId`            | `string`  | env      | Spotware application client ID                                     |
| `clientSecret`        | `string`  | env      | Spotware application client secret                                 |
| `accessToken`         | `string`  | env      | OAuth access token                                                 |
| `ctidTraderAccountId` | `number`  | env      | The trader account ID to operate on                                |
| `debug`               | `boolean` | `false`  | Emits additional debug-level log entries                           |
| `autoReconnect`       | `boolean` | `true`   | Automatically reconnects if the connection is lost                 |
| `reconnectIntervalMs` | `number`  | `5000`   | Fixed wait time (ms) between reconnection attempts                 |
| `logger`              | `ILogger` | built-in | Custom logger (see [Logging](#logging))                            |

---

## Authentication

Credentials can be provided inline or via `.env`:

```env
CTRADERX_SPOTWARE_CLIENT_ID=
CTRADERX_SPOTWARE_CLIENT_SECRET=
CTRADERX_SPOTWARE_ACCESS_TOKEN=
CTRADERX_SPOTWARE_CTID_TRADER_ACCOUNT_ID=
```

`connect()` performs both application-level and account-level authentication automatically. There is no need to call any auth method manually.

---

## Connection Lifecycle

```ts
await client.connect(); // Opens TCP connection, authenticates app + account
client.disconnect(); // Closes the connection and disposes all listeners
```

**Calling `connect()` when already connected is a no-op** — it returns immediately without opening a second connection or re-authenticating.

**Calling `disconnect()` before `connect()`** is safe and has no effect.

**Auto-reconnect** is enabled by default. The client uses a dead man's switch that monitors server silence — if no message is received for 30 seconds (the server normally sends heartbeats every ~15 seconds), the connection is considered stale and a reconnect is triggered automatically. On reconnect failure (e.g. network still down), the client retries at a fixed interval (`reconnectIntervalMs`, default 5s) until the connection is restored. Set `autoReconnect: false` to disable this behaviour entirely.

**Calling `disconnect()` during a reconnect loop** stops the loop immediately. No further reconnection attempts are made.

> ⚠️ Accessing `client.orders`, `client.symbols`, or `client.symbolsUpdates` before calling `connect()` throws a `ClientNotConnectedError`.

---

## Symbols

Accessible via `client.symbols` after connecting.

### Get symbols list

Returns the full list of symbols available for the account, enriched with their details.

```ts
const symbols = await client.symbols.getSymbolsList();
// symbols[0].symbolId, symbols[0].symbolName, ...

// Include archived symbols
const all = await client.symbols.getSymbolsList({
    includeArchivedSymbols: true,
});
```

### Get symbol details

Fetches full detail records for one or more symbols by ID.

```ts
const details = await client.symbols.getSymbolsDetails([1, 10026]);
console.log(details.symbol[0].schedule);
```

### Get historical bars (OHLCV)

Returns an array of `OHLCV` tuples: `[timestamp, open, high, low, close, volume]`.

```ts
import { ProtoOATrendbarPeriod } from '@himalaya-quant/ctrader-x';

const bars = await client.symbols.getTrendBars({
    symbolId: 1,
    period: ProtoOATrendbarPeriod.M1,
    fromTimestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    toTimestamp: Date.now(),
});

// bars[0] → [timestamp, open, high, low, close, volume]
```

---

## Live Bars

Accessible via `client.symbolsUpdates` after connecting.

Streams real-time OHLCV updates for a given symbol and timeframe. Each emission updates the **current forming bar** — it is not a completed candle event, it is a live tick-level update.

```ts
import { tap } from 'rxjs';
import { ProtoOATrendbarPeriod } from '@himalaya-quant/ctrader-x';

client.symbolsUpdates
    .subscribeLiveTrendBars({
        symbolId: 10026, // BTCUSD
        period: ProtoOATrendbarPeriod.M1,
    })
    .pipe(
        tap(({ symbolId, ohlcv, period }) => {
            const [time, open, high, low, close, volume] = ohlcv;
            console.log(`[${period}] O:${open} H:${high} L:${low} C:${close}`);
        }),
    )
    .subscribe();
```

Each emission carries:

| Field      | Type                    | Description                                             |
| ---------- | ----------------------- | ------------------------------------------------------- |
| `symbolId` | `number`                | Symbol the update belongs to                            |
| `period`   | `ProtoOATrendbarPeriod` | The subscribed timeframe                                |
| `ohlcv`    | `OHLCV`                 | Current bar as `[time, open, high, low, close, volume]` |

### Multiple subscribers, same symbol

Calling `subscribeLiveTrendBars` multiple times with the same `symbolId` and `period` **replaces the previous subscriber** — the old observable is completed, and the new one takes over. To run two independent consumers on the same feed, `.pipe()` and `.subscribe()` on the returned observable from a single call.

### Unsubscribe

```ts
await client.symbolsUpdates.unsubscribeLiveTrendBars({
    symbolId: 10026,
    period: ProtoOATrendbarPeriod.M1,
});
```

The underlying API subscription is only removed when there are no remaining subscribers for that `symbolId`. Unsubscribing a period that still has other period-subscribers on the same symbol will not send an unsubscribe request to the server.

### Subscription persistence across reconnects

Active live bar subscriptions are restored automatically after a reconnect. No manual re-subscription is needed.

---

## Orders & Positions

Accessible via `client.orders` after connecting.

All order operations require that the access token has **trade** permissions on the account.

### Place a new order

Use `LotsUtil.lotsToVolume()` to convert standard lot sizes to the protocol's internal volume format.

```ts
import {
    ProtoOAOrderType,
    ProtoOATradeSide,
    LotsUtil,
} from '@himalaya-quant/ctrader-x';

await client.orders.newOrder({
    symbolId: 1,
    clientOrderId: 'my-order-001', // Your own reference ID
    orderType: ProtoOAOrderType.MARKET,
    tradeSide: ProtoOATradeSide.BUY,
    volume: LotsUtil.lotsToVolume(0.01), // 0.01 lots = 100,000 protocol units
});
```

`newOrder` resolves when the order is **accepted by the server**, not when it is filled. Subscribe to [order events](#order-events) to track execution.

### Close a position

```ts
await client.orders.closePosition({
    positionId: 123456789,
    volume: LotsUtil.lotsToVolume(0.01), // Can be partial
});
```

### Get open positions and pending orders

```ts
const { position, order } = await client.orders.getOpenPositions();
```

Returns all current open positions (`position[]`) and pending orders (`order[]`) for the account.

### Get unrealized PnL

```ts
const result = await client.orders.getPositionUnrealizedPnL();
```

### Cancel a pending order

```ts
await client.orders.cancelPendingOrder({ orderId: 987654321 });
```

### Modify a pending order

```ts
await client.orders.modifyPendingOrder({
    orderId: 987654321,
    volume: LotsUtil.lotsToVolume(0.02),
    limitPrice: 1.085,
});
```

### Volume conversion

`LotsUtil` converts between human-readable lot sizes and the cTrader protocol's internal volume unit:

```ts
LotsUtil.lotsToVolume(0.01); // → 100_000   (micro lot)
LotsUtil.lotsToVolume(0.1); // → 1_000_000  (mini lot)
LotsUtil.lotsToVolume(1); // → 10_000_000 (standard lot)

LotsUtil.volumeToLots(100_000); // → 0.01
```

---

## Order Events

Subscribe to a real-time stream of execution events for the account. The observable is hot and shared — all subscribers receive the same events.

```ts
import {
    OrderAcceptedEvent,
    OrderFilledEvent,
    OrderRejectedEvent,
    OrderCancelledEvent,
    OrderExpiredEvent,
    OrderErrorEvent,
} from '@himalaya-quant/ctrader-x';

client.orders.subscribeOrdersEvents().subscribe((event) => {
    if (event instanceof OrderFilledEvent) {
        console.log('Filled:', event.order.positionId, event.deal);
    }

    if (event instanceof OrderRejectedEvent) {
        console.log('Rejected:', event.order.orderId);
    }

    if (event instanceof OrderErrorEvent) {
        console.log('Error:', event.error.description);
    }
});
```

| Event class           | Trigger                                   |
| --------------------- | ----------------------------------------- |
| `OrderAcceptedEvent`  | Order received and accepted by the server |
| `OrderFilledEvent`    | Order fully executed                      |
| `OrderRejectedEvent`  | Order rejected by the server              |
| `OrderCancelledEvent` | Pending order cancelled                   |
| `OrderExpiredEvent`   | Pending order expired                     |
| `OrderErrorEvent`     | Protocol-level order error                |

All events (except `OrderErrorEvent`) carry `.order` (`ProtoOAOrder`) and optionally `.deal` (`ProtoOADeal`).

---

## Logging

The built-in logger writes to `console`. Debug logs are suppressed by default.

Enable debug output via environment variable:

```env
CTRADERX_DEBUG_LOGS=true
```

Or inject a custom logger at instantiation:

```ts
const client = new cTraderX({
    logger: {
        debug: (msg) => myLogger.debug(msg),
        log: (msg) => myLogger.info(msg),
        warn: (msg) => myLogger.warn(msg),
        error: (msg) => myLogger.error(msg),
    },
});
```

---

## Error Handling

Every manager method throws a typed error on failure. All error classes extend a common base and wrap the original server error.

```ts
import { OpenOrderError } from '@himalaya-quant/ctrader-x';

try {
    await client.orders.newOrder({ ... });
} catch (e) {
    if (e instanceof OpenOrderError) {
        // server rejected the order request
    }
}
```

| Error class                           | Thrown by                                   |
| ------------------------------------- | ------------------------------------------- |
| `ConnectionError`                     | `client.connect()`                          |
| `ClientNotConnectedError`             | Accessing any manager before `connect()`    |
| `OpenOrderError`                      | `orders.newOrder()`                         |
| `ClosePositionError`                  | `orders.closePosition()`                    |
| `CancelPendingOrderError`             | `orders.cancelPendingOrder()`               |
| `ModifyPendingOrderError`             | `orders.modifyPendingOrder()`               |
| `GetOpenPositionsError`               | `orders.getOpenPositions()`                 |
| `GetPositionUnrealizedPnLError`       | `orders.getPositionUnrealizedPnL()`         |
| `GetSymbolsListError`                 | `symbols.getSymbolsList()`                  |
| `GetSymbolsDetailsError`              | `symbols.getSymbolsDetails()`               |
| `GetTrendBarsError`                   | `symbols.getTrendBars()`                    |
| `SubscribeLiveTrendBarsInternalError` | `symbolsUpdates.subscribeLiveTrendBars()`   |
| `UnsubscribeLiveTrendBarsError`       | `symbolsUpdates.unsubscribeLiveTrendBars()` |

---

## Design Behaviours

The following are intentional behaviours, not bugs.

**`newOrder()` resolves before fill.** The promise resolves when the server acknowledges the request. Use `subscribeOrdersEvents()` and listen for `OrderFilledEvent` to react to execution.

**Live bars emit the forming candle, not closed candles.** Every `subscribeLiveTrendBars` emission is an update to the current open bar. There is no separate "candle closed" event — a new bar starting is implicit when the `ohlcv[0]` timestamp changes.

**`CLOSE` in live bars is the current tick price.** The cTrader protocol does not provide `deltaClose` on open bars. The close price in each emission is always the latest bid/ask midpoint, not a settled close.

**Duplicate `subscribeLiveTrendBars` calls replace the subscriber.** Calling the method again with the same `symbolId` and `period` completes the previous observable and returns a new one. This is by design to avoid silent fan-out and duplicate processing. If you need multiple consumers on the same stream, use RxJS `Subject` or `share()` on the observable yourself.

**`getSymbolsList()` is not a lightweight call.** Internally it fetches the symbol list and then enriches each entry with full symbol details in a second request. Avoid calling it in hot paths or on every reconnect.

**Order events are globally shared.** `subscribeOrdersEvents()` returns a reference to a single `Subject`. All `.subscribe()` calls on any instance share the same event stream. This means events are not scoped to a single `client` instance if you create more than one — all instances dispatch to the same subject.

**`autoReconnect` detects stale connections via a dead man's switch.** The underlying `ctrader-layer` monitors server silence at the socket level. If no message (including heartbeats) is received for 30 seconds, the connection is declared stale and a reconnect is triggered. This catches silent network drops — cases where the TCP connection dies without a FIN packet — which a pure heartbeat-based approach would miss.

**`autoReconnect` restores live bar subscriptions automatically.** On reconnect, all active `subscribeLiveTrendBars` subscriptions are re-established with the server without requiring any action from the caller.

**`disconnect()` is idempotent.** Calling it multiple times, or calling it on a client that was never successfully connected, does not throw.

## TODO:

- Remove **globally shared** events and bind them to the proper instance. At the moment this is done like so, to have a non disruptive
  reconnection behavior. Meaning that the alive subscriptions, won't be closed or terminated in case of an automatic reconnection event.
  To fix this debt, we need to move the static subscription form within the specific manager, on the main client. So that only the managers
  gets re instantiated, and the main client preserves any alive subscriptions, by passing the source back down to the re-spawned managers.

---

<p align="center">Developed with ❤️ by <a href="https://github.com/himalaya-quant">Caius Citiriga</a></p>
