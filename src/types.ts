// LP Position types
export interface LPPosition {
    liquidityAmount: bigint;
    token0Amount: bigint;
    token1Amount: bigint;
    token0Address: string;
    token1Address: string;
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
    token0Exposure: number; // USD value of token0
    token1Exposure: number; // USD value of token1
    totalValueUSD: number;
  }
  
  // Uniswap V3 Position NFT data
  export interface UniswapV3Position {
    id: number;
    poolAddress: string;
    tickLower: number;
    tickUpper: number;
    liquidity: bigint;
  }
  
  // Hyperliquid types
  export interface HyperliquidPosition {
    coin: string;     // e.g., "PENDLE"
    entryPrice: number;
    size: number;     // Size of position in USD
    side: 'LONG' | 'SHORT';
    leverage: number;
    marginUsd: number;
    markPrice: number;
    unrealizedPnl: number;
    liquidationPrice: number;
  }
  
  export interface HyperliquidOrder {
    coin: string;
    side: 'BUY' | 'SELL';
    size: number;
    price: number | null;  // null for market orders
    orderType: 'LIMIT' | 'MARKET';
    reduceOnly: boolean;
  }
  
  export interface HyperliquidOrderResponse {
    status: 'success' | 'error';
    order?: HyperliquidOrder;
    id?: string;
    error?: string;
  }
  
  export interface HyperliquidMarketData {
    coin: string;
    price: number;
    fundingRate: number; // Current funding rate (daily)
  }
  
  // Bot execution status
  export enum BotStatus {
    INITIALIZED = 'INITIALIZED',
    RUNNING = 'RUNNING',
    STOPPED = 'STOPPED',
    ERROR = 'ERROR'
  }
  
  // Hedging actions
  export enum HedgingAction {
    INCREASE_SHORT = 'INCREASE_SHORT',
    DECREASE_SHORT = 'DECREASE_SHORT',
    NO_ACTION = 'NO_ACTION',
    CLOSE_POSITIONS = 'CLOSE_POSITIONS'
  }
  
  // Execution types
  export interface ExecutionResult {
    success: boolean;
    action: HedgingAction;
    details?: string;
    error?: string;
    timestamp: number;
  }
  
  // Dashboard data
  export interface BotState {
    status: BotStatus;
    lastCheck: number;  // timestamp
    lpPosition: LPPosition | null;
    hedgePosition: HyperliquidPosition | null;
    pendlePrice: number;
    deviation: number;  // Current deviation between LP and hedge
    lastAction: ExecutionResult | null;
    errors: string[];
  }