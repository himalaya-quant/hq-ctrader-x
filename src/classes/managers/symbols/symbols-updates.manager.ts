import { CTraderConnection } from '@himalaya-quant/ctrader-layer';
import { ILogger } from '../../logger';
import { BaseManager } from '../models/base.manager';
import { ICredentials } from '../models/credentials.model';
import { ProtoOASubscribeLiveTrendbarReq } from './proto/messages/ProtoOASubscribeLiveTrendbarReq';
import {
    tap,
    from,
    Subject,
    switchMap,
    catchError,
    BehaviorSubject,
    of,
} from 'rxjs';
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

class SubscriptionsManager {
    static readonly liveBarsSubscriptions$: BehaviorSubject<
        ILiveBarsSubscribers[]
    > = new BehaviorSubject([]);
}

export class SymbolsUpdatesManager extends BaseManager {
    private readonly liveBarsSubscriptionsMapper$ =
        SubscriptionsManager.liveBarsSubscriptions$.pipe(
            tap((values) =>
                values.forEach(({ symbolId }, idx) => {
                    this.liveBarsSubsSymbolsToSubscribersMap.set(
                        +symbolId,
                        idx,
                    );
                }),
            ),
        );

    private liveBarsSubsSymbolsToSubscribersMap = new Map<number, number>();

    constructor(
        protected readonly credentials: ICredentials,
        protected readonly connection: CTraderConnection,
        protected readonly logger: ILogger,
    ) {
        super();
        this.liveBarsSubscriptionsMapper$.subscribe();

        const subscriptions =
            SubscriptionsManager.liveBarsSubscriptions$.getValue();
        if (subscriptions.length) {
            for (const { subscribers, symbolId } of subscriptions) {
                this.subscribeSpotEvents({
                    symbolId,
                });

                for (const { period } of subscribers) {
                    this.logger.debug(
                        `Restoring ${symbolId}:${period} subscription`,
                    );
                    this.subscribeLiveTrendBarsInternal({
                        period,
                        symbolId,
                    });
                }
            }
        }

        this.connection.on(ProtoOASpotEvent.name, (event) => {
            if (this.isTrackedSubscribeLiveTrendBarsDescriptor(event)) {
                const { subscribers, idx } = this.getLiveTrendBarsSubscriptions(
                    +event.descriptor.symbolId,
                );
                if (idx === null) return;

                subscribers.subscribers.forEach(
                    (
                        {
                            lastBar,
                            lastBarTime,
                            period,
                            subscriber,
                            isInitialized,
                        },
                        idx,
                    ) => {
                        const update =
                            this.spotEventDescriptorToSubscribeLiveBarsEvent(
                                event,
                                period,
                                lastBar,
                                lastBarTime,
                                isInitialized,
                            );
                        if (!update) return;

                        lastBar = update.ohlcv;
                        lastBarTime = update.lastBarTime;
                        subscriber.next({
                            ohlcv: update.ohlcv,
                            period: update.period,
                            symbolId: update.symbolId,
                        });

                        subscribers.subscribers[idx].isInitialized =
                            update.isInitialized;
                        subscribers.subscribers[idx].lastBar = lastBar;
                        subscribers.subscribers[idx].lastBarTime = lastBarTime;
                    },
                );

                this.updateSubscribeLiveTrendBarsSubscriptions(
                    subscribers,
                    idx,
                );
            } else {
                this.logger.warn(`Unhandled event received`);
            }
        });
    }

