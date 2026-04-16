import { BaseProto } from '../../../../../models/proto/base-proto';

/**
 * Request for getting Trader's deals historical data (execution details).
 */
export class ProtoOADealListReq extends BaseProto {
    /**
     * The Unix time from which the search starts >=0 (1st Jan 1970).
     */
    fromTimestamp: number;

    /**
     * The Unix time where to stop searching <= 2147483646000 (19th Jan 2038).
     */
    toTimestamp: number;

    /**
     * The maximum number of the deals to return.
     */
    maxRows: number;
}
