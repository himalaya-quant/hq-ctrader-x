import { CTraderConnection } from '@himalaya-quant/ctrader-layer';
import { ILogger } from '../../logger';
import { BaseManager } from '../models/base.manager';
import { ICredentials } from '../models/credentials.model';
import { ProtoOASubscribeLiveTrendbarReq } from './proto/messages/ProtoOASubscribeLiveTrendbarReq';
import { Subject, of } from 'rxjs';
import { ProtoOASubscribeSpotsReq } from './proto/messages/ProtoOASubscribeSpotsReq';
import { ProtoOASubscribeSpotsRes } from './proto/messages/ProtoOASubscribeSpotsRes';
import { SubscribeSpotEventsError } from './errors/subscribe-spot-events.error';
import { ProtoOASubscribeLiveTrendbarRes } from './proto/messages/ProtoOASubscribeLiveTrendbarRes';
import { SubscribeLiveTrendBarsInternalError } from './errors/subscribe-live-trend-bars.error';
import { ProtoOASpotEvent } from './proto/models/ProtoOASpotEvent';
import { CTraderLayerEvent } from '@himalaya-quant/ctrader-layer/build/src/core/events/CTraderLayerEvent';
import { OHLCV, OHLCVPositions } from '../../../models/common/ohlcv';
import { Price } from '../../../utils/price.utils';
import { ProtoOATrendbarPeriod } from './proto/models/ProtoOATrendbarPeriod';
import { ProtoOAUnsubscribeLiveTrendbarReq } from './proto/messages/ProtoOAUnsubscribeLiveTrendbarReq';
import { cTraderXError } from '../../models/ctrader-x-error.model';
import { UnsubscribeLiveTrendBarsError } from './errors/unsubscribe-live-trend-bars.error';
import { Sleep } from '../../../utils/sleep.utils';

export interface ISubscribeBarsOptions extends ProtoOASubscribeLiveTrendbarReq {}
export interface IUnsubscribeBarsOptions extends ProtoOAUnsubscribeLiveTrendbarReq {}

export interface SubscribeLiveTrendBarsEvent {
    symbolId: number;
    ohlcv: OHLCV;
    lastBarTime: number;
    isInitialized: boolean;
    period: ProtoOATrendbarPeriod;
}

export interface ILiveBarsSubscriber {
    period: number;
    lastBar: OHLCV | null;
    isInitialized: boolean;
    lastBarTime: number | null;
    subscriber: Subject<unknown>;
}

export interface ILiveBarsSubscribers {
    symbolId: number;
    subscribers: ILiveBarsSubscriber[];
}

/**
 * Static subscription registry that survives SymbolsUpdatesManager
 * re-instantiation across reconnects. When a new manager is created after
 * a reconnect, it reads this map and re-subscribes to the server on behalf
 * of the existing consumer Subjects (which are still alive on the consumer side).
 */
export class SubscriptionsManager {
    readonly liveBarsSubscriptions = new Map<number, ILiveBarsSubscribers>();
}

export class SymbolsUpdatesManager extends BaseManager {
    constructor(
        protected readonly credentials: ICredentials,
        protected readonly connection: CTraderConnection,
        protected readonly logger: ILogger,
        protected readonly subscriptionsManager: SubscriptionsManager,
    ) {
        super();

        // Restore subscriptions that survived a reconnect
        for (const [symbolId, { subscribers }] of this.subscriptionsManager
            .liveBarsSubscriptions) {
            this.subscribeSpotEvents({ symbolId: +symbolId });

            for (const { period } of subscribers) {
                this.logger.debug(
                    `Restoring ${symbolId}:${period} subscription`,
                );
                this.subscribeLiveTrendBarsInternal({
                    period,
                    symbolId: +symbolId,
                });
            }
        }

        this.connection.on(ProtoOASpotEvent.name, (event) => {
            const symbolId = +event.descriptor.symbolId;
            const symbolSubs =
                this.subscriptionsManager.liveBarsSubscriptions.get(+symbolId);
            if (!symbolSubs) return;

            symbolSubs.subscribers.forEach((sub, i) => {
                const update = this.spotEventDescriptorToSubscribeLiveBarsEvent(
                    event,
                    sub.period,
                    sub.lastBar,
                    sub.lastBarTime,
                    sub.isInitialized,
                );
                if (!update) return;

                symbolSubs.subscribers[i].isInitialized = update.isInitialized;
                symbolSubs.subscribers[i].lastBar = update.ohlcv;
                symbolSubs.subscribers[i].lastBarTime = update.lastBarTime;

                sub.subscriber.next({
                    ohlcv: update.ohlcv,
                    period: update.period,
                    symbolId: +update.symbolId,
                });
            });
        });

        this.processPendingSubscriptionsRequests();
    }

