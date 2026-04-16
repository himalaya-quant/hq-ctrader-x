export enum ProtoOAStopOutStrategy {
    /**
     * 	A Stop Out strategy that closes a Position with the largest Used Margin
     */
    MOST_MARGIN_USED_FIRST = 0,

    /**
     * 	A Stop Out strategy that closes a Position with the least PnL
     */
    MOST_LOSING_FIRST = 1,
}
