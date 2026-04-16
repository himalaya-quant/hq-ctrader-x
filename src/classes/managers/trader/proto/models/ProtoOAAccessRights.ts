export enum ProtoOAAccessRights {
    /**
     * 	Enable all trading.
     */
    FULL_ACCESS = 0,

    /**
     * 	Only closing trading request are enabled.
     */
    CLOSE_ONLY = 1,

    /**
     * 	View only access.
     */
    NO_TRADING = 2,

    /**
     * 	No access.
     */
    NO_LOGIN = 3,
}
