/* eslint-disable max-len */
/* eslint-disable no-case-declarations */
import config from '../config';
import logger from '../logger';
import { LPPosition, HyperliquidPosition, HedgingAction, ExecutionResult, HyperliquidMarketData } from '../types';
import { determineHedgeAction, calculateDeviation, isFundingRateAcceptable } from '../utils/calculations';
import { HyperliquidClient } from './hyperliquidClient';

/**
 * Controller for managing hedge positions
 */
export class HedgeController {
  private hyperliquidClient: HyperliquidClient;
  private pendlePerpTicker: string;
  
  constructor() {
    this.hyperliquidClient = new HyperliquidClient();
    this.pendlePerpTicker = config.pendlePerpTicker;
  }
  
  /**
   * Get current market data including price and funding
   */
  async getMarketData(): Promise<HyperliquidMarketData> {
    try {
      return await this.hyperliquidClient.getMarketData(this.pendlePerpTicker);
    } catch (error) {
      logger.error(`Failed to get market data: ${error}`);
      // Return default data for fallback
      return {
        coin: this.pendlePerpTicker,
        price: 0,
        fundingRate: 0,
      };
    }
  }
  
  /**
   * Get current hedge position
   */
  async getHedgePosition(): Promise<HyperliquidPosition | null> {
    try {
      return await this.hyperliquidClient.getPosition(this.pendlePerpTicker);
    } catch (error) {
      logger.error(`Failed to get hedge position: ${error}`);
      return null;
    }
  }
  
  /**
   * Check if it's economical to maintain the hedge position
   * based on funding rates
   */
  async checkFundingRate(): Promise<boolean> {
    try {
      const marketData = await this.getMarketData();
      const isFundingAcceptable = isFundingRateAcceptable(
        marketData.fundingRate, 
        config.fundingTolerance,
      );
      
      if (!isFundingAcceptable) {
        logger.warn(
          `Funding rate (${marketData.fundingRate.toFixed(4)}%) exceeds tolerance (${(config.fundingTolerance * 100).toFixed(2)}%)`,
        );
      }
      
      return isFundingAcceptable;
    } catch (error) {
      logger.error(`Failed to check funding rate: ${error}`);
      return true; // Default to true to avoid closing positions on error
    }
  }
  
  /**
   * Update hedge position based on current LP position
   */
  async updateHedgePosition(
    lpPosition: LPPosition,
  ): Promise<ExecutionResult> {
    try {
      // Get current hedge position and market data
      const [hedgePosition, marketData] = await Promise.all([
        this.getHedgePosition(),
        this.getMarketData(),
      ]);
      
      const currentPrice = marketData.price;
      
      // Determine what action to take
      const { action, sizeChange } = determineHedgeAction(
        lpPosition,
        hedgePosition,
        config.rebalanceThreshold,
        currentPrice,
      );
      
      // Calculate current deviation
      const lpExposure = lpPosition.token0Exposure;
      const hedgeSize = hedgePosition ? Math.abs(hedgePosition.size) : 0;
      const deviation = calculateDeviation(lpExposure, hedgeSize);
      
      logger.info('Current position status:', {
        lpExposure: lpExposure.toFixed(2),
        hedgeSize: hedgeSize.toFixed(2),
        deviation: `${deviation.toFixed(2)}%`,
        rebalanceThreshold: `${(config.rebalanceThreshold * 100).toFixed(2)}%`,
        action,
      });
      
      // Execute the appropriate action
      switch (action) {
        case HedgingAction.NO_ACTION:
          return {
            success: true,
            action,
            details: 'No rebalance needed.',
            timestamp: Date.now(),
          };
          
        case HedgingAction.INCREASE_SHORT:
          // Check funding rate before increasing position
          const isFundingAcceptable = await this.checkFundingRate();
          
          if (!isFundingAcceptable) {
            return {
              success: false,
              action,
              details: 'Funding rate exceeds tolerance. Skipping hedge increase.',
              timestamp: Date.now(),
            };
          }
          
          logger.trade(`Increasing short position by ${sizeChange.toFixed(2)} USD`);
          
          const increaseResult = await this.hyperliquidClient.openShortPosition(
            this.pendlePerpTicker,
            sizeChange,
          );
          
          if (increaseResult.status === 'success') {
            return {
              success: true,
              action,
              details: `Increased short position by ${sizeChange.toFixed(2)} USD`,
              timestamp: Date.now(),
            };
          } else {
            return {
              success: false,
              action,
              error: increaseResult.error || 'Unknown error increasing short position',
              timestamp: Date.now(),
            };
          }
          
        case HedgingAction.DECREASE_SHORT:
          logger.trade(`Decreasing short position by ${sizeChange.toFixed(2)} USD`);
          
          const decreaseResult = await this.hyperliquidClient.reduceShortPosition(
            this.pendlePerpTicker,
            sizeChange,
          );
          
          if (decreaseResult.status === 'success') {
            return {
              success: true,
              action,
              details: `Decreased short position by ${sizeChange.toFixed(2)} USD`,
              timestamp: Date.now(),
            };
          } else {
            return {
              success: false,
              action,
              error: decreaseResult.error || 'Unknown error decreasing short position',
              timestamp: Date.now(),
            };
          }
          
        case HedgingAction.CLOSE_POSITIONS:
          logger.trade(`Closing all positions for ${this.pendlePerpTicker}`);
          
          const closeResult = await this.hyperliquidClient.closePosition(
            this.pendlePerpTicker,
          );
          
          if (closeResult.status === 'success') {
            return {
              success: true,
              action,
              details: `Closed all positions for ${this.pendlePerpTicker}`,
              timestamp: Date.now(),
            };
          } else {
            return {
              success: false,
              action,
              error: closeResult.error || 'Unknown error closing positions',
              timestamp: Date.now(),
            };
          }
      }
    } catch (error) {
      logger.error(`Failed to update hedge position: ${error}`);
      
      return {
        success: false,
        action: HedgingAction.NO_ACTION,
        error: (error as Error).message,
        timestamp: Date.now(),
      };
    }
  }
}

export default HedgeController;