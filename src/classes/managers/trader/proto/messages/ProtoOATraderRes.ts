import { BaseProto } from '../../../../../models/proto/base-proto';
import { ProtoOATrader } from '../models/ProtoOATrader';

/**
 * Response to the ProtoOATraderReq request.
 */
export class ProtoOATraderRes extends BaseProto {
    trader: ProtoOATrader;
}
