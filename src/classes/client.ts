import { CTraderConnection } from '@himalaya-quant/ctrader-layer';
import { CTraderLayerEvent } from '@himalaya-quant/ctrader-layer/build/src/core/events/CTraderLayerEvent';

import { Config } from '../config/config';
import { ILogger, Logger } from './logger';
import { Sleep } from '../utils/sleep.utils';

import { ConnectionError } from './errors/connection.error';
import { ClientNotConnectedError } from './errors/client-not-connected.error';

import { cTraderXError } from './models/ctrader-x-error.model';
import { ICredentials } from './managers/models/credentials.model';
import { IConfiguration } from './models/client-configuration.model';

import {
    OrdersEventsDispatcher,
    OrdersManager,
} from './managers/orders/orders.manager';
import { SymbolsManager } from './managers/symbols/symbols.manager';
import {
    SubscriptionsManager,
    SymbolsUpdatesManager,
} from './managers/symbols/symbols-updates.manager';
import { AuthenticationManager } from './managers/authentication/authentication.manager';

import { ProtoOAClientDisconnectEvent } from '../models/proto/events/ProtoOAClientDisconnectEvent';
import { ProtoOAAccountDisconnectEvent } from '../models/proto/events/ProtoOAAccountDisconnectEvent';

export class cTraderX {
    private readonly port = 5035;
    private readonly host: string;
    private readonly debug: boolean;
    private readonly logger: ILogger;
    private readonly autoReconnect: boolean;
    private readonly credentials: ICredentials;
    private connection: CTraderConnection;

    private ordersManager: OrdersManager;
    private readonly ordersEventsDispatcher = new OrdersEventsDispatcher();

    private symbolsManager: SymbolsManager;
    private authManager: AuthenticationManager;

    private symbolsUpdatesManager: SymbolsUpdatesManager;
    private readonly subscriptionsManager = new SubscriptionsManager();

    private isConnected = false;
    private intentionalDisconnect = false;
    private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    private subscriptionsIds = new Map<string, string>();
    private readonly reconnectIntervalMs: number;

    constructor(config?: IConfiguration) {
        this.host = config?.live
            ? `live.ctraderapi.com`
            : `demo.ctraderapi.com`;

        this.debug = !!config?.debug;

        this.logger = config?.logger ?? new Logger();
        this.autoReconnect = config?.autoReconnect ?? true;
        this.reconnectIntervalMs = config?.reconnectIntervalMs ?? 5_000;

        this.credentials = {
            clientId: config?.clientId ?? Config.SPOTWARE_CLIENT_ID,
            accessToken: config?.accessToken ?? Config.SPOTWARE_ACCESS_TOKEN,
            clientSecret: config?.clientSecret ?? Config.SPOTWARE_CLIENT_SECRET,
            ctidTraderAccountId:
                config?.ctidTraderAccountId ??
                Config.SPOTWARE_CTID_TRADER_ACCOUNT_ID,
        };

        this.createConnection();
    }

    get orders() {
        this.ensureConnectedOrThrow();
        return this.ordersManager;
    }

    get symbols() {
        this.ensureConnectedOrThrow();
        return this.symbolsManager;
    }

    get symbolsUpdates() {
        this.ensureConnectedOrThrow();
        return this.symbolsUpdatesManager;
    }

    disconnect() {
        this.intentionalDisconnect = true;
        this.stopHeartbeat();
        this.dispose();
        // ordersManager is only initialized after a successful connect(),
        // so guard against calling dispose() on an undefined instance.
        this.ordersManager?.dispose();

        this.isConnected = false;
        this.connection?.close();
        this.connection = null;
    }

    async connect(): Promise<void> {
        if (this.isConnected) return;

        this.intentionalDisconnect = false;
        this.createConnection();
        this.subscribeDisconnectionEvents();
        this.initializeCoreManagers();

        try {
            await this.connection.open();
            await this.authManager.authenticateApp();
            await this.authManager.authenticateUser();

            await this.initializeSecondaryManagers();

            this.isConnected = true;

            this.scheduleHeartbeat();
        } catch (e) {
            const message = cTraderXError.getMessageError(e);
            this.logger.error(`Error opening connection: ${message}`);
            // Clean up the partially-opened connection so the next attempt
            // starts from a clean state.
            this.dispose();
            this.connection?.close();
            this.connection = null;
            throw new ConnectionError(message);
        }
    }

    private scheduleHeartbeat() {
        this.heartbeatTimer = setTimeout(() => {
            if (!this.isConnected) return;

            this.connection.sendHeartbeat();

            if (this.debug) {
                this.logger.debug(`Heartbeat event sent`);
            }

            this.scheduleHeartbeat();
        }, 1000 * 10);
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer !== null) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private ensureConnectedOrThrow() {
        if (!this.isConnected) throw new ClientNotConnectedError();
    }

