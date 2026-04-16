import { cTraderX } from '../classes/client';

// Get trader deals
(async () => {
    const client = new cTraderX();

    await client.connect();
    const traderDeals = await client.trader.getTraderDeals({
        fromTimestamp: Date.now() - 10000000000,
        toTimestamp: Date.now(),
        maxRows: 100,
    });
    console.log(traderDeals);
    client.disconnect();
})();
