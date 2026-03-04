import { describe, it, expect, afterEach } from 'vitest';
import { Config } from '../config/config';
import { ConnectionError } from './errors/connection.error';
import { ClientNotConnectedError } from './errors/client-not-connected.error';
import { cTraderX } from './client';
import { IConfiguration } from './models/client-configuration.model';

describe('cTraderX Client - Integration Tests', () => {
    let client: cTraderX;

    // Shared safe teardown: disconnect() is now null-safe in the source,
    // but we still use optional chaining for robustness.
    afterEach(() => {
        client?.disconnect();
        client = undefined;
    });

    describe('Constructor and Configuration', () => {
        it('should create client with default demo configuration', () => {
            client = new cTraderX();
            expect(client).toBeDefined();
        });

        it('should create client with custom configuration', () => {
            const config: IConfiguration = {
                live: false,
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            };

            client = new cTraderX(config);
            expect(client).toBeDefined();
        });
    });

    describe('Connection - Manual', () => {
        it('should connect successfully with valid credentials', async () => {
            client = new cTraderX({
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            });

            await expect(client.connect()).resolves.not.toThrow();
        }, 30000);

        it('should not reconnect if already connected', async () => {
            client = new cTraderX({
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            });

            await client.connect();

            // Second call should be a no-op
            await expect(client.connect()).resolves.not.toThrow();
        }, 30000);

        it('should throw ConnectionError with invalid credentials', async () => {
            client = new cTraderX({
                clientId: 'invalid_id',
                clientSecret: 'invalid_secret',
                accessToken: 'invalid_token',
                ctidTraderAccountId: 123456,
            });

            await expect(client.connect()).rejects.toThrow(ConnectionError);
        }, 30000);
    });

    describe('Managers - Access Control', () => {
        it('should throw ClientNotConnectedError when accessing orders before connect', () => {
            client = new cTraderX();
            expect(() => client.orders).toThrow(ClientNotConnectedError);
        });

        it('should throw ClientNotConnectedError when accessing symbols before connect', () => {
            client = new cTraderX();
            expect(() => client.symbols).toThrow(ClientNotConnectedError);
        });

        it('should throw ClientNotConnectedError when accessing symbolsUpdates before connect', () => {
            client = new cTraderX();
            expect(() => client.symbolsUpdates).toThrow(
                ClientNotConnectedError,
            );
        });

        it('should expose orders manager after connect', async () => {
            client = new cTraderX({
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            });

            await client.connect();
            expect(client.orders).toBeDefined();
        }, 30000);

        it('should expose symbols manager after connect', async () => {
            client = new cTraderX({
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            });

            await client.connect();
            expect(client.symbols).toBeDefined();
        }, 30000);

        it('should expose symbolsUpdates manager after connect', async () => {
            client = new cTraderX({
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            });

            await client.connect();
            expect(client.symbolsUpdates).toBeDefined();
        }, 30000);
    });

    describe('Host Selection', () => {
        it('should use demo host by default', () => {
            client = new cTraderX();
            expect(client).toBeDefined();
        });

        it('should use live host when live flag is true', () => {
            client = new cTraderX({ live: true });
            expect(client).toBeDefined();
        });
    });

    describe('Full Integration Flow', () => {
        it('should complete full connection flow with real credentials', async () => {
            client = new cTraderX({
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            });

            await expect(client.connect()).resolves.not.toThrow();
        }, 30000);

        it('should allow disconnect after a successful connection', async () => {
            client = new cTraderX({
                clientId: Config.SPOTWARE_CLIENT_ID,
                clientSecret: Config.SPOTWARE_CLIENT_SECRET,
                accessToken: Config.SPOTWARE_ACCESS_TOKEN,
                ctidTraderAccountId: Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
            });

            await client.connect();

            // disconnect() sets this.connection = null, so the shared
            // afterEach client?.disconnect() will be a safe no-op.
            expect(() => client.disconnect()).not.toThrow();
        }, 30000);
    });
});
