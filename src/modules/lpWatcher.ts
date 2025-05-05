import { createPublicClient, http, getContract, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import config from '../config';
import logger from '../logger';
import { LPPosition, UniswapV3Position } from '../types';
import { formatTokenAmount, calculateUsdValue } from '../utils/calculations';
import { createContractError } from '../utils/errorHandler';

// ABIs - Simplified for demonstration
const IUniswapV3PoolABI = parseAbi([
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
]);

const ERC20ABI = parseAbi([
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function balanceOf(address owner) external view returns (uint256)',
]);

const NonfungiblePositionManagerABI = parseAbi([
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
]);

// Address of the Uniswap V3 Position Manager NFT contract on Arbitrum
const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

/**
 * Class for monitoring Uniswap V3 LP positions
 */
export class LPWatcher {
  private client;
  private poolAddress: `0x${string}`;
  private positionManagerContract;
  private token0Address: `0x${string}` | null = null;
  private token1Address: `0x${string}` | null = null;
  private token0Symbol: string | null = null;
  private token1Symbol: string | null = null;
  private token0Decimals: number | null = null;
  private token1Decimals: number | null = null;
  
  constructor() {
    // Ensure the pool address is in the correct format
    this.poolAddress = config.uniswapPool as `0x${string}`;
    
    // Create Viem client for Arbitrum
    this.client = createPublicClient({
      chain: arbitrum,
      transport: http(config.rpc)
    });
    
    // Create contract instance for position manager
    this.positionManagerContract = getContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: NonfungiblePositionManagerABI,
      publicClient: this.client,
    });
  }
  
  /**
   * Initialize pool data - fetch token addresses, symbols, decimals
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`Initializing LP Watcher for pool: ${this.poolAddress}`);
      
      // Create contract instance for the pool
      const poolContract = getContract({
        address: this.poolAddress,
        abi: IUniswapV3PoolABI,
        publicClient: this.client,
      });
      
      // Get token addresses
      this.token0Address = await poolContract.read.token0() as `0x${string}`;
      this.token1Address = await poolContract.read.token1() as `0x${string}`;
      
      logger.debug(`Pool tokens: ${this.token0Address} / ${this.token1Address}`);
      
      // Get token info for token0
      const token0Contract = getContract({
        address: this.token0Address,
        abi: ERC20ABI,
        publicClient: this.client,
      });
      
      this.token0Symbol = await token0Contract.read.symbol();
      this.token0Decimals = await token0Contract.read.decimals();
      
      // Get token info for token1
      const token1Contract = getContract({
        address: this.token1Address,
        abi: ERC20ABI,
        publicClient: this.client,
      });
      
      this.token1Symbol = await token1Contract.read.symbol();
      this.token1Decimals = await token1Contract.read.decimals();
      
      logger.info(`Pool initialized: ${this.token0Symbol}/${this.token1Symbol}`);
    } catch (error) {
      logger.error(`Failed to initialize LP Watcher: ${error}`);
      throw createContractError(
        'Failed to initialize LP Watcher', 
        { poolAddress: this.poolAddress },
        error as Error
      );
    }
  }
  
  /**
   * Get positions held by the wallet
   */
  async getWalletPositions(): Promise<UniswapV3Position[]> {
    try {
      // Convert wallet address to proper format
      const walletAddress = config.walletAddress as `0x${string}`;
      
      // Get NFT balance for the wallet
      const balance = await this.positionManagerContract.read.balanceOf([walletAddress]);
      
      const positions: UniswapV3Position[] = [];
      
      // For each position NFT, get its details
      for (let i = 0; i < Number(balance); i++) {
        // Get token ID
        const tokenId = await this.positionManagerContract.read.tokenOfOwnerByIndex([
          walletAddress,
          BigInt(i)
        ]);
        
        // Get position details
        const position = await this.positionManagerContract.read.positions([tokenId]);
        
        // Only add positions in our target pool
        const positionPoolAddress = this.getPoolAddressFromTokens(
          position[2], // token0
          position[3], // token1
          BigInt(position[4])  // fee, convert to bigint
        );
        
        if (positionPoolAddress.toLowerCase() === this.poolAddress.toLowerCase()) {
          positions.push({
            id: Number(tokenId),
            poolAddress: positionPoolAddress,
            tickLower: Number(position[5]),
            tickUpper: Number(position[6]),
            liquidity: position[7]
          });
        }
      }
      
      return positions;
    } catch (error) {
      logger.error(`Failed to get wallet positions: ${error}`);
      throw createContractError(
        'Failed to get wallet positions', 
        { walletAddress: config.walletAddress },
        error as Error
      );
    }
  }
  
  /**
   * Calculate amounts of tokens in LP position
   * This is a simplified calculation and may not be perfectly accurate
   */
  async getLPPositionDetails(
    position: UniswapV3Position,
    tokenPrice: number
  ): Promise<LPPosition> {
    try {
      if (!this.token0Address || !this.token1Address || 
          !this.token0Symbol || !this.token1Symbol ||
          this.token0Decimals === null || this.token1Decimals === null) {
        await this.initialize();
      }
      
      // Create pool contract instance
      const poolContract = getContract({
        address: this.poolAddress,
        abi: IUniswapV3PoolABI,
        publicClient: this.client,
      });
      
      // Get current tick
      const slot0 = await poolContract.read.slot0();
      const currentTick = Number(slot0[1]);
      
      // Basic calculation of token amounts in position
      // For a precise calculation, use Uniswap SDK or subgraph
      // This is an approximation
      let token0Amount = 0n;
      let token1Amount = 0n;
      
      // If position is in range
      if (position.tickLower <= currentTick && currentTick <= position.tickUpper) {
        // Calculate approximate amounts based on liquidity
        // This is not precise but gives a rough estimate
        const sqrtPriceX96 = slot0[0];
        
        // This is a simplification and not accurate for all cases
        const liquidity = position.liquidity;
        const decimals0 = this.token0Decimals ?? 18; // Default to 18 if null
        const decimals1 = this.token1Decimals ?? 6;  // Default to 6 if null
        token0Amount = (liquidity * 10n ** BigInt(decimals0)) / sqrtPriceX96;
        token1Amount = (liquidity * sqrtPriceX96) / 10n ** BigInt(decimals1);
      }
      
      // Convert to number using proper decimals
      const token0Formatted = formatTokenAmount(token0Amount, this.token0Decimals ?? 18);
      const token1Formatted = formatTokenAmount(token1Amount, this.token1Decimals ?? 6);
      
      // Calculate USD values
      // Assuming token0 is PENDLE and token1 is USDT (or stable)
      const token0Exposure = calculateUsdValue(token0Formatted, tokenPrice);
      const token1Exposure = token1Formatted; // Assuming USDT has 1:1 USD value
      
      const totalValueUSD = token0Exposure + token1Exposure;
      
      return {
        liquidityAmount: position.liquidity,
        token0Amount,
        token1Amount,
        token0Address: this.token0Address || '' as `0x${string}`,
        token1Address: this.token1Address || '' as `0x${string}`,
        token0Symbol: this.token0Symbol || '',
        token1Symbol: this.token1Symbol || '',
        token0Decimals: this.token0Decimals ?? 18,
        token1Decimals: this.token1Decimals ?? 6,
        token0Exposure,
        token1Exposure,
        totalValueUSD
      };
    } catch (error) {
      logger.error(`Failed to get LP position details: ${error}`);
      throw createContractError(
        'Failed to get LP position details', 
        { positionId: position.id },
        error as Error
      );
    }
  }
  
  /**
   * Get combined LP position details across all positions
   */
  async getCombinedLPPosition(tokenPrice: number): Promise<LPPosition> {
    try {
      // Ensure we're initialized
      if (!this.token0Address || !this.token1Address) {
        await this.initialize();
      }
      
      const positions = await this.getWalletPositions();
      
      // Default empty position
      const emptyPosition: LPPosition = {
        liquidityAmount: 0n,
        token0Amount: 0n,
        token1Amount: 0n,
        token0Address: this.token0Address || '' as `0x${string}`,
        token1Address: this.token1Address || '' as `0x${string}`,
        token0Symbol: this.token0Symbol || '',
        token1Symbol: this.token1Symbol || '',
        token0Decimals: this.token0Decimals !== null ? this.token0Decimals : 18,
        token1Decimals: this.token1Decimals !== null ? this.token1Decimals : 6,
        token0Exposure: 0,
        token1Exposure: 0,
        totalValueUSD: 0
      };
      
      if (positions.length === 0) {
        // Return empty position if no positions found
        return emptyPosition;
      }
      
      // Get details for each position with error handling
      const positionDetailsPromises = positions.map(async (pos) => {
        try {
          return await this.getLPPositionDetails(pos, tokenPrice);
        } catch (error) {
          logger.error(`Failed to get details for position ${pos.id}: ${error}`);
          // Return an empty position on error to avoid breaking the whole process
          return emptyPosition;
        }
      });
      
      const positionDetails = await Promise.all(positionDetailsPromises);
      const validPositions = positionDetails.filter(pos => pos !== null);
      
      if (validPositions.length === 0) {
        return emptyPosition;
      }
      
      // Combine all positions with safer calculations
      const combined: LPPosition = {
        liquidityAmount: validPositions.reduce((sum, pos) => sum + pos.liquidityAmount, 0n),
        token0Amount: validPositions.reduce((sum, pos) => sum + pos.token0Amount, 0n),
        token1Amount: validPositions.reduce((sum, pos) => sum + pos.token1Amount, 0n),
        token0Address: this.token0Address || '' as `0x${string}`,
        token1Address: this.token1Address || '' as `0x${string}`,
        token0Symbol: this.token0Symbol || '',
        token1Symbol: this.token1Symbol || '',
        token0Decimals: this.token0Decimals !== null ? this.token0Decimals : 18,
        token1Decimals: this.token1Decimals !== null ? this.token1Decimals : 6,
        token0Exposure: validPositions.reduce((sum, pos) => sum + pos.token0Exposure, 0),
        token1Exposure: validPositions.reduce((sum, pos) => sum + pos.token1Exposure, 0),
        totalValueUSD: validPositions.reduce((sum, pos) => sum + pos.totalValueUSD, 0)
      };
      
      return combined;
    } catch (error) {
      logger.error(`Failed to get combined LP position: ${error}`);
      // Return empty position on error rather than throwing
      return {
        liquidityAmount: 0n,
        token0Amount: 0n,
        token1Amount: 0n,
        token0Address: this.token0Address || '' as `0x${string}`,
        token1Address: this.token1Address || '' as `0x${string}`,
        token0Symbol: this.token0Symbol || '',
        token1Symbol: this.token1Symbol || '',
        token0Decimals: this.token0Decimals !== null ? this.token0Decimals : 18,
        token1Decimals: this.token1Decimals !== null ? this.token1Decimals : 6,
        token0Exposure: 0,
        token1Exposure: 0,
        totalValueUSD: 0
      };
    }
  }
  
  /**
   * Derive pool address from tokens and fee
   * For a production implementation, you would use the UniswapV3 factory contract
   * to get the actual pool address based on the tokens and fee.
   * 
   * NOTE: This is a simplified version that checks if the tokens match our pool tokens.
   * In a production environment, implement the full algorithm or use the factory contract.
   */
  private getPoolAddressFromTokens(
    token0: `0x${string}`, 
    token1: `0x${string}`, 
    _fee: bigint
  ): `0x${string}` {
    // Check if these are the tokens we're interested in
    if (this.token0Address && this.token1Address) {
      // Check if the tokens match our known pool tokens (in either order)
      const tokensMatch = (
        (token0.toLowerCase() === this.token0Address.toLowerCase() && 
         token1.toLowerCase() === this.token1Address.toLowerCase()) ||
        (token0.toLowerCase() === this.token1Address.toLowerCase() && 
         token1.toLowerCase() === this.token0Address.toLowerCase())
      );
      
      if (tokensMatch) {
        return this.poolAddress;
      }
    }
    
    // For unknown token combinations, return empty string
    // This will cause the position to be filtered out
    return '0x0000000000000000000000000000000000000000';
  }
}

export default LPWatcher;