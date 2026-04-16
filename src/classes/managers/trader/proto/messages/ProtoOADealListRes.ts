import { BaseProto } from '../../../../../models/proto/base-proto';
import { ProtoOADeal } from '../../../orders/proto/models/ProtoOADeal';

/**
 * The response to the ProtoOADealListRes request.
 */
export class ProtoOADealListRes extends BaseProto {
    /**
     * The list of the deals
     */
    deal: ProtoOADeal[];

    /**
     * If TRUE then the number of records by filter is larger than chunkSize,
     * the response contains the number of records that is equal to chunkSize.
     */
    hasMore: boolean;
}
