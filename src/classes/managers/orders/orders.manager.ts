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

import { ClosePositionError } from './errors/close-position.error';
import { GetOpenPositionsError } from './errors/get-open-positions.error';
import { CancelPendingOrderError } from './errors/cancel-pending-order.error';
import { ModifyPendingOrderError } from './errors/modify-pending-order.error';
import { GetPositionUnrealizedPnLError } from './errors/get-position-unrealized-pnl.error';

import { ProtoOANewOrderReq } from './proto/messages/ProtoOANewOrderReq';
import { ProtoOAExecutionType } from './proto/enums/ProtoOAExecutionType';
import { ProtoOAReconcileReq } from './proto/messages/ProtoOAReconcileReq';
import { ProtoOAReconcileRes } from './proto/messages/ProtoOAReconcileRes';
import { ProtoOAAmendOrderReq } from './proto/messages/ProtoOAAmendOrderReq';
import { ProtoOAExecutionEvent } from './proto/events/ProtoOAExecutionEvent';
import { ProtoOACancelOrderReq } from './proto/messages/ProtoOACancelOrderReq';
import { ProtoOAOrderErrorEvent } from './proto/events/ProtoOAOrderErrorEvent';
import { ProtoOAClosePositionReq } from '../symbols/proto/messages/ProtoOAClosePositionReq';
import { ProtoOAGetPositionUnrealizedPnLReq } from './proto/messages/ProtoOAGetPositionUnrealizedPnLReq';
import { ProtoOAGetPositionUnrealizedPnLRes } from './proto/messages/ProtoOAGetPositionUnrealizedPnLRes';
import { ProtoOAAmendPositionSLTPReq } from './proto/messages/ProtoOAAmendPositionSLTPReq';
import { ModifyPositionError } from './errors/modify-position.error';

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
     * Request for amending StopLoss and TakeProfit of existing position.
     * Allowed only if the accessToken has "trade" permissions for the trading account.
     *
     * @param req ProtoOAAmendPositionSLTPReq request payload
     */
    async modifyPosition(req: Omit<ProtoOAAmendPositionSLTPReq, BaseProto>) {
        this.logCallAttempt(this.modifyPosition);
        const payload: ProtoOAAmendPositionSLTPReq = {
            ...req,
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        try {
            await this.connection.sendCommand(
                ProtoOAAmendPositionSLTPReq.name,
                payload,
            );
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.modifyPosition,
                new ModifyPositionError(e),
            );
        }

        this.logCallAttemptSuccess(this.modifyPosition);
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
        const descriptor = event.descriptor as ProtoOAExecutionEvent;
        const { executionType, order, deal } = descriptor;

        // These execution types does not concern orders directly. Ignore them
        switch (executionType) {
            case ProtoOAExecutionType[ProtoOAExecutionType.SWAP]:
            case ProtoOAExecutionType[ProtoOAExecutionType.DEPOSIT_WITHDRAW]:
            case ProtoOAExecutionType[
                ProtoOAExecutionType.BONUS_DEPOSIT_WITHDRAW
            ]:
                this.logger.debug(
                    `Non-order execution event received: ${ProtoOAExecutionType[executionType]}`,
                );
                return;

            case ProtoOAExecutionType[
                ProtoOAExecutionType.ORDER_CANCEL_REJECTED
            ]:
                this.logger.debug(
                    `Order cancel rejected: ${descriptor.errorCode}`,
                );
                // Should we dispatch an event here?
                return;
        }

        // From here on, we expect order to be present
        if (!order) {
            this.logger.warn(
                `Received execution event of type ${ProtoOAExecutionType[executionType]} without order. Skipping.`,
            );
            return;
        }

        switch (executionType) {
            case ProtoOAExecutionType[ProtoOAExecutionType.ORDER_ACCEPTED]:
                this.logger.debug(
                    `Order ${order.clientOrderId || order.orderId} accepted`,
                );
                this.orderEventsDispatcher.dispatch(
                    new OrderAcceptedEvent(order, deal),
                );
                break;

            case ProtoOAExecutionType[ProtoOAExecutionType.ORDER_PARTIAL_FILL]:
                this.logger.debug(
                    `Order ${order.clientOrderId || order.orderId} partially filled`,
                );
                break;
            case ProtoOAExecutionType[ProtoOAExecutionType.ORDER_FILLED]:
                this.logger.debug(
                    `Order ${order.clientOrderId || order.orderId} filled`,
                );
                this.orderEventsDispatcher.dispatch(
                    new OrderFilledEvent(order, deal),
                );
                break;

            case ProtoOAExecutionType[ProtoOAExecutionType.ORDER_CANCELLED]:
                this.logger.debug(
                    `Order ${order.clientOrderId || order.orderId} cancelled`,
                );
                this.orderEventsDispatcher.dispatch(
                    new OrderCancelledEvent(order, deal),
                );
                break;

            case ProtoOAExecutionType[ProtoOAExecutionType.ORDER_EXPIRED]:
                this.logger.debug(
                    `Order ${order.clientOrderId || order.orderId} expired`,
                );
                this.orderEventsDispatcher.dispatch(
                    new OrderExpiredEvent(order, deal),
                );
                break;

            case ProtoOAExecutionType[ProtoOAExecutionType.ORDER_REJECTED]:
                this.logger.debug(
                    `Order ${order.clientOrderId || order.orderId} rejected`,
                );
                this.orderEventsDispatcher.dispatch(
                    new OrderRejectedEvent(order, deal),
                );
                break;

            case ProtoOAExecutionType[ProtoOAExecutionType.ORDER_REPLACED]:
                this.logger.debug(
                    `Order ${order.clientOrderId || order.orderId} replaced`,
                );
                break;

            default:
                this.logger.warn(`Unhandled execution type: ${executionType}`);
        }
    }

    private handleOrderEventError(event: CTraderLayerEvent): any {
        const error = event.descriptor as ProtoOAOrderErrorEvent;
        this.orderEventsDispatcher.dispatch(new OrderErrorEvent(error));
    }
}
