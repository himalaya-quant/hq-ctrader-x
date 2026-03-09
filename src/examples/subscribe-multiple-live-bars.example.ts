import { tap } from 'rxjs';
import { cTraderX } from '../classes/client';
import { ProtoOATrendbarPeriod } from '../classes/managers/symbols/proto/models/ProtoOATrendbarPeriod';

// Subscribe live bars
(async () => {
    const client = new cTraderX();

    await client.connect();
    client.symbolsUpdates
        .subscribeLiveTrendBars({
            period: ProtoOATrendbarPeriod.M1,
            // symbolId: 1, // EURUSD
            symbolId: 10026, // BTCUSD
        })
        .pipe(tap((event) => console.log(`Sub 1: ${event}`)))
        .subscribe();

    client.symbolsUpdates
        .subscribeLiveTrendBars({
            period: ProtoOATrendbarPeriod.M5,
            // symbolId: 1, // EURUSD
            symbolId: 10026, // BTCUSD
        })
        .pipe(tap((event) => console.log(`Sub 2: ${event}`)))
        .subscribe();
})();
