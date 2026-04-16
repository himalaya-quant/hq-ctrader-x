import { BaseProto } from '../../../../../models/proto/base-proto';
import { ProtoOAOrderTriggerMethod } from '../enums/ProtoOAOrderTriggerMethod';

export class ProtoOAAmendPositionSLTPReq extends BaseProto {
    /**
     * The unique ID of the position to amend.
     */
    positionId: number;

    /**
     * Absolute Stop Loss price (1.23456 for example).
     */
    stopLoss: number;

    /**
     * Absolute Take Profit price (1.26543 for example).
     */
    takeProfit: number;

    /**
     * If TRUE then the Stop Loss is guaranteed. Available for the French Risk or the Guaranteed Stop Loss Accounts.
     */
    guaranteedStopLoss: boolean;

    /**
     * If TRUE then the Trailing Stop Loss is applied.
     */
    trailingStopLoss: boolean;

    /**
     * The Stop trigger method for the Stop Loss/Take Profit order.
     */
    stopLossTriggerMethod: ProtoOAOrderTriggerMethod;
}
