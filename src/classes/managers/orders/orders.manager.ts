import { Subject } from 'rxjs';
import { CTraderConnection } from '@himalaya-quant/ctrader-layer';
import { CTraderLayerEvent } from '@himalaya-quant/ctrader-layer/build/src/core/events/CTraderLayerEvent';

import { ILogger } from '../../logger';
import { BaseManager } from '../models/base.manager';
import { OpenOrderError } from './errors/open-order.error';
import { ICredentials } from '../models/credentials.model';

import {
    OrderEvent,
    OrderErrorEvent,
    OrderFilledEvent,
    OrderExpiredEvent,
    OrderAcceptedEvent,
    OrderRejectedEvent,
    OrderCancelledEvent,
} from './events/orders.events';

import {
    isFilledOrder,
    isExpiredOrder,
    isAcceptedOrder,
    isRejectedOrder,
    isCancelledOrder,
} from './typeguards/positions-typeguards';

import { ClosePositionError } from './errors/close-position.error';
import { GetOpenPositionsError } from './errors/get-open-positions.error';
import { CancelPendingOrderError } from './errors/cancel-pending-order.error';
import { ModifyPendingOrderError } from './errors/modify-pending-order.error';
import { GetPositionUnrealizedPnLError } from './errors/get-position-unrealized-pnl.error';

import { ProtoOANewOrderReq } from './proto/messages/ProtoOANewOrderReq';
import { ProtoOAReconcileReq } from './proto/messages/ProtoOAReconcileReq';
import { ProtoOAReconcileRes } from './proto/messages/ProtoOAReconcileRes';
import { ProtoOAAmendOrderReq } from './proto/messages/ProtoOAAmendOrderReq';
import { ProtoOAExecutionEvent } from './proto/events/ProtoOAExecutionEvent';
import { ProtoOACancelOrderReq } from './proto/messages/ProtoOACancelOrderReq';
import { ProtoOAOrderErrorEvent } from './proto/events/ProtoOAOrderErrorEvent';
import { ProtoOAClosePositionReq } from '../symbols/proto/messages/ProtoOAClosePositionReq';
import { ProtoOAGetPositionUnrealizedPnLReq } from './proto/messages/ProtoOAGetPositionUnrealizedPnLReq';
import { ProtoOAGetPositionUnrealizedPnLRes } from './proto/messages/ProtoOAGetPositionUnrealizedPnLRes';

type BaseProto = 'payloadType' | 'ctidTraderAccountId';

export class OrdersEventsDispatcher {
    private readonly ordersUpdates$ = new Subject<
        OrderEvent | OrderErrorEvent
    >();

    dispatch(event: OrderEvent | OrderErrorEvent) {
        this.ordersUpdates$.next(event);
    }

    subscribeEvents() {
        return this.ordersUpdates$.asObservable();
    }
}

export class OrdersManager extends BaseManager {
    private readonly subscriptionsIds = new Set<string>();

    constructor(
        protected readonly credentials: ICredentials,
        protected readonly connection: CTraderConnection,
        protected readonly logger: ILogger,
        protected readonly orderEventsDispatcher: OrdersEventsDispatcher,
    ) {
        super();
        this.openEventsListeners();
    }

    /**
     * Closes all the subscriptions, freeing memory and avoiding zombie event
     * listeners dangling
     */
    dispose() {
        this.subscriptionsIds.forEach((id) =>
            this.connection.removeEventListener(id),
        );
    }

    subscribeOrdersEvents() {
        return this.orderEventsDispatcher.subscribeEvents();
    }

    /**
     * Request for cancelling existing pending order.
     * Allowed only if the accessToken has "trade" permissions for the trading account.
     * @param req The details for the pending order to close
     */
    async cancelPendingOrder(req: Omit<ProtoOACancelOrderReq, BaseProto>) {
        this.logCallAttempt(this.cancelPendingOrder);
        const payload: ProtoOACancelOrderReq = {
            ...req,
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        try {
            await this.connection.sendCommand(
                ProtoOACancelOrderReq.name,
                payload,
            );
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.cancelPendingOrder,
                new CancelPendingOrderError(e),
            );
        }

        this.logCallAttemptSuccess(this.cancelPendingOrder);
    }

    /**
     * Request for sending a new trading order.
     * Allowed only if the accessToken has the "trade" permissions for the trading account.
     * @param req The details for the new order to send
     */
    async newOrder(req: Omit<ProtoOANewOrderReq, BaseProto>) {
        this.logCallAttempt(this.newOrder);
        const payload: ProtoOANewOrderReq = {
            ...req,
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        try {
            await this.connection.sendCommand(ProtoOANewOrderReq.name, payload);
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.newOrder,
                new OpenOrderError(e),
            );
        }

        this.logCallAttemptSuccess(this.newOrder);
    }

