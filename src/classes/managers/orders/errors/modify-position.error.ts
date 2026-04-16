import { cTraderXError } from '../../../models/ctrader-x-error.model';

export class ModifyPositionError extends cTraderXError {
    constructor(error: unknown) {
        super(
            `Modify position error: ${cTraderXError.getMessageError(error)}`,
        );
    }
}