    private createConnection() {
        this.connection = new CTraderConnection({
            host: this.host,
            port: this.port,
        });
    }

    private initializeCoreManagers() {
        this.authManager = new AuthenticationManager(
            this.credentials,
            this.connection,
            this.logger,
        );
    }

    private async initializeSecondaryManagers() {
        this.ordersManager = new OrdersManager(
            this.credentials,
            this.connection,
            this.logger,
            this.ordersEventsDispatcher,
        );

        this.symbolsManager = new SymbolsManager(
            this.credentials,
            this.connection,
            this.logger,
        );

        this.symbolsUpdatesManager = new SymbolsUpdatesManager(
            this.credentials,
            this.connection,
            this.logger,
            this.subscriptionsManager,
        );
    }

    private dispose() {
        // connection is set to null at the end of disconnect(), so guard
        // against a double-dispose or dispose after connection teardown.
        if (!this.connection) return;

        this.subscriptionsIds
            .values()
            .forEach((subscriptionId) =>
                this.connection.removeEventListener(subscriptionId),
            );
        this.subscriptionsIds.clear();
    }

    private subscribeDisconnectionEvents() {
        this.subscriptionsIds.set(
            'client_disconnect',
            this.connection.on(
                ProtoOAClientDisconnectEvent.name,
                (event: CTraderLayerEvent) =>
                    this.restartClient(
                        event.descriptor?.reason ??
                            'ProtoOAClientDisconnectEvent',
                    ).catch((e) =>
                        this.logger.error(
                            `Restart failed: ${cTraderXError.getMessageError(e)}`,
                        ),
                    ),
            ),
        );

        this.subscriptionsIds.set(
            'account_disconnect',
            this.connection.on(ProtoOAAccountDisconnectEvent.name, () =>
                this.restartClient('ProtoOAAccountDisconnectEvent').catch((e) =>
                    this.logger.error(
                        `Restart failed: ${cTraderXError.getMessageError(e)}`,
                    ),
                ),
            ),
        );

        // Socket closed cleanly (server-side FIN)
        this.subscriptionsIds.set(
            'socket_close',
            this.connection.on('close', () =>
                this.restartClient('Socket closed').catch((e) =>
                    this.logger.error(
                        `Restart failed: ${cTraderXError.getMessageError(e)}`,
                    ),
                ),
            ),
        );

        // Socket error (TLS error, network error, etc.)
        this.subscriptionsIds.set(
            'socket_error',
            this.connection.on('error', (event: CTraderLayerEvent) =>
                this.restartClient(
                    `Socket error: ${event.descriptor?.error?.message ?? 'unknown'}`,
                ).catch((e) =>
                    this.logger.error(
                        `Restart failed: ${cTraderXError.getMessageError(e)}`,
                    ),
                ),
            ),
        );

        // Dead man's switch fired — no message received for 30s.
        // restartClient calls disconnect() which already closes the socket.
        this.subscriptionsIds.set(
            'socket_stale',
            this.connection.on('stale', () =>
                this.restartClient(
                    'Connection stale: no message received for 30s',
                ).catch((e) =>
                    this.logger.error(
                        `Restart failed: ${cTraderXError.getMessageError(e)}`,
                    ),
                ),
            ),
        );
    }

    private async restartClient(reason: string) {
        // Guard: if already disconnected (e.g. two events fired in quick
        // succession) do not attempt a double reconnect.
        if (!this.isConnected) return;

        this.logger.warn(
            `Issuing automatic restart due to disconnection. Reason: ${reason}`,
        );

        this.disconnect();
        this.intentionalDisconnect = false;

        if (!this.autoReconnect) {
            this.logger.warn(`Auto reconnect is disabled, not reconnecting.`);
            return;
        }

        let attempt = 0;

        while (!this.isConnected && !this.intentionalDisconnect) {
            attempt++;
            this.logger.warn(
                `Reconnection attempt ${attempt}, waiting ${this.reconnectIntervalMs}ms...`,
            );

            await Sleep.ms(this.reconnectIntervalMs);

            try {
                await this.connect();
            } catch (e) {
                this.logger.error(
                    `Reconnection attempt ${attempt} failed: ${cTraderXError.getMessageError(e)}`,
                );
                // connect() throws but also leaves the connection in a clean
                // disconnected state, so the loop continues.
            }
        }

        this.logger.warn(
            `Reconnected successfully after ${attempt} attempt(s).`,
        );
    }
}
