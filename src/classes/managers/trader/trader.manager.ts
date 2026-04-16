import { CTraderConnection } from '@himalaya-quant/ctrader-layer';
import { ILogger } from '../../logger';
import { BaseManager } from '../models/base.manager';
import { ICredentials } from '../models/credentials.model';
import { GetTraderError } from './errors/get-trader.error';
import { ProtoOATraderRes } from './proto/messages/ProtoOATraderRes';
import { ProtoOATraderReq } from './proto/messages/ProtoOATraderReq';
import { ProtoOADealListRes } from './proto/messages/ProtoOADealListRes';
import { ProtoOADealListReq } from './proto/messages/ProtoOADealListReq';
import { GetTraderDealsError } from './errors/get-trader-deals.error';

type BaseProto = 'payloadType' | 'ctidTraderAccountId';

export class TraderManager extends BaseManager {
    constructor(
        protected readonly credentials: ICredentials,
        protected readonly connection: CTraderConnection,
        protected readonly logger: ILogger,
    ) {
        super();
    }

    async getTrader(): Promise<ProtoOATraderRes> {
        this.logCallAttempt(this.getTrader);

        const payload: ProtoOATraderReq = {
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        let result: ProtoOATraderRes;
        try {
            result = (await this.connection.sendCommand(
                ProtoOATraderReq.name,
                payload,
            )) as ProtoOATraderRes;
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.getTrader,
                new GetTraderError(e),
            );
        }

        this.logCallAttemptSuccess(this.getTrader);

        return result;
    }

    async getTraderDeals(
        req: Omit<ProtoOADealListReq, BaseProto>,
    ): Promise<ProtoOADealListRes> {
        this.logCallAttempt(this.getTraderDeals);

        const payload: ProtoOADealListReq = {
            ...req,
            ctidTraderAccountId: this.credentials.ctidTraderAccountId,
        };

        let result: ProtoOADealListRes;
        try {
            result = (await this.connection.sendCommand(
                ProtoOADealListReq.name,
                payload,
            )) as ProtoOADealListRes;
        } catch (e) {
            throw this.handleCTraderCallError(
                e,
                this.getTraderDeals,
                new GetTraderDealsError(e),
            );
        }

        this.logCallAttemptSuccess(this.getTraderDeals);

        return result;
    }
}
