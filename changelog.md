# 0.0.23

- Fixed internal subscriptions management and racing conditions when concurrent
  subscriptions on the same symbol are fired at the same time.

# 0.0.22

- Updated cTraderLayer
- Removes patches around heart beat silence detection, now cTraderLayer handles it internally
- Listens to new connection events (error, close, stale, etc), and issues automatic restarts preserving existing subscriptions, and re subscribing them when successfully reconnected.
- Automatic reconnection system with 5s delay between attempts

# 0.0.21

- Readme update
- Tests update
- Minor bug fixes

# 0.0.20

Exposes lots utils

# 0.0.19

Exposes readonly deal on orders events

# 0.0.18

Adds deal to orders events

# 0.0.17

Swaps @reiryoku/c-trader layer with forked and updated HimalayaQuant version:

- updates protobuf messages to last published ones

Introduces PositionsManager responsible for:

- orders creation
- positions closing
- modify pending order
- cancel pending order
- get open positions and pending orders
- orders events streaming (including errors)

Introduces server inactivity monitoring system, auto reconnection, and possibility
to opt out via configuration

# 0.0.16

- Fixed check on subscription by expecting a non NaN value set.

# 0.0.15

- Remove debug log

# 0.0.14

- Re subscribing live updates on reconnection, preserving original subscriptions
  without any interruption

# 0.0.13

- Destroying connection on disconnect and recreating it on connect. In the attempt
  to recover the client in case of a TIMEOUT error

# 0.0.12

- Marking isDisconnected when disconnect is called

# 0.0.11

- Logging success attempt in case of already subscribed

# 0.0.10

- Added debug mode to log details
- Lowered heartbeat from 9s to 5s

# 0.0.9

- Updated tsconfig
- Exposed models and Proto types

# 0.0.8

- Updated readme

# 0.0.7

- Improved the way subscribeLiveTrendBars builds the bars. Now relying mainly on
  the updates found inside the `trendbar` array of the `ProtoOASpotEvent`.

# 0.0.6

- Fix heartbeat
- Changed return type of getTrendBars to OHLCV for convenience of consumer's use
- Changed return type of subscribeLiveTrendBars to OHLCV, symbolId and period for convenience of consumer's use
- Improved subscribeLiveTrendBars internal workings by tracking subscriptions
- Adding unsubscribeLiveTrendBars support

# 0.0.5

Adds subscribeToLiveTrendBars:
Gives the ability to subscribe to live price data, given a timeframe and a
symbolId. Returns an RxJs Observable the can be subscribed to and receive
realtime updates. Still missing unsubscribe feature.

# 0.0.4

Casting symbolsIds to strings and assigning missing ctidTraderAccountId to
ProtoOASymbolByIdReq request payload

# 0.0.3

Now the getSymbolsList will return the full symbols properties lists.
This is achieved by internally calling the `getSymbolsDetails` method, after we
receive the `ProtoOALightSymbol` array, and merging the results of the
`ProtoOALightSymbol` and the `ProtoOASymbol`.

# 0.0.2

Adds symbols manager, responsible for:

- getting symbols list

Better code organization.

# 0.0.1

Basic authentication. Based on:
CTID_TRADER_ACCOUNT_ID
ACCESS_TOKEN
CLIENT_SECRET
CLIENT_ID
