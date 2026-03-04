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

import { OrdersManager } from './managers/orders/orders.manager';
import { SymbolsManager } from './managers/symbols/symbols.manager';
import { SymbolsUpdatesManager } from './managers/symbols/symbols-updates.manager';
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
    private symbolsManager: SymbolsManager;
    private authManager: AuthenticationManager;
    private symbolsUpdatesManager: SymbolsUpdatesManager;

    private isConnected = false;
    private lastServerHeartbeatTime: number = null;
    private subscriptionsIds = new Map<string, string>();

    constructor(config?: IConfiguration) {
        this.host = config?.live
            ? `live.ctraderapi.com`
            : `demo.ctraderapi.com`;

        this.debug = !!config?.debug;

        this.logger = config?.logger ?? new Logger();
        this.autoReconnect = config?.autoReconnect ?? true;

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

        this.createConnection();
        this.subscribeDisconnectionEvents();
        this.initializeCoreManagers();

        try {
            await this.connection.open();
            await this.authManager.authenticateApp();
            await this.authManager.authenticateUser();

            this.initializeSecondaryManagers();

            this.isConnected = true;

            this.sendHeartbeat();
        } catch (e) {
            const message = cTraderXError.getMessageError(e);
            this.logger.error(`Error opening connection: ${message}`);
            throw new ConnectionError(message);
        }
    }

    private sendHeartbeat() {
        if (!this.isConnected) return;

        if (this.lastServerHeartbeatTime !== null) {
            const maxServerSilenceTime = 60_000 * 5; // 5mins

            const lastServerHeartbeatSince =
                Date.now() - this.lastServerHeartbeatTime;

            const clientShouldBeRestarted =
                lastServerHeartbeatSince >= maxServerSilenceTime;

            if (clientShouldBeRestarted && this.autoReconnect) {
                this.lastServerHeartbeatTime = null;
                this.restartClient('Server silent for too long');
                return;
            } else if (clientShouldBeRestarted && !this.autoReconnect) {
                this.logger.warn(
                    `Detected abnormal server inactivity time, but auto reconnect is disabled`,
                );
            }
        }

        this.connection.sendHeartbeat();

        if (this.debug) {
            this.logger.debug(`Heartbeat event sent`);
        }

        setTimeout(() => {
            this.sendHeartbeat();
        }, 1000 * 5);
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
    }

    private subscribeDisconnectionEvents() {
        this.subscriptionsIds.set(
            'client_disconnect',
            this.connection.on(
                ProtoOAClientDisconnectEvent.name,
                this.restartClient.bind(this),
            ),
        );

        this.subscriptionsIds.set(
            'account_disconnect',
            this.connection.on(
                ProtoOAAccountDisconnectEvent.name,
                this.restartClient.bind(this),
            ),
        );

        this.subscriptionsIds.set(
            'server_heartbeat',
            this.connection.on(
                'ProtoHeartbeatEvent',
                () => (this.lastServerHeartbeatTime = Date.now()),
            ),
        );
    }

    private async restartClient(reason: string);
    private async restartClient(event: CTraderLayerEvent | string) {
        let reason: string;
        if (typeof event === 'string') {
            reason = event;
        } else {
            reason = event.descriptor.reason;
        }

        this.logger.warn(
            `Issuing automatic restart due to disconnection. ${reason}`,
        );

        this.disconnect();

        await Sleep.s(1);

        await this.connect();
    }
}
