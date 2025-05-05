/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPublicClient, http, getContract, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import dotenv from 'dotenv';
import chalk from 'chalk'; // For colorized console output

// Load environment variables
dotenv.config();

// ABIs for testing
const IUniswapV3PoolABI = parseAbi([
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function fee() external view returns (uint24)',
]);

const ERC20ABI = parseAbi([
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function balanceOf(address owner) external view returns (uint256)',
]);

const NonfungiblePositionManagerABI = parseAbi([
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
]);

// Position Manager address on Arbitrum
const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

// Helper for console output
const printHeader = (title: string) => {
  console.log(chalk.bgBlue.white(`\n==== ${title} ====`));
};

const printSection = (title: string) => {
  console.log(chalk.cyan(`\n--- ${title} ---`));
};

const printPositionData = (label: string, value: any, unit: string = '') => {
  const valueStr = typeof value === 'number' 
    ? value.toLocaleString(undefined, { maximumFractionDigits: 8 })
    : value.toString();
  console.log(`${chalk.yellow(label.padEnd(20))}: ${chalk.green(valueStr)} ${unit}`);
};

// Calculate price from tick
function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

// Calculate approximate values in position based on liquidity and price ranges
function calculatePositionValues(
  liquidity: bigint,
  tickLower: number,
  tickUpper: number,
  currentTick: number,
  token0Decimals: number,
  token1Decimals: number
): { amount0: number, amount1: number } {
  // Convert to prices
  const sqrtPriceLower = Math.sqrt(tickToPrice(tickLower));
  const sqrtPriceUpper = Math.sqrt(tickToPrice(tickUpper));
  const sqrtPriceCurrent = Math.sqrt(tickToPrice(currentTick));
  
  // Calculate token amounts based on liquidity and price ranges
  let amount0 = 0;
  let amount1 = 0;
  
  if (currentTick <= tickLower) {
    // All liquidity in token0
    amount0 = Number(liquidity) * (1 / sqrtPriceLower - 1 / sqrtPriceUpper);
    amount1 = 0;
  } else if (currentTick >= tickUpper) {
    // All liquidity in token1
    amount0 = 0;
    amount1 = Number(liquidity) * (sqrtPriceUpper - sqrtPriceLower);
  } else {
    // Liquidity in both tokens
    amount0 = Number(liquidity) * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper);
    amount1 = Number(liquidity) * (sqrtPriceCurrent - sqrtPriceLower);
  }
  
  // Adjust for decimals
  amount0 = amount0 / (10 ** token0Decimals);
  amount1 = amount1 / (10 ** token1Decimals);
  
  return { amount0, amount1 };
}