    async unsubscribeLiveTrendBars(opts: IUnsubscribeBarsOptions) {
        this.removeSubscribeLiveTrendBarsSubscription(
            +opts.symbolId,
            opts.period,
        );

        const symbolSubs = this.subscriptionsManager.liveBarsSubscriptions.get(
            +opts.symbolId,
        );
        if (!symbolSubs || !symbolSubs.subscribers.length) {
            this.logCallAttempt(this.unsubscribeLiveTrendBars, opts);

            const payload: ProtoOAUnsubscribeLiveTrendbarReq = {
                ...opts,
                ctidTraderAccountId: this.credentials.ctidTraderAccountId,
            };

            try {
                await this.connection.sendCommand(
                    ProtoOAUnsubscribeLiveTrendbarReq.name,
                    payload,
                );
            } catch (e) {
                throw this.handleCTraderCallError(
                    e,
                    this.unsubscribeLiveTrendBars,
                    new UnsubscribeLiveTrendBarsError(e),
                );
            }
            this.logCallAttemptSuccess(this.unsubscribeLiveTrendBars, opts);
        }
    }

    private readonly pendingSubscriptionRequests: (ISubscribeBarsOptions & {
        subject: Subject<Omit<SubscribeLiveTrendBarsEvent, 'lastBarTime'>>;
    })[] = [];

    private async processPendingSubscriptionsRequests() {
        while (true) {
            const subscriptionRequest =
                this.pendingSubscriptionRequests.shift();
            if (!subscriptionRequest) {
                await Sleep.ms(100);
                continue;
            }

            const {
                period,
                symbolId,
                ctidTraderAccountId,
                payloadType,
                subject,
            } = subscriptionRequest;

            this.addSubscribeLiveTrendBarsSubscription(+symbolId, {
                lastBar: null,
                lastBarTime: null,
                period,
                subscriber: subject,
                isInitialized: false,
            });

            this.logger.debug(
                `Processing [${symbolId}:${period}] subscription request`,
            );

            await this.subscribeSpotEvents({
                symbolId: +symbolId,
                ctidTraderAccountId: this.credentials.ctidTraderAccountId,
            });
            await this.subscribeLiveTrendBarsInternal({
                period,
                symbolId: +symbolId,
                payloadType,
                ctidTraderAccountId,
            });
            await Sleep.ms(500);
        }
    }

    subscribeLiveTrendBars(opts: ISubscribeBarsOptions) {
        const subject = new Subject<
            Omit<SubscribeLiveTrendBarsEvent, 'lastBarTime'>
        >();
        this.pendingSubscriptionRequests.push({ ...opts, subject });
        return subject;
    }

    private spotEventDescriptorToSubscribeLiveBarsEvent(
        event: CTraderLayerEvent,
        period: ProtoOATrendbarPeriod,
        lastBar: OHLCV | null,
        lastBarTime: number | null,
        isInitialized: boolean,
    ): SubscribeLiveTrendBarsEvent | null {
        let lastBarClone = structuredClone(lastBar);
        let lastBarTimeClone = structuredClone(lastBarTime);

        // Calculate current price from bid/ask (used only for CLOSE)
        const price = Price.getPrice(
            +event.descriptor.bid,
            +event.descriptor.ask,
        );
        if (price === null) return null;

        // Find the trendbar for our subscribed period
        const trendbar = event.descriptor.trendbar?.find(
            (tb) => tb.period === ProtoOATrendbarPeriod[period],
        );

        // If no trendbar for our period, skip this event
        if (!trendbar) {
            return null;
        }

        // Extract bar timestamp from trendbar (source of truth)
        const barTimestamp = trendbar.utcTimestampInMinutes * 60000;

        // Convert trendbar prices
        const LOW = trendbar.low / 100000;
        const OPEN = this.normalizePrice(LOW, trendbar.deltaOpen);
        const HIGH = this.normalizePrice(LOW, trendbar.deltaHigh);
        const VOLUME = trendbar.volume;

        // ============================================================================
        // SCENARIO 1: First event OR new bar detected
        // ============================================================================
        if (!lastBarTimeClone || barTimestamp !== lastBarTimeClone) {
            lastBarClone = [barTimestamp, OPEN, HIGH, LOW, price, VOLUME];
            lastBarTimeClone = barTimestamp;
            isInitialized = true;

            return {
                isInitialized,
                period,
                ohlcv: lastBarClone,
                lastBarTime: barTimestamp,
                symbolId: +event.descriptor.symbolId,
            };
        }

        // ============================================================================
        // SCENARIO 2: Same bar - update from trendbar + current price
        // ============================================================================
        // WHY use trendbar values: The server continuously updates HIGH/LOW/VOLUME
        // as the bar develops. We trust the server's calculations.
        //
        // WHY use price for CLOSE: deltaClose is null until bar closes, so CLOSE
        // is always the current tick price.
        if (!lastBarClone) {
            lastBarClone = [barTimestamp, OPEN, HIGH, LOW, price, VOLUME];
        } else {
            lastBarClone[OHLCVPositions.OPEN] = OPEN;
            lastBarClone[OHLCVPositions.HIGH] = HIGH;
            lastBarClone[OHLCVPositions.LOW] = LOW;
            lastBarClone[OHLCVPositions.CLOSE] = price;
            lastBarClone[OHLCVPositions.VOLUME] = VOLUME;
        }

        return {
            isInitialized,
            period,
            ohlcv: lastBarClone,
            lastBarTime: barTimestamp,
            symbolId: +event.descriptor.symbolId,
        };
    }