    async unsubscribeLiveTrendBars(opts: IUnsubscribeBarsOptions) {
        this.removeSubscribeLiveTrendBarsSubscription(
            opts.symbolId,
            opts.period,
        );

        const symbolSubscriptions = this.getLiveTrendBarsSubscriptions(
            +opts.symbolId,
        );
        if (!symbolSubscriptions.subscribers.subscribers.length) {
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

    subscribeLiveTrendBars(opts: ISubscribeBarsOptions) {
        const subject = new Subject<
            Omit<SubscribeLiveTrendBarsEvent, 'lastBarTime'>
        >();
        this.addSubscribeLiveTrendBarsSubscription(opts.symbolId, {
            lastBar: null,
            lastBarTime: null,
            period: opts.period,
            subscriber: subject,
            isInitialized: false,
        });
        return from(
            this.subscribeSpotEvents({
                symbolId: opts.symbolId,
                ctidTraderAccountId: this.credentials.ctidTraderAccountId,
            }),
        ).pipe(
            switchMap(() => this.subscribeLiveTrendBarsInternal(opts)),
            switchMap(() => subject),
            catchError((e) => {
                this.logger.error(
                    `[Symbol: ${opts.symbolId} Period: ${opts.period}] Error subscribing to live trend bars: ${cTraderXError.getMessageError(e)}`,
                );
                this.removeSubscribeLiveTrendBarsSubscription(
                    opts.symbolId,
                    opts.period,
                );
                throw e;
            }),
        );
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
        // (shouldn't happen based on your logs, but safety check)
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
            // New bar (or first bar) - initialize from trendbar + current price
            lastBarClone = [barTimestamp, OPEN, HIGH, LOW, price, VOLUME];
            lastBarTimeClone = barTimestamp;
            isInitialized = true;

            return {
                period,
                isInitialized,
                ohlcv: lastBarClone,
                symbolId: event.descriptor.symbolId,
                lastBarTime: barTimestamp,
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
            lastBarClone[OHLCVPositions.OPEN] = OPEN; // Should not change, but update anyway
            lastBarClone[OHLCVPositions.HIGH] = HIGH; // Server's accumulated HIGH
            lastBarClone[OHLCVPositions.LOW] = LOW; // Server's accumulated LOW
            lastBarClone[OHLCVPositions.CLOSE] = price; // Current tick
            lastBarClone[OHLCVPositions.VOLUME] = VOLUME; // Server's accumulated VOLUME
        }

        return {
            period,
            isInitialized,
            ohlcv: lastBarClone,
            symbolId: event.descriptor.symbolId,
            lastBarTime: barTimestamp,
        };
    }

    private normalizePrice(low: number, priceDelta: number) {
        return low + (priceDelta || 0) / 100000;
    }

    private isTrackedSubscribeLiveTrendBarsDescriptor(
        event: CTraderLayerEvent,
    ) {
        return !isNaN(
            +this.liveBarsSubsSymbolsToSubscribersMap.has(
                +event.descriptor.symbolId,
            ),
        );
    }

    private getLiveTrendBarsSubscriptions(symbolId: number) {
        const idx = this.liveBarsSubsSymbolsToSubscribersMap.get(symbolId);
        if (idx === undefined) {
            this.logger.warn(
                `Received LiveTrendBars update, but no subscriber was found.`,
            );
            return {
                idx: null,
                subscribers: <ILiveBarsSubscribers>{
                    symbolId,
                    subscribers: [],
                    pricePrecision: null!,
                },
            };
        }

        return {
            subscribers:
                SubscriptionsManager.liveBarsSubscriptions$.getValue()[idx!],
            idx,
        };
    }

    private removeSubscribeLiveTrendBarsSubscription(
        symbolId: number,
        period: ProtoOATrendbarPeriod | '*',
    ) {
        const subscriptionIdx =
            this.liveBarsSubsSymbolsToSubscribersMap.get(symbolId);
        if (subscriptionIdx === undefined) return;

        const symbolSubscriptions =
            SubscriptionsManager.liveBarsSubscriptions$.getValue()[
                subscriptionIdx
            ];
        symbolSubscriptions.subscribers =
            symbolSubscriptions.subscribers.filter((s) => {
                if (period === '*' || s.period === period) {
                    s.subscriber.complete();
                    return false;
                }

                return true;
            });

        const allSubscriptions =
            SubscriptionsManager.liveBarsSubscriptions$.getValue();
        allSubscriptions[subscriptionIdx] = symbolSubscriptions;
        SubscriptionsManager.liveBarsSubscriptions$.next([...allSubscriptions]);
    }

    private addSubscribeLiveTrendBarsSubscription(
        symbolId: number,
        subscriber: ILiveBarsSubscriber,
    ) {
        const allSubscriptions =
            SubscriptionsManager.liveBarsSubscriptions$.getValue();
        const existingSubscriptionIdx =
            this.liveBarsSubsSymbolsToSubscribersMap.get(symbolId);
        if (existingSubscriptionIdx === undefined) {
            allSubscriptions.push({
                symbolId,
                subscribers: [subscriber],
            });
        } else {
            const existingSubscriberIdx = allSubscriptions[
                existingSubscriptionIdx
            ].subscribers.findIndex(
                ({ period }) => period === subscriber.period,
            );
            if (existingSubscriberIdx !== -1) {
                const existingSubscriber =
                    allSubscriptions[existingSubscriptionIdx].subscribers[
                        existingSubscriberIdx
                    ];
                this.logger.warn(
                    `[Symbol: ${symbolId} Period: ${subscriber.period}] Completing previous subscriber subscription in favor of new subscriber`,
                );
                existingSubscriber.subscriber.complete();
                existingSubscriber.subscriber = subscriber.subscriber;
            } else {
                allSubscriptions[existingSubscriptionIdx].subscribers.push(
                    subscriber,
                );
            }
        }

        SubscriptionsManager.liveBarsSubscriptions$.next([...allSubscriptions]);
    }

    private updateSubscribeLiveTrendBarsSubscriptions(
        subscribers: ILiveBarsSubscribers,
        idx: number,
    ) {
        const allSubscriptions =
            SubscriptionsManager.liveBarsSubscriptions$.getValue();
        allSubscriptions[idx] = subscribers;
        SubscriptionsManager.liveBarsSubscriptions$.next([...allSubscriptions]);
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
