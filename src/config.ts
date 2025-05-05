import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Helper to safely get environment variables
function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${name} is not set`);
  }
  
  return value;
}

// Helper to safely get numeric environment variables
function getNumericEnvVar(name: string, defaultValue?: number): number {
  const value = process.env[name];
  
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${name} is not set`);
  }
  
  const numValue = Number(value);
  if (isNaN(numValue)) {
    throw new Error(`Environment variable ${name} is not a valid number`);
  }
  
  return numValue;
}

// Export configuration object
export const config = {
  // Network and addresses
  uniswapPool: getEnvVar('PENDLE_USDT_UniswapV3Pool'),
  walletAddress: getEnvVar('HOYT_WALLET'),
  privateKey: getEnvVar('HOYT_WALLET_PK'),
  rpc: getEnvVar('ARBITRUM_RPC'),
  
  // Trading parameters
  pairTicker: getEnvVar('PAIR_TICKER', 'PENDLE-USDT'),
  pendlePerpTicker: getEnvVar('PAIR_TICKER', 'PENDLE-USDT').split('-')[0] + '-PERP',
  rebalanceThreshold: getNumericEnvVar('TRASHOLD_REBALANCE', 5) / 100, // Convert percentage to decimal
  fundingTolerance: getNumericEnvVar('TRASHOLD_FUNDING', 0.5) / 100,   // Convert percentage to decimal
  slippageTolerance: getNumericEnvVar('TRASHOLD_SLIPPAGE', 0.5) / 100, // Convert percentage to decimal
  
  // Hyperliquid
  hyperliquidSigningKey: getEnvVar('HYPERLIQUID_PK'),
  hyperliquidApiEndpoint: getEnvVar('HYPERLIQUID_API', 'https://api.hyperliquid.xyz'),
  
  // Investment settings
  lpInvestment: getNumericEnvVar('INVESTMENT_IN_POOL', 100),
  hyperliquidMargin: getNumericEnvVar('HYPERLIQUID_INVESTMENT', 20),
  
  // Execution settings
  checkIntervalMs: getNumericEnvVar('CHECK_INTERVAL_MS', 60000), // Default 1 minute
};

export default config;