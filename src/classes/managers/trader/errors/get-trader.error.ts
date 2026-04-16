import { cTraderXError } from '../../../models/ctrader-x-error.model';

export class GetTraderError extends cTraderXError {
    constructor(error: unknown) {
        super(
            `Get trader error: ${cTraderXError.getMessageError(error)}`,
        );
    }
}