describe('LP Position Balance Tests', () => {
  // Test configuration
  const rpcUrl = process.env.ARBITRUM_RPC || 'https://arbitrum-one.public.blastapi.io';
  const poolAddress = process.env.PENDLE_USDT_UniswapV3Pool as `0x${string}`;
  const walletAddress = process.env.HOYT_WALLET as `0x${string}`;
  
  // Skip tests if configuration is missing
  const skipTests = !poolAddress || !walletAddress;
  
  // Create Viem client
  const client = createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl),
  });
  
  beforeAll(async () => {
    if (skipTests) {
      console.warn('Skipping LP Position tests due to missing configuration');
      return;
    }
    
    printHeader('LP POSITION BALANCE TEST SUITE');
    console.log(chalk.white(`Testing LP positions for wallet: ${walletAddress}`));
    console.log(chalk.white(`Pool address: ${poolAddress}`));
    console.log(chalk.white(`RPC URL: ${rpcUrl}`));
  });
  
  it('should check for LP positions in the wallet and analyze balance', async () => {
    if (skipTests) return;
    
    printHeader('LP POSITION CHECK');
    
    // Get NFT Position Manager contract
    const positionManagerContract = getContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: NonfungiblePositionManagerABI,
      publicClient: client,
    });
    
    printSection('Checking for NFT positions');
    // Check if wallet has any positions
    const positionCount = await positionManagerContract.read.balanceOf([walletAddress]);
    console.log(`Found ${positionCount} position NFTs in wallet`);
    
    if (positionCount === 0n) {
      console.log(chalk.yellow('No LP positions found in this wallet.'));
      // This is not a failure, just info
      return;
    }
    
    // Get the pool contract to retrieve token info
    const poolContract = getContract({
      address: poolAddress,
      abi: IUniswapV3PoolABI,
      publicClient: client,
    });
    
    // Get token addresses from pool
    const token0Address = await poolContract.read.token0();
    const token1Address = await poolContract.read.token1();
    
    // Get token contracts
    const token0Contract = getContract({
      address: token0Address,
      abi: ERC20ABI,
      publicClient: client,
    });
    
    const token1Contract = getContract({
      address: token1Address,
      abi: ERC20ABI,
      publicClient: client,
    });
    
    // Get token details
    const [token0Symbol, token1Symbol, token0Decimals, token1Decimals] = await Promise.all([
      token0Contract.read.symbol(),
      token1Contract.read.symbol(),
      token0Contract.read.decimals(),
      token1Contract.read.decimals(),
    ]);
    
    // Get current pool state
    const slot0 = await poolContract.read.slot0();
    const currentTick = Number(slot0[1]);
    const currentSqrtPriceX96 = slot0[0];
    
    // Calculate current price
    const Q96 = 2n ** 96n;
    const rawPrice = (currentSqrtPriceX96 * currentSqrtPriceX96 * 10n ** BigInt(token0Decimals)) / 
                    (Q96 * Q96 * 10n ** BigInt(token1Decimals));
    const currentPrice = Number(rawPrice);
    
    printSection('Pool Information');
    printPositionData('Token0', token0Symbol);
    printPositionData('Token1', token1Symbol);
    printPositionData('Current Tick', currentTick);
    printPositionData('Current Price', currentPrice, `${token1Symbol} per ${token0Symbol}`);
    
    // Analyze each position
    for (let i = 0; i < Number(positionCount); i++) {
      const tokenId = await positionManagerContract.read.tokenOfOwnerByIndex([walletAddress, BigInt(i)]);
      
      printSection(`Position #${i+1} (Token ID: ${tokenId})`);
      
      // Get position details
      const positionData = await positionManagerContract.read.positions([tokenId]);
      
      // Check if this position is for our target pool
      const positionToken0 = positionData[2];
      const positionToken1 = positionData[3];
      const _positionFee = positionData[4];
      
      const isTargetPool = (
        (positionToken0.toLowerCase() === token0Address.toLowerCase() && 
         positionToken1.toLowerCase() === token1Address.toLowerCase()) ||
        (positionToken0.toLowerCase() === token1Address.toLowerCase() && 
         positionToken1.toLowerCase() === token0Address.toLowerCase())
      );
      
      if (!isTargetPool) {
        console.log(chalk.yellow(`Position #${i+1} is not for the target pool, skipping...`));
        continue;
      }
      
      // Extract position details
      const tickLower = Number(positionData[5]);
      const tickUpper = Number(positionData[6]);
      const liquidity = positionData[7];
      const tokensOwed0 = positionData[10];
      const tokensOwed1 = positionData[11];
      
      // Check if position is in range
      const inRange = currentTick >= tickLower && currentTick <= tickUpper;
      
      // Calculate price boundaries
      const priceLower = tickToPrice(tickLower);
      const priceUpper = tickToPrice(tickUpper);
      
      // Adjust for decimals
      const adjustedPriceLower = priceLower * (10 ** token0Decimals) / (10 ** token1Decimals);
      const adjustedPriceUpper = priceUpper * (10 ** token0Decimals) / (10 ** token1Decimals);
      
      // Calculate token amounts in position
      const { amount0, amount1 } = calculatePositionValues(
        liquidity,
        tickLower,
        tickUpper,
        currentTick,
        token0Decimals,
        token1Decimals
      );
      
      // Calculate USD values (assuming token1 is a stablecoin or using currentPrice)
      const value0 = amount0 * currentPrice;
      const value1 = amount1;
      const totalValue = value0 + value1;
      
      // Calculate balance percentage
      const balance0Percent = totalValue > 0 ? (value0 / totalValue) * 100 : 0;
      const balance1Percent = totalValue > 0 ? (value1 / totalValue) * 100 : 0;
      
      // Unclaimed fees
      const unclaimedFee0 = Number(tokensOwed0) / (10 ** token0Decimals);
      const unclaimedFee1 = Number(tokensOwed1) / (10 ** token1Decimals);
      const unclaimedFee0Value = unclaimedFee0 * currentPrice;
      const unclaimedFee1Value = unclaimedFee1;
      const totalUnclaimedValue = unclaimedFee0Value + unclaimedFee1Value;
      
      // Print detailed position information
      printPositionData('Liquidity', liquidity.toString());
      printPositionData('In Range', inRange ? chalk.green('YES') : chalk.red('NO'));
      
      printPositionData('Tick Lower', tickLower);
      printPositionData('Tick Upper', tickUpper);
      printPositionData('Price Lower', adjustedPriceLower, `${token1Symbol} per ${token0Symbol}`);
      printPositionData('Price Upper', adjustedPriceUpper, `${token1Symbol} per ${token0Symbol}`);
      
      console.log('');
      printPositionData(`${token0Symbol} Amount`, amount0, token0Symbol);
      printPositionData(`${token1Symbol} Amount`, amount1, token1Symbol);
      printPositionData(`${token0Symbol} Value`, value0.toFixed(2), 'USD');
      printPositionData(`${token1Symbol} Value`, value1.toFixed(2), 'USD');
      printPositionData('Total Value', totalValue.toFixed(2), 'USD');
      
      // Print balance analysis
      printSection('Balance Analysis');
      printPositionData(`${token0Symbol} Percentage`, balance0Percent.toFixed(2), '%');
      printPositionData(`${token1Symbol} Percentage`, balance1Percent.toFixed(2), '%');
      
      // Evaluate balance
      let balanceStatus = '';
      const balanceDiff = Math.abs(balance0Percent - balance1Percent);
      
      if (balanceDiff < 10) {
        balanceStatus = chalk.green('WELL BALANCED') + ' (< 10% difference)';
      } else if (balanceDiff < 30) {
        balanceStatus = chalk.yellow('MODERATELY BALANCED') + ' (10-30% difference)';
      } else {
        balanceStatus = chalk.red('IMBALANCED') + ' (> 30% difference)';
      }
      
      printPositionData('Balance Status', balanceStatus);
      
      // Print unclaimed fees
      if (unclaimedFee0 > 0 || unclaimedFee1 > 0) {
        printSection('Unclaimed Fees');
        printPositionData(`${token0Symbol} Unclaimed`, unclaimedFee0, token0Symbol);
        printPositionData(`${token1Symbol} Unclaimed`, unclaimedFee1, token1Symbol);
        printPositionData('Total Unclaimed', totalUnclaimedValue.toFixed(2), 'USD');
      }
      
      // Hedging recommendation - this is what the HOYT bot would need to hedge
      printSection('Hedging Requirements');
      printPositionData(`${token0Symbol} to Hedge`, token0Symbol === 'PENDLE' ? amount0 : 0, token0Symbol);
      printPositionData(`${token1Symbol} to Hedge`, token1Symbol === 'PENDLE' ? amount1 : 0, token1Symbol);
      
      const pendleAmount = token0Symbol === 'PENDLE' ? amount0 : amount1;
      const pendleValue = token0Symbol === 'PENDLE' ? value0 : value1;
      
      printPositionData('Total PENDLE Value', pendleValue.toFixed(2), 'USD');
      console.log(chalk.blue(`\nHOYT Bot should hedge ${pendleAmount.toFixed(6)} PENDLE worth $${pendleValue.toFixed(2)}`));
    }
    
    // This test doesn't fail - it just provides information
    expect(true).toBe(true);
  });
  
  afterAll(() => {
    if (skipTests) return;
    printHeader('LP POSITION TESTS COMPLETED');
  });
});