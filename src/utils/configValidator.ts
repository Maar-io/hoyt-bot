import { config } from '../config';
import logger from '../logger';
import { isValidPrivateKey, isValidApiKey, maskAddress } from './secureUtils';

/**
 * Validates critical configuration settings
 * @returns True if configuration is valid
 */
export function validateConfig(): boolean {
  const validations: { [key: string]: boolean } = {};
  let isValid = true;
  
  // Validate RPC URL
  validations.rpc = Boolean(config.rpc) && typeof config.rpc === 'string' && config.rpc.startsWith('http');
  if (!validations.rpc) {
    logger.error('Invalid RPC URL. Must start with http:// or https://');
    isValid = false;
  }
  
  // Validate wallet address
  validations.walletAddress = Boolean(
    config.walletAddress && 
    config.walletAddress.startsWith('0x') && 
    config.walletAddress.length === 42
  );
  if (!validations.walletAddress) {
    logger.error('Invalid wallet address. Must be a valid Ethereum address (0x...)');
    isValid = false;
  } else {
    logger.debug(`Using wallet address: ${maskAddress(config.walletAddress)}`);
  }
  
  // Validate private key if one is provided
  if (config.privateKey) {
    validations.privateKey = isValidPrivateKey(config.privateKey);
    if (!validations.privateKey) {
      logger.error('Invalid private key. Must be a valid 32-byte hex string');
      isValid = false;
    }
  }
  
  // Validate Uniswap pool address
  validations.uniswapPool = Boolean(
    config.uniswapPool && 
    config.uniswapPool.startsWith('0x') && 
    config.uniswapPool.length === 42
  );
  if (!validations.uniswapPool) {
    logger.error('Invalid Uniswap pool address. Must be a valid Ethereum address (0x...)');
    isValid = false;
  } else {
    logger.debug(`Using Uniswap pool: ${maskAddress(config.uniswapPool)}`);
  }
  
  // Validate hyperliquid signing key
  validations.hyperliquidSigningKey = Boolean(
    config.hyperliquidSigningKey && 
    isValidApiKey(config.hyperliquidSigningKey)
  );
  if (!validations.hyperliquidSigningKey) {
    logger.error('Invalid Hyperliquid signing key');
    isValid = false;
  }
  
  // Validate hyperliquid API endpoint
  validations.hyperliquidApiEndpoint = Boolean(
    config.hyperliquidApiEndpoint && 
    config.hyperliquidApiEndpoint.startsWith('http')
  );
  if (!validations.hyperliquidApiEndpoint) {
    logger.error('Invalid Hyperliquid API endpoint. Must start with http:// or https://');
    isValid = false;
  }
  
  // Validate trading parameters
  validations.rebalanceThreshold = config.rebalanceThreshold > 0 && config.rebalanceThreshold < 1;
  if (!validations.rebalanceThreshold) {
    logger.error('Invalid rebalance threshold. Must be between 0 and 1');
    isValid = false;
  }
  
  validations.fundingTolerance = config.fundingTolerance > 0 && config.fundingTolerance < 1;
  if (!validations.fundingTolerance) {
    logger.error('Invalid funding tolerance. Must be between 0 and 1');
    isValid = false;
  }
  
  validations.slippageTolerance = config.slippageTolerance > 0 && config.slippageTolerance < 1;
  if (!validations.slippageTolerance) {
    logger.error('Invalid slippage tolerance. Must be between 0 and 1');
    isValid = false;
  }
  
  // Validate check interval (at least 5 seconds)
  validations.checkIntervalMs = config.checkIntervalMs >= 5000;
  if (!validations.checkIntervalMs) {
    logger.error('Invalid check interval. Must be at least 5000ms (5 seconds)');
    isValid = false;
  }
  
  // Log validation results
  if (isValid) {
    logger.info('Configuration validation passed');
  } else {
    logger.critical('Configuration validation failed', new Error('Invalid configuration'));
    logger.info('Validation details:', validations);
  }
  
  return isValid;
}

export default validateConfig;