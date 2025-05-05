import config from './config';
import logger from './logger';
import { LPWatcher } from './modules/lpWatcher';
import { HedgeController } from './modules/hedgeController';
import { BotStatus, BotState, HedgingAction } from './types';
import validateConfig from './utils/configValidator';
import { setupGlobalErrorHandlers } from './utils/errorHandler';

/**
 * HOYT Bot - Delta Neutral Hedging/Farming Bot
 * Main controller that coordinates LP position monitoring and hedge management
 */
class HoytBot {
  private lpWatcher: LPWatcher;
  private hedgeController: HedgeController;
  private state: BotState;
  private interval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.lpWatcher = new LPWatcher();
    this.hedgeController = new HedgeController();
    
    // Initialize state
    this.state = {
      status: BotStatus.INITIALIZED,
      lastCheck: 0,
      lpPosition: null,
      hedgePosition: null,
      pendlePrice: 0,
      deviation: 0,
      lastAction: null,
      errors: []
    };
  }
  
  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    try {
      logger.status('Initializing HOYT Bot...');
      
      // Validate configuration
      const isConfigValid = validateConfig();
      if (!isConfigValid) {
        throw new Error('Invalid configuration. Please check your .env file.');
      }
      
      // Initialize LP Watcher
      await this.lpWatcher.initialize();
      
      // Get initial market data
      const marketData = await this.hedgeController.getMarketData();
      this.state.pendlePrice = marketData.price;
      
      logger.info(`Initial PENDLE price: ${marketData.price.toFixed(4)}`);
      logger.info(`Current funding rate: ${marketData.fundingRate.toFixed(4)}%`);
      
      // Get initial positions
      await this.updatePositions();
      
      this.state.status = BotStatus.INITIALIZED;
      logger.status('HOYT Bot initialized successfully!');
    } catch (error) {
      this.state.status = BotStatus.ERROR;
      this.state.errors.push((error as Error).message);
      logger.critical('Failed to initialize bot', error as Error);
      throw error;
    }
  }
  
  /**
   * Start the bot monitoring and hedging loop with retry mechanism
   */
  async start(): Promise<void> {
    try {
      logger.status('Starting HOYT Bot...');
      
      // Make sure bot is initialized
      if (this.state.status === BotStatus.INITIALIZED) {
        // Execute first check immediately
        try {
          await this.executeCheck();
        } catch (firstCheckError) {
          logger.error(`First check failed but continuing: ${firstCheckError}`);
        }
        
        // Set up interval with a wrapped executeCheck that won't crash the interval
        this.interval = setInterval(() => {
          this.executeCheck().catch(intervalError => {
            logger.error(`Check cycle error in interval: ${intervalError}`);
            this.state.errors.push(`Interval error: ${(intervalError as Error).message}`);
          });
        }, config.checkIntervalMs);
        
        // Set up an error count monitor that can restart the bot if too many consecutive errors
        let consecutiveErrorCount = 0;
        const maxConsecutiveErrors = 5;
        const _errorMonitor = setInterval(() => {
          if (this.state.errors.length > 0) {
            // If we have new errors since last check
            consecutiveErrorCount++;
            if (consecutiveErrorCount >= maxConsecutiveErrors) {
              logger.critical(`${maxConsecutiveErrors} consecutive errors detected, restarting bot...`);
              this.restart();
              consecutiveErrorCount = 0;
            }
          } else {
            consecutiveErrorCount = 0;
          }
          // Clear old errors to avoid memory leaks
          if (this.state.errors.length > 50) {
            this.state.errors = this.state.errors.slice(-20);
          }
        }, config.checkIntervalMs * 5);
        
        this.state.status = BotStatus.RUNNING;
        logger.status(`HOYT Bot is running. Checking every ${config.checkIntervalMs / 1000} seconds.`);
      } else {
        throw new Error('Bot must be initialized before starting');
      }
    } catch (error) {
      this.state.status = BotStatus.ERROR;
      this.state.errors.push((error as Error).message);
      logger.critical('Failed to start bot', error as Error);
      throw error;
    }
  }
  
  /**
   * Restart the bot after errors
   */
  private async restart(): Promise<void> {
    logger.status('Restarting HOYT Bot...');
    
    // Stop current execution
    this.stop();
    
    // Reset error state
    this.state.errors = [];
    this.state.status = BotStatus.INITIALIZED;
    
    // Attempt to re-initialize
    try {
      await this.initialize();
      await this.start();
      logger.status('HOYT Bot successfully restarted!');
    } catch (error) {
      this.state.status = BotStatus.ERROR;
      this.state.errors.push(`Restart failed: ${(error as Error).message}`);
      logger.critical('Failed to restart bot', error as Error);
    }
  }
  
  /**
   * Stop the bot
   */
  stop(): void {
    logger.status('Stopping HOYT Bot...');
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.state.status = BotStatus.STOPPED;
    logger.status('HOYT Bot stopped.');
  }
  
  /**
   * Execute a single check and rebalance cycle
   */
  async executeCheck(): Promise<void> {
    try {
      logger.info('Executing check cycle...');
      this.state.lastCheck = Date.now();
      
      // Update positions and market data - wrap in try/catch to handle failures
      try {
        await this.updatePositions();
      } catch (posError) {
        logger.error(`Failed to update positions: ${posError}`);
        this.state.errors.push(`Position update failed: ${(posError as Error).message}`);
        // Continue execution, but be aware positions may be stale
      }
      
      // Check if we need to rebalance - only if we have LP position
      if (this.state.lpPosition && this.state.lpPosition.totalValueUSD > 0) {
        try {
          const result = await this.hedgeController.updateHedgePosition(this.state.lpPosition);
          this.state.lastAction = result;
          
          if (result.success) {
            if (result.action !== HedgingAction.NO_ACTION) {
              logger.success(`Rebalance executed: ${result.details}`);
              
              // Update positions after rebalance - wrap in try/catch
              try {
                await this.updatePositions();
              } catch (updateError) {
                logger.error(`Failed to update positions after rebalance: ${updateError}`);
                // Continue execution with potentially stale position data
              }
            }
          } else {
            logger.error(`Rebalance failed: ${result.error}`);
            this.state.errors.push(result.error || 'Unknown error during rebalance');
          }
        } catch (hedgeError) {
          logger.error(`Hedge operation failed: ${hedgeError}`);
          this.state.errors.push(`Hedge operation error: ${(hedgeError as Error).message}`);
        }
      } else {
        logger.warn('No LP position found or position is empty. No hedging needed.');
      }
      
      // Log current state
      try {
        this.logState();
      } catch (logError) {
        logger.error(`Failed to log state: ${logError}`);
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error(`Check cycle failed: ${errorMessage}`);
      this.state.errors.push(errorMessage);
      
      // Don't change bot status to ERROR, just log the error and continue
    }
  }
  
  /**
   * Update position information from both LP and hedge
   */
  private async updatePositions(): Promise<void> {
    try {
      // Get market data first to get price
      let marketData;
      try {
        marketData = await this.hedgeController.getMarketData();
        // Guard against invalid market data
        if (!marketData || marketData.price <= 0) {
          logger.error('Received invalid market data with price <= 0');
          throw new Error('Invalid market data');
        }
        this.state.pendlePrice = marketData.price;
      } catch (marketError) {
        logger.error(`Failed to get market data: ${marketError}`);
        // If we can't get market data, we can't proceed with accurate position updates
        throw new Error(`Market data retrieval failed: ${(marketError as Error).message}`);
      }
      
      // Get positions with individual error handling for each source
      let lpPosition = null;
      let hedgePosition = null;
      
      try {
        lpPosition = await this.lpWatcher.getCombinedLPPosition(marketData.price);
      } catch (lpError) {
        logger.error(`Failed to get LP position: ${lpError}`);
        // Keep existing LP position if there's an error
        lpPosition = this.state.lpPosition;
      }
      
      try {
        hedgePosition = await this.hedgeController.getHedgePosition();
      } catch (hedgeError) {
        logger.error(`Failed to get hedge position: ${hedgeError}`);
        // Keep existing hedge position if there's an error
        hedgePosition = this.state.hedgePosition;
      }
      
      // Update state with what data we have
      this.state.lpPosition = lpPosition;
      this.state.hedgePosition = hedgePosition;
      
      // Calculate deviation with safer checks
      if (lpPosition && hedgePosition && hedgePosition.size !== 0) {
        const lpExposure = Math.max(0, lpPosition.token0Exposure);
        const hedgeSize = Math.abs(hedgePosition.size);
        
        if (hedgeSize > 0.000001) { // Avoid division by near-zero
          const deviation = Math.abs(lpExposure - hedgeSize) / hedgeSize * 100;
          this.state.deviation = parseFloat(deviation.toFixed(2));
        } else {
          this.state.deviation = lpExposure > 0 ? 100 : 0;
        }
      } else if (lpPosition && lpPosition.token0Exposure > 0) {
        // If we have LP exposure but no hedge
        this.state.deviation = 100;
      } else {
        this.state.deviation = 0;
      }
    } catch (error) {
      logger.error(`Failed to update positions: ${error}`);
      // Don't rethrow here to make position updates more resilient
      // But do indicate the error in the logs
    }
  }
  
  /**
   * Log the current state of the bot with safe handling of undefined values
   */
  private logState(): void {
    try {
      const state = this.state;
      
      logger.info('Current Bot State:');
      logger.info(`- Status: ${state.status}`);
      logger.info(`- PENDLE Price: ${(state.pendlePrice || 0).toFixed(4)}`);
      
      if (state.lpPosition) {
        logger.info(`- LP Position: ${state.lpPosition.totalValueUSD.toFixed(2)} total`);
        logger.info(`  - ${state.lpPosition.token0Symbol || 'Token0'}: ${state.lpPosition.token0Exposure.toFixed(2)}`);
        logger.info(`  - ${state.lpPosition.token1Symbol || 'Token1'}: ${state.lpPosition.token1Exposure.toFixed(2)}`);
      } else {
        logger.info('- LP Position: None');
      }
      
      if (state.hedgePosition) {
        const size = Math.abs(state.hedgePosition.size || 0);
        logger.info(`- Hedge Position: ${state.hedgePosition.side || 'UNKNOWN'} ${size.toFixed(2)}`);
        logger.info(`  - Entry Price: ${(state.hedgePosition.entryPrice || 0).toFixed(4)}`);
        logger.info(`  - Margin: ${(state.hedgePosition.marginUsd || 0).toFixed(2)}`);
        logger.info(`  - PnL: ${(state.hedgePosition.unrealizedPnl || 0).toFixed(2)}`);
      } else {
        logger.info('- Hedge Position: None');
      }
      
      logger.info(`- Deviation: ${(state.deviation || 0).toFixed(2)}%`);
      logger.info(`- Last Check: ${new Date(state.lastCheck || Date.now()).toISOString()}`);
      
      if (state.lastAction) {
        logger.info(`- Last Action: ${state.lastAction.action} (${state.lastAction.success ? 'Success' : 'Failed'})`);
        if (state.lastAction.details) {
          logger.info(`  - Details: ${state.lastAction.details}`);
        }
        if (state.lastAction.error) {
          logger.info(`  - Error: ${state.lastAction.error}`);
        }
      }
      
      if (state.errors && state.errors.length > 0) {
        logger.info(`- Recent Errors: ${state.errors.slice(-3).join(', ')}`);
      }
    } catch (error) {
      // If logging the state fails, log a simple message instead
      logger.error(`Failed to log state details: ${error}`);
    }
  }
  
  /**
   * Get the current bot state
   */
  getState(): BotState {
    return { ...this.state };
  }
}

/**
 * Main function to start the bot
 */
async function main() {
  try {
    // Set up global error handlers
    setupGlobalErrorHandlers();
    
    const bot = new HoytBot();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.status('Received SIGINT. Shutting down...');
      bot.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logger.status('Received SIGTERM. Shutting down...');
      bot.stop();
      process.exit(0);
    });
    
    // Initialize and start the bot
    await bot.initialize();
    await bot.start();
    
    logger.status('HOYT Bot running with configuration:');
    logger.status(`- Pool: ${config.uniswapPool}`);
    logger.status(`- Pair: ${config.pairTicker}`);
    logger.status(`- Hedge: ${config.pendlePerpTicker}`);
    logger.status(`- Rebalance Threshold: ${(config.rebalanceThreshold * 100).toFixed(2)}%`);
    logger.status(`- Funding Tolerance: ${(config.fundingTolerance * 100).toFixed(2)}%`);
    logger.status(`- Check Interval: ${config.checkIntervalMs / 1000}s`);
    
  } catch (error) {
    logger.critical('Failed to start HOYT Bot', error as Error);
    process.exit(1);
  }
}

// Run the bot
main();

export default HoytBot;