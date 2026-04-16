import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraderManager } from './trader.manager';
import { ProtoOATraderRes } from './proto/messages/ProtoOATraderRes';
import { ProtoOAAccessRights } from './proto/models/ProtoOAAccessRights';
import { ProtoOAAccountType } from './proto/models/ProtoOAAccountType';
import { ProtoOALimitedRiskMarginCalculationStrategy } from './proto/models/ProtoOALimitedRiskMarginCalculationStrategy';
import { ProtoOAStopOutStrategy } from './proto/models/ProtoOAStopOutStrategy';
import { ProtoOATotalMarginCalculationType } from './proto/models/ProtoOATotalMarginCalculationType';
import { ProtoOATraderReq } from './proto/messages/ProtoOATraderReq';

describe('TraderManager - Unit Tests', () => {
    let traderManager: TraderManager;
    let mockConnection: any;
    let mockLogger: any;
    let mockCredentials: any;

    beforeEach(() => {
        mockConnection = {
            sendCommand: vi.fn(),
            on: vi.fn(),
        };

        mockLogger = {
            debug: vi.fn(),
            error: vi.fn(),
        };

        mockCredentials = {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            accessToken: 'test-access-token',
            ctidTraderAccountId: 12345,
        };

        traderManager = new TraderManager(
            mockCredentials,
            mockConnection,
            mockLogger,
        );
    });

    describe('getTrader', () => {
        it('should return full trader info successfully', async () => {
            const mockTraderResponse: ProtoOATraderRes = {
                ctidTraderAccountId: 12345,
                trader: {
                    ctidTraderAccountId: 12345,
                    accessRights: ProtoOAAccessRights.FULL_ACCESS,
                    accountType: ProtoOAAccountType.NETTED,
                    balance: 0,
                    balanceVersion: 0,
                    brokerName: 'test-broker-name',
                    depositAssetId: 0,
                    fairStopOut: false,
                    frenchRisk: false,
                    ibBonus: 0,
                    isLimitedRisk: false,
                    leverageInCents: 0,
                    limitedRiskMarginCalculationStrategy:
                        ProtoOALimitedRiskMarginCalculationStrategy.ACCORDING_TO_GSL,
                    managerBonus: 0,
                    maxLeverage: 0,
                    moneyDigits: 0,
                    nonWithdrawableBonus: 0,
                    registrationTimestamp: 0,
                    stopOutStrategy: ProtoOAStopOutStrategy.MOST_LOSING_FIRST,
                    swapFree: false,
                    totalMarginCalculationType:
                        ProtoOATotalMarginCalculationType.MAX,
                    traderLogin: 0,
                },
            };

            mockConnection.sendCommand.mockResolvedValueOnce(
                mockTraderResponse,
            );

            const result = await traderManager.getTrader();

            const expected = structuredClone(mockTraderResponse);

            expect(result).toEqual(expected);
            expect(mockConnection.sendCommand).toHaveBeenCalledTimes(1);
            expect(mockConnection.sendCommand).toHaveBeenNthCalledWith(
                1,
                ProtoOATraderReq.name,
                {
                    ctidTraderAccountId: 12345,
                },
            );
        });
    });
});
