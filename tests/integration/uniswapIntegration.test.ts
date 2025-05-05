import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPublicClient, http, getContract, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import dotenv from 'dotenv';

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

// Utility function to print a divider with test name
function printTestDivider(testName: string) {
  const divider = '='.repeat(80);
  console.log(`\n${divider}`);
  console.log(`TEST: ${testName}`);
  console.log(`${divider}`);
}

describe('Uniswap Integration Tests', () => {
  // Test configuration
  const rpcUrl = process.env.ARBITRUM_RPC || 'https://arbitrum-one.public.blastapi.io';
  const poolAddress = process.env.PENDLE_USDT_UniswapV3Pool as `0x${string}`;
  
  // Skip tests if configuration is missing
  const skipTests = !poolAddress;

  // Create Viem client
  const client = createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl),
  });

  // Test variables
  let token0Address: `0x${string}`;
  let token1Address: `0x${string}`;
  let token0Symbol: string;
  let token1Symbol: string;
  let token0Decimals: number;
  let token1Decimals: number;
  
  beforeAll(async () => {
    if (skipTests) {
      console.warn('Skipping Uniswap tests due to missing configuration');
      return;
    }
    
    // Verify pool address is valid
    if (!poolAddress || !poolAddress.startsWith('0x') || poolAddress.length !== 42) {
      throw new Error('Invalid pool address format');
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('STARTING UNISWAP INTEGRATION TESTS');
    console.log(`${'='.repeat(80)}`);
    console.log('Test Configuration:');
    console.log(`- RPC URL: ${rpcUrl}`);
    console.log(`- Pool Address: ${poolAddress}`);
    console.log(`${'='.repeat(80)}\n`);
  });
  
  it('should connect to Arbitrum RPC', async () => {
    if (skipTests) return;
    
    printTestDivider('Arbitrum RPC Connection Test');
    console.log('Testing connection to Arbitrum RPC endpoint...');
    console.log(`RPC URL: ${rpcUrl}`);
    console.log('Querying current block number...');
    
    const blockNumber = await client.getBlockNumber();
    console.log(`Current Arbitrum block number: ${blockNumber}`);
    
    const chainId = await client.getChainId();
    console.log(`Chain ID: ${chainId} (${chainId === 42161 ? 'Arbitrum One' : 'Unknown'})`);
    
    expect(blockNumber).toBeGreaterThan(0n);
    console.log('RPC connection test PASSED ✅');
  });
  
  it('should fetch pool details from Uniswap', async () => {
    if (skipTests) return;
    
    printTestDivider('Uniswap Pool Details Test');
    console.log('Testing ability to fetch basic pool information...');
    console.log(`Pool Contract: ${poolAddress}`);
    console.log('Creating contract instance...');
    
    // Create contract instance for the pool
    const poolContract = getContract({
      address: poolAddress,
      abi: IUniswapV3PoolABI,
      publicClient: client,
    });
    
    console.log('Fetching token addresses...');
    // Test that we can fetch basic pool info
    token0Address = await poolContract.read.token0();
    token1Address = await poolContract.read.token1();
    
    console.log('Fetching pool fee...');
    const fee = await poolContract.read.fee();
    const feePercent = Number(fee) / 10000;
    
    console.log('Fetching pool liquidity...');
    const liquidity = await poolContract.read.liquidity();
    
    console.log('\nPool Information:');
    console.log(`- Token0: ${token0Address}`);
    console.log(`- Token1: ${token1Address}`);
    console.log(`- Fee: ${fee} (${feePercent}%)`);
    console.log(`- Liquidity: ${liquidity}`);
    
    expect(token0Address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(token1Address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(fee).toBeGreaterThan(0n);
    
    console.log('\nFetching current price information (slot0)...');
    // Test fetching slot0 data (current price and tick)
    const slot0 = await poolContract.read.slot0();
    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];
    const unlocked = slot0[6];
    
    console.log('Slot0 Data:');
    console.log(`- Current Tick: ${tick}`);
    console.log(`- sqrtPriceX96: ${sqrtPriceX96}`);
    console.log(`- Pool Unlocked: ${unlocked}`);
    
    expect(sqrtPriceX96).toBeGreaterThan(0n);
    console.log('\nPool details test PASSED ✅');
  });
  
  it('should fetch token details for both pool tokens', async () => {
    if (skipTests) return;
    if (!token0Address || !token1Address) {
      console.log('Skipping token details test due to missing token addresses');
      return;
    }
    
    printTestDivider('Token Details Test');
    console.log('Testing ability to fetch token details for pool tokens...');
    
    console.log('\nCreating contract instances for tokens...');
    // Create contract instances for the tokens
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
    
    console.log('Fetching token0 details...');
    // Fetch token details
    token0Symbol = await token0Contract.read.symbol();
    token0Decimals = await token0Contract.read.decimals();
    const token0Name = await token0Contract.read.name();
    
    console.log('Fetching token1 details...');
    token1Symbol = await token1Contract.read.symbol();
    token1Decimals = await token1Contract.read.decimals();
    const token1Name = await token1Contract.read.name();
    
    console.log('\nToken Information:');
    console.log('Token 0:');
    console.log(`- Address: ${token0Address}`);
    console.log(`- Name: ${token0Name}`);
    console.log(`- Symbol: ${token0Symbol}`);
    console.log(`- Decimals: ${token0Decimals}`);
    
    console.log('\nToken 1:');
    console.log(`- Address: ${token1Address}`);
    console.log(`- Name: ${token1Name}`);
    console.log(`- Symbol: ${token1Symbol}`);
    console.log(`- Decimals: ${token1Decimals}`);
    
    expect(token0Symbol).toBeTruthy();
    expect(token1Symbol).toBeTruthy();
    expect(token0Decimals).toBeGreaterThan(0);
    expect(token1Decimals).toBeGreaterThan(0);
    
    console.log('\nToken details test PASSED ✅');
  });
  
  it('should calculate approximate price from sqrtPriceX96', async () => {
    if (skipTests) return;
    if (!token0Decimals || !token1Decimals) {
      console.log('Skipping price calculation test due to missing token decimals');
      return;
    }
    
    printTestDivider('Price Calculation Test');
    console.log('Testing ability to calculate token price from sqrtPriceX96...');
    console.log('This is a crucial function for determining LP position value.');
    
    console.log('\nCreating pool contract instance...');
    // Create contract instance for the pool
    const poolContract = getContract({
      address: poolAddress,
      abi: IUniswapV3PoolABI,
      publicClient: client,
    });
    
    console.log('Fetching current price data from slot0...');
    // Get current price data
    const slot0 = await poolContract.read.slot0();
    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];
    
    console.log(`- sqrtPriceX96: ${sqrtPriceX96}`);
    console.log(`- Current Tick: ${tick}`);
    
    console.log('\nCalculating price from sqrtPriceX96...');
    console.log('Formula: price = (sqrtPriceX96 / 2^96)^2 * (10^token0Decimals / 10^token1Decimals)');
    // Calculate price from sqrtPriceX96
    const Q96 = 2n ** 96n;
    
    // Precise math with BigInt - using Math.pow would lose precision
    const price = (sqrtPriceX96 * sqrtPriceX96 * 10n ** BigInt(token0Decimals)) / 
                 (Q96 * Q96 * 10n ** BigInt(token1Decimals));
    
    // Calculate price directly from tick for comparison
    // price = 1.0001^tick
    const tickPrice = Math.pow(1.0001, Number(tick)) * 
                     (10 ** token0Decimals / 10 ** token1Decimals);
    
    console.log('\nPrice Results:');
    console.log(`- From sqrtPriceX96: 1 ${token0Symbol} = ${Number(price)} ${token1Symbol}`);
    console.log(`- From tick: 1 ${token0Symbol} = ${tickPrice.toFixed(8)} ${token1Symbol}`);
    console.log(`- Difference: ${Math.abs(Number(price) - tickPrice).toFixed(8)} ${token1Symbol}`);
    
    expect(Number(price)).toBeGreaterThan(0);
    console.log('\nPrice calculation test PASSED ✅');
  });
  
  it('should validate that PENDLE is one of the tokens', async () => {
    if (skipTests) return;
    if (!token0Symbol || !token1Symbol) {
      console.log('Skipping PENDLE validation test due to missing token symbols');
      return;
    }
    
    printTestDivider('PENDLE Token Validation Test');
    console.log('Testing if one of the pool tokens is PENDLE...');
    console.log('This is important for the bot which is designed to hedge PENDLE exposure.');
    
    // Check if one of the tokens is PENDLE
    const hasPendle = token0Symbol === 'PENDLE' || token1Symbol === 'PENDLE';
    const pendlePosition = token0Symbol === 'PENDLE' ? 'token0' : (token1Symbol === 'PENDLE' ? 'token1' : 'none');
    const otherToken = token0Symbol === 'PENDLE' ? token1Symbol : token0Symbol;
    
    console.log('\nPENDLE Token Check:');
    console.log(`- Pool contains PENDLE: ${hasPendle ? 'Yes ✅' : 'No ❌'}`);
    
    if (hasPendle) {
      console.log(`- PENDLE is the ${pendlePosition} in the pool`);
      console.log(`- Pool pair is PENDLE/${otherToken}`);
      
      // If PENDLE is token0, we need to hedge token0 exposure
      // If PENDLE is token1, we need to hedge token1 exposure
      console.log(`- Bot should hedge ${pendlePosition} exposure`);
    } else {
      console.log('- WARNING: Pool does not contain PENDLE token');
      console.log(`- Found token pair: ${token0Symbol}/${token1Symbol}`);
      console.log('- The bot is configured to hedge PENDLE exposure, but PENDLE was not found');
    }
    
    // This test is conditional based on the actual pool config
    if (process.env.REQUIRE_PENDLE_POOL === 'true') {
      expect(hasPendle).toBe(true);
      console.log('\nPENDLE validation test PASSED ✅');
    } else {
      console.log('\nPENDLE validation check complete (not enforced)');
    }
  });
  
  afterAll(() => {
    if (skipTests) return;
    console.log(`\n${'='.repeat(80)}`);
    console.log('COMPLETED UNISWAP INTEGRATION TESTS');
    console.log(`${'='.repeat(80)}\n`);
  });
});