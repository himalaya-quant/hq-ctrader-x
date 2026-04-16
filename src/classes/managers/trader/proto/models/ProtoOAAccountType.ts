export enum ProtoOAAccountType {
    /**
     * Allows multiple positions on a trading account for a symbol.
     */
    HEDGED = 0,

    /**
     * Only one position per symbol is allowed on a trading account.
     */
    NETTED = 1,

    /**
     * Spread betting type account.
     */
    SPREAD_BETTING = 2,
}