    /**
     * Request for amending the existing pending order.
     * Allowed only if the Access Token has "trade" permissions for the trading account.
     * @param req The details for the pending order to modify
     */
    async modifyPendingOrder(req: Omit<ProtoOAAmendOrderReq, BaseProto>) {
        this.logCallAttempt(this.modifyPendingOrder);
        const payload: ProtoOAAmendOrderReq = {
            ...req,
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        try {
            await this.connection.sendCommand(
                ProtoOAAmendOrderReq.name,
                payload,
            );
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.modifyPendingOrder,
                new ModifyPendingOrderError(e),
            );
        }

        this.logCallAttemptSuccess(this.modifyPendingOrder);
    }

    /**
     * Request for closing or partially closing of an existing position.
     * Allowed only if the accessToken has "trade" permissions for the trading account.
     *
     * @param req The details for the position to close
     */
    async closePosition(req: Omit<ProtoOAClosePositionReq, BaseProto>) {
        this.logCallAttempt(this.closePosition);

        const payload: ProtoOAClosePositionReq = {
            ...req,
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        try {
            await this.connection.sendCommand(
                ProtoOAClosePositionReq.name,
                payload,
            );
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.closePosition,
                new ClosePositionError(e),
            );
        }

        this.logCallAttemptSuccess(this.closePosition);
    }

    /**
     * Request for getting Trader's current open positions and pending orders data.
     */
    async getOpenPositions(
        req?: Omit<ProtoOAReconcileReq, BaseProto>,
    ): Promise<Omit<ProtoOAReconcileRes, 'payloadType'>> {
        this.logCallAttempt(this.getOpenPositions);

        const payload: ProtoOAReconcileReq = {
            ...req,
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        let result: ProtoOAReconcileRes;
        try {
            result = (await this.connection.sendCommand(
                ProtoOAReconcileReq.name,
                payload,
            )) as ProtoOAReconcileRes;
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.getOpenPositions,
                new GetOpenPositionsError(e),
            );
        }

        this.logCallAttemptSuccess(this.getOpenPositions);
        return {
            order: result.order,
            position: result.position,
            ctidTraderAccountId: result.ctidTraderAccountId,
        };
    }

    async getPositionUnrealizedPnL() {
        this.logCallAttempt(this.getPositionUnrealizedPnL);

        const payload: ProtoOAGetPositionUnrealizedPnLReq = {
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        let result: ProtoOAGetPositionUnrealizedPnLRes;
        try {
            result = (await this.connection.sendCommand(
                ProtoOAGetPositionUnrealizedPnLReq.name,
                payload,
            )) as ProtoOAGetPositionUnrealizedPnLRes;
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.getPositionUnrealizedPnL,
                new GetPositionUnrealizedPnLError(e),
            );
        }

        this.logCallAttemptSuccess(this.getPositionUnrealizedPnL);
        return result;
    }

    private openEventsListeners() {
        this.subscriptionsIds.add(
            this.connection.on(
                ProtoOAOrderErrorEvent.name,
                this.handleOrderEventError.bind(this),
            ),
        );

        this.subscriptionsIds.add(
            this.connection.on(
                ProtoOAExecutionEvent.name,
                this.handleOrderExecutionEvent.bind(this),
            ),
        );
    }

    private handleOrderExecutionEvent(event: CTraderLayerEvent): any {
        const { order, deal } = event.descriptor as ProtoOAExecutionEvent;
        if (isAcceptedOrder(order)) {
            this.logger.debug(
                `Order ${order.clientOrderId || order.orderId} accepted`,
            );
            this.orderEventsDispatcher.dispatch(
                new OrderAcceptedEvent(order, deal),
            );
        }

        if (isFilledOrder(order)) {
            this.logger.debug(
                `Order ${order.clientOrderId || order.orderId} filled`,
            );
            this.orderEventsDispatcher.dispatch(
                new OrderFilledEvent(order, deal),
            );
        }

        if (isCancelledOrder(order)) {
            this.logger.debug(
                `Order ${order.clientOrderId || order.orderId} cancelled`,
            );
            this.orderEventsDispatcher.dispatch(
                new OrderCancelledEvent(order, deal),
            );
        }

        if (isExpiredOrder(order)) {
            this.logger.debug(
                `Order ${order.clientOrderId || order.orderId} expired`,
            );
            this.orderEventsDispatcher.dispatch(
                new OrderExpiredEvent(order, deal),
            );
        }

        if (isRejectedOrder(order)) {
            this.logger.debug(
                `Order ${order.clientOrderId || order.orderId} rejected`,
            );
            this.orderEventsDispatcher.dispatch(
                new OrderRejectedEvent(order, deal),
            );
        }
    }

    private handleOrderEventError(event: CTraderLayerEvent): any {
        const error = event.descriptor as ProtoOAOrderErrorEvent;
        this.orderEventsDispatcher.dispatch(new OrderErrorEvent(error));
    }
}
