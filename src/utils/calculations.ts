import { formatUnits } from 'viem';
import { LPPosition, HyperliquidPosition, HedgingAction } from '../types';
import logger from '../logger';

/**
 * Formats a token amount based on its decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number): number {
  return Number(formatUnits(amount, decimals));
}

/**
 * Calculate the USD value based on token amount and price
 */
export function calculateUsdValue(amount: number, price: number): number {
  return amount * price;
}

/**
 * Calculates the optimal hedge size for a given LP position
 * For a 50/50 pool, we want to hedge the token0 (PENDLE) exposure 
 */
export function calculateRequiredHedgeSize(lpPosition: LPPosition): number {
  // We assume token0 is PENDLE - this is what we need to hedge
  return lpPosition.token0Exposure;
}

/**
 * Calculates the current deviation percentage between LP exposure and hedge
 * Returns a percentage (e.g., 5.2 for 5.2%)
 */
export function calculateDeviation(
  lpPendleExposure: number, 
  hedgeSize: number
): number {
  // If there's no hedge
  if (hedgeSize === 0 || Math.abs(hedgeSize) < 0.000001) {
    // If there's no hedge but we have exposure, that's 100% deviation
    return lpPendleExposure > 0 ? 100 : 0;
  }
  
  // Calculate deviation percentage
  const deviation = Math.abs(lpPendleExposure - hedgeSize) / hedgeSize * 100;
  return parseFloat(deviation.toFixed(2));
}

/**
 * Determines what hedge action to take based on current positions
 */
export function determineHedgeAction(
  lpPosition: LPPosition, 
  hedgePosition: HyperliquidPosition | null,
  rebalanceThreshold: number,
  _pendlePrice: number
): { action: HedgingAction, sizeChange: number } {
  // If no LP position, close any hedge positions 
  if (!lpPosition || lpPosition.totalValueUSD === 0) {
    return {
      action: HedgingAction.CLOSE_POSITIONS,
      sizeChange: hedgePosition ? Math.abs(hedgePosition.size) : 0
    };
  }
  
  // Calculate required hedge size based on LP position
  const requiredHedgeSize = calculateRequiredHedgeSize(lpPosition);
  
  // If no hedge position yet, and we need one, increase short
  if (!hedgePosition && requiredHedgeSize > 0) {
    logger.debug(`No hedge yet. Need to short ${requiredHedgeSize.toFixed(2)} USD worth of PENDLE`);
    return {
      action: HedgingAction.INCREASE_SHORT,
      sizeChange: requiredHedgeSize
    };
  }
  
  // If we have both positions, check for rebalance needs
  if (hedgePosition) {
    const currentHedgeSize = Math.abs(hedgePosition.size);
    const deviation = Math.abs(requiredHedgeSize - currentHedgeSize) / requiredHedgeSize;
    
    logger.debug(`Current hedge: ${currentHedgeSize.toFixed(2)} USD, Required: ${requiredHedgeSize.toFixed(2)} USD`);
    logger.debug(`Deviation: ${(deviation * 100).toFixed(2)}%, Threshold: ${(rebalanceThreshold * 100).toFixed(2)}%`);
    
    // If deviation exceeds threshold, rebalance
    if (deviation > rebalanceThreshold) {
      if (requiredHedgeSize > currentHedgeSize) {
        // Need to increase short
        const sizeChange = requiredHedgeSize - currentHedgeSize;
        return {
          action: HedgingAction.INCREASE_SHORT,
          sizeChange
        };
      } else {
        // Need to decrease short
        const sizeChange = currentHedgeSize - requiredHedgeSize;
        return {
          action: HedgingAction.DECREASE_SHORT,
          sizeChange
        };
      }
    }
  }
  
  // Default: no action needed
  return {
    action: HedgingAction.NO_ACTION,
    sizeChange: 0
  };
}

/**
 * Calculates the token amount from USD value and price
 */
export function calculateTokenAmount(usdValue: number, tokenPrice: number): number {
  return usdValue / tokenPrice;
}

/**
 * Calculates if the funding rate makes it worth keeping the position
 */
export function isFundingRateAcceptable(
  fundingRate: number, 
  fundingTolerance: number
): boolean {
  // Funding rate is typically given as daily percentage
  // We check if it's within our tolerance
  return Math.abs(fundingRate) <= fundingTolerance;
}