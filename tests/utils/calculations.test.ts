import { describe, it, expect } from 'vitest';
import {
  formatTokenAmount,
  calculateUsdValue,
  calculateRequiredHedgeSize,
  calculateDeviation,
  determineHedgeAction,
  isFundingRateAcceptable
} from '../../src/utils/calculations';
import { LPPosition, HyperliquidPosition, HedgingAction } from '../../src/types';

describe('Calculation Utilities', () => {
  // Test formatTokenAmount
  describe('formatTokenAmount', () => {
    it('should format token amount correctly', () => {
      expect(formatTokenAmount(1000000000000000000n, 18)).toBeCloseTo(1.0);
      expect(formatTokenAmount(500000n, 6)).toBeCloseTo(0.5);
      expect(formatTokenAmount(0n, 18)).toBe(0);
    });
  });

  // Test calculateUsdValue
  describe('calculateUsdValue', () => {
    it('should calculate USD value correctly', () => {
      expect(calculateUsdValue(2, 10)).toBe(20);
      expect(calculateUsdValue(0, 100)).toBe(0);
      expect(calculateUsdValue(3.5, 2.5)).toBe(8.75);
    });
  });

  // Test calculateRequiredHedgeSize
  describe('calculateRequiredHedgeSize', () => {
    it('should return token0 exposure as hedge size', () => {
      const lpPosition: LPPosition = {
        liquidityAmount: 1000n,
        token0Amount: 100n,
        token1Amount: 200n,
        token0Address: '0x123',
        token1Address: '0x456',
        token0Symbol: 'PENDLE',
        token1Symbol: 'USDT',
        token0Decimals: 18,
        token1Decimals: 6,
        token0Exposure: 50,
        token1Exposure: 100,
        totalValueUSD: 150
      };
      expect(calculateRequiredHedgeSize(lpPosition)).toBe(50);
    });
  });

  // Test calculateDeviation
  describe('calculateDeviation', () => {
    it('should calculate deviation percentage correctly', () => {
      expect(calculateDeviation(100, 100)).toBe(0);
      expect(calculateDeviation(110, 100)).toBe(10);
      expect(calculateDeviation(90, 100)).toBe(10);
    });

    it('should handle zero hedge size', () => {
      expect(calculateDeviation(100, 0)).toBe(100);
      expect(calculateDeviation(0, 0)).toBe(0);
    });

    it('should handle very small hedge sizes', () => {
      expect(calculateDeviation(100, 0.000000001)).toBe(100);
    });
  });

  // Test determineHedgeAction
  describe('determineHedgeAction', () => {
    const lpPosition: LPPosition = {
      liquidityAmount: 1000n,
      token0Amount: 100n,
      token1Amount: 200n,
      token0Address: '0x123',
      token1Address: '0x456',
      token0Symbol: 'PENDLE',
      token1Symbol: 'USDT',
      token0Decimals: 18,
      token1Decimals: 6,
      token0Exposure: 100,
      token1Exposure: 100,
      totalValueUSD: 200
    };

    const hedgePosition: HyperliquidPosition = {
      coin: 'PENDLE-PERP',
      entryPrice: 10,
      size: -100, // Short position
      side: 'SHORT',
      leverage: 5,
      marginUsd: 20,
      markPrice: 10,
      unrealizedPnl: 0,
      liquidationPrice: 12
    };

    it('should return NO_ACTION when deviation is within threshold', () => {
      const result = determineHedgeAction(lpPosition, hedgePosition, 0.1, 10);
      expect(result.action).toBe(HedgingAction.NO_ACTION);
      expect(result.sizeChange).toBe(0);
    });

    it('should return INCREASE_SHORT when LP exposure is higher than hedge', () => {
      const highExposureLP = { ...lpPosition, token0Exposure: 120 };
      const result = determineHedgeAction(highExposureLP, hedgePosition, 0.1, 10);
      expect(result.action).toBe(HedgingAction.INCREASE_SHORT);
      expect(result.sizeChange).toBe(20);
    });

    it('should return DECREASE_SHORT when LP exposure is lower than hedge', () => {
      const lowExposureLP = { ...lpPosition, token0Exposure: 80 };
      const result = determineHedgeAction(lowExposureLP, hedgePosition, 0.1, 10);
      expect(result.action).toBe(HedgingAction.DECREASE_SHORT);
      expect(result.sizeChange).toBe(20);
    });

    it('should return CLOSE_POSITIONS when LP position is empty', () => {
      const emptyLP: LPPosition = {
        ...lpPosition,
        token0Exposure: 0,
        token1Exposure: 0,
        totalValueUSD: 0
      };
      const result = determineHedgeAction(emptyLP, hedgePosition, 0.1, 10);
      expect(result.action).toBe(HedgingAction.CLOSE_POSITIONS);
      expect(result.sizeChange).toBe(100); // Size of hedge to close
    });

    it('should return INCREASE_SHORT for new hedge when no hedge exists', () => {
      const result = determineHedgeAction(lpPosition, null, 0.1, 10);
      expect(result.action).toBe(HedgingAction.INCREASE_SHORT);
      expect(result.sizeChange).toBe(100); // Full LP exposure
    });
  });

  // Test isFundingRateAcceptable
  describe('isFundingRateAcceptable', () => {
    it('should accept funding rates within tolerance', () => {
      expect(isFundingRateAcceptable(0.002, 0.005)).toBe(true);
      expect(isFundingRateAcceptable(-0.002, 0.005)).toBe(true);
      expect(isFundingRateAcceptable(0, 0.005)).toBe(true);
    });

    it('should reject funding rates outside tolerance', () => {
      expect(isFundingRateAcceptable(0.006, 0.005)).toBe(false);
      expect(isFundingRateAcceptable(-0.006, 0.005)).toBe(false);
    });
  });
});