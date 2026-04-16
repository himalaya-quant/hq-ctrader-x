export enum ProtoOAOrderTriggerMethod {
    /**
     * Stop Order: buy is triggered by ask, sell by bid; Stop Loss Order: for buy position is triggered by bid and for sell position by ask.
     */
    TRADE = 1,

    /**
     * Stop Order: buy is triggered by bid, sell by ask; Stop Loss Order: for buy position is triggered by ask and for sell position by bid.
     */
    OPPOSITE = 2,

    /**
     * The same as TRADE, but trigger is checked after the second consecutive tick.
     */
    DOUBLE_TRADE = 3,

    /**
     * The same as OPPOSITE, but trigger is checked after the second consecutive tick.
     */
    DOUBLE_OPPOSITE = 4,
}