    private normalizePrice(low: number, priceDelta: number) {
        return low + (priceDelta || 0) / 100000;
    }

    private removeSubscribeLiveTrendBarsSubscription(
        symbolId: number,
        period: ProtoOATrendbarPeriod | '*',
    ) {
        const symbolSubs =
            this.subscriptionsManager.liveBarsSubscriptions.get(+symbolId);
        if (!symbolSubs) return;

        symbolSubs.subscribers = symbolSubs.subscribers.filter((s) => {
            if (period === '*' || s.period === period) {
                s.subscriber.complete();
                return false;
            }
            return true;
        });

        if (symbolSubs.subscribers.length === 0) {
            this.subscriptionsManager.liveBarsSubscriptions.delete(+symbolId);
        }
    }

    private addSubscribeLiveTrendBarsSubscription(
        symbolId: number,
        subscriber: ILiveBarsSubscriber,
    ) {
        const existing =
            this.subscriptionsManager.liveBarsSubscriptions.get(+symbolId);

        if (!existing) {
            this.subscriptionsManager.liveBarsSubscriptions.set(+symbolId, {
                symbolId: +symbolId,
                subscribers: [subscriber],
            });
            return;
        }

        const existingIdx = existing.subscribers.findIndex(
            ({ period }) => period === subscriber.period,
        );

        if (existingIdx !== -1) {
            const existingSub = existing.subscribers[existingIdx];
            this.logger.warn(
                `[Symbol: ${symbolId} Period: ${subscriber.period}] Completing previous subscriber subscription in favor of new subscriber`,
            );
            existingSub.subscriber.complete();
            existing.subscribers[existingIdx] = subscriber;
        } else {
            existing.subscribers.push(subscriber);
        }
    }

    private async subscribeSpotEvents(opts: ProtoOASubscribeSpotsReq) {
        this.logCallAttempt(this.subscribeSpotEvents);
        const optsClone = structuredClone(opts);
        optsClone.ctidTraderAccountId = this.credentials.ctidTraderAccountId;
        optsClone.subscribeToSpotTimestamp = true;
        try {
            const result = (await this.connection.sendCommand(
                ProtoOASubscribeSpotsReq.name,
                optsClone,
            )) as ProtoOASubscribeSpotsRes;
            this.logCallAttemptSuccess(this.subscribeSpotEvents);
            return result;
        } catch (e) {
            if (cTraderXError.isProtoOAErrorRes(e)) {
                if (e.errorCode === 'ALREADY_SUBSCRIBED') {
                    this.logCallAttemptSuccess(this.subscribeSpotEvents);
                    return of<ProtoOASubscribeLiveTrendbarRes>({
                        ctidTraderAccountId: optsClone.ctidTraderAccountId,
                    });
                }
            }
            throw this.handleCTraderCallError(
                e,
                this.subscribeSpotEvents,
                new SubscribeSpotEventsError(e),
            );
        }
    }

    private async subscribeLiveTrendBarsInternal(
        opts: ProtoOASubscribeLiveTrendbarReq,
    ) {
        this.logCallAttempt(this.subscribeLiveTrendBarsInternal);
        const optsClone = structuredClone(opts);
        optsClone.ctidTraderAccountId = this.credentials.ctidTraderAccountId;
        try {
            const result = (await this.connection.sendCommand(
                ProtoOASubscribeLiveTrendbarReq.name,
                optsClone,
            )) as ProtoOASubscribeLiveTrendbarRes;
            this.logCallAttemptSuccess(this.subscribeLiveTrendBarsInternal);
            return result;
        } catch (e) {
            if (cTraderXError.isProtoOAErrorRes(e)) {
                if (e.errorCode === 'ALREADY_SUBSCRIBED') {
                    this.logCallAttemptSuccess(
                        this.subscribeLiveTrendBarsInternal,
                    );
                    return of<ProtoOASubscribeLiveTrendbarRes>({
                        ctidTraderAccountId: optsClone.ctidTraderAccountId,
                    });
                }
            }
            throw this.handleCTraderCallError(
                e,
                this.subscribeLiveTrendBarsInternal,
                new SubscribeLiveTrendBarsInternalError(e),
            );
        }
    }
}
