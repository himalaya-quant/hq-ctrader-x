import { cTraderX } from '../classes/client';

// Get trader
(async () => {
    const client = new cTraderX();

    await client.connect();
    const trader = await client.trader.getTrader();
    console.log(trader);
    client.disconnect();
})();
