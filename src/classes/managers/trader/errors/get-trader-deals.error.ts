import { cTraderXError } from '../../../models/ctrader-x-error.model';

export class GetTraderDealsError extends cTraderXError {
    constructor(error: unknown) {
        super(
            `Get trader deals error: ${cTraderXError.getMessageError(error)}`,
        );
    }
}
