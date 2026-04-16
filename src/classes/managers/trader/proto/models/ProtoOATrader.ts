import { ProtoOAAccountType } from './ProtoOAAccountType';
import { ProtoOAAccessRights } from './ProtoOAAccessRights';
import { ProtoOAStopOutStrategy } from './ProtoOAStopOutStrategy';
import { ProtoOATotalMarginCalculationType } from './ProtoOATotalMarginCalculationType';
import { ProtoOALimitedRiskMarginCalculationStrategy } from './ProtoOALimitedRiskMarginCalculationStrategy';

export class ProtoOATrader {
    /**
     * The unique Trader's Account ID used to match the responses to the Trader's Account.
     */
    ctidTraderAccountId: number;

    /**
     * Current account balance.
     */
    balance: number;

    /**
     * Balance version used to identify the final balance. Increments each time when the trader's account balance is changed.
     */
    balanceVersion: number;

    /**
     * Amount of broker's bonus allocated to the account.
     */
    managerBonus: number;

    /**
     * Amount of introducing broker bonus allocated to the account.
     */
    ibBonus: number;

    /**
     * Broker's bonus that cannot be withdrew from the account as cash.
     */
    nonWithdrawableBonus: number;

    /**
     * Access rights that an owner has to the account in cTrader platform. See ProtoOAAccessRights for details.
     */
    accessRights: ProtoOAAccessRights;

    /**
     * Deposit currency of the account.
     */
    depositAssetId: number;

    /**
     * If TRUE then account is Shariah compliant.
     */
    swapFree: boolean;

    /**
     * Account leverage (e.g. If leverage = 1:50 then value = 5000).
     */
    leverageInCents: number;

    /**
     * Margin computation type for the account (MAX, SUM, NET).
     */
    totalMarginCalculationType: ProtoOATotalMarginCalculationType;

    /**
     * Maximum allowed leverage for the account. Used as validation when a Trader can change leverage value.
     */
    maxLeverage: number;

    /**
     * If TRUE then account is AMF compliant. Use isLimitedRisk and limitedRiskMarginCalculationStrategy.
     */
    frenchRisk: boolean;

    /**
     * ID of the account that is unique per server (Broker).
     */
    traderLogin: number;

    /**
     * Account type: HEDGED, NETTED, etc.
     */
    accountType: ProtoOAAccountType;

    /**
     * Some whitelabel assigned to trader by broker at the moment of account creation.
     */
    brokerName: string;

    /**
     * The Unix timestamp in milliseconds of the account registration. Should be used as minimal date in historical data requests.
     */
    registrationTimestamp: number;

    /**
     * If TRUE then account is compliant to use specific margin calculation strategy. Such accounts are require to have guaranteed stop loss on all positions.
     */
    isLimitedRisk: boolean;

    /**
     * Special strategy used in margin calculations for this account (if account isLimitedRisk).
     */
    limitedRiskMarginCalculationStrategy: ProtoOALimitedRiskMarginCalculationStrategy;

    /**
     * Specifies the exponent of the monetary values. E.g. moneyDigits = 8 must be interpret as business value multiplied by 10^8, then real balance would be 10053099944 / 10^8 = 100.53099944. Affects balance, managerBonus, ibBonus, nonWithdrawableBonus.
     */
    moneyDigits: number;

    /**
     * If TRUE - Position is fully closed on Stop Out, if FALSE - smart (partial closing) Stop Out is applied, if unspecified - Stop Out format is determined by Broker.
     */
    fairStopOut: boolean;

    /**
     * The Stop Out strategy that is used for this Trader. The Trader can change the value in the cTrader UI if this option is not disabled by the Broker
     */
    stopOutStrategy: ProtoOAStopOutStrategy;
}