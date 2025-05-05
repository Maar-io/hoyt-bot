/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from 'crypto';
import config from '../config';
import logger from '../logger';
import { HyperliquidPosition, HyperliquidOrder, HyperliquidOrderResponse, HyperliquidMarketData } from '../types';

/**
 * Client for interacting with Hyperliquid API
 */
export class HyperliquidClient {
  private apiEndpoint: string;
  private signingKey: string;
  
  constructor() {
    this.apiEndpoint = config.hyperliquidApiEndpoint;
    this.signingKey = config.hyperliquidSigningKey;
  }
  
  /**
   * Sign a request using HMAC SHA-256
   * @param data - The data to sign
   * @returns Signature in hex
   */
  private signRequest(data: string): string {
    const hmac = createHmac('sha256', this.signingKey);
    hmac.update(data);
    return hmac.digest('hex');
  }
  
  /**
   * Generate a nonce for API requests
   */
  private generateNonce(): string {
    return Date.now().toString();
  }
  
  /**
   * Make an API request to Hyperliquid with retries and robust error handling
   */
  private async makeRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST', 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any,
    retries = 3
  ): Promise<T> {
    const url = `${this.apiEndpoint}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (method === 'POST' && data) {
      // Add signature for POST requests
      const nonce = this.generateNonce();
      const payload = JSON.stringify(data);
      
      // Create payload to sign: nonce + payload
      const signatureData = `${nonce}${payload}`;
      
      try {
        const signature = this.signRequest(signatureData);
        headers['X-HL-Signature'] = signature;
        headers['X-HL-Nonce'] = nonce;
      } catch (signError) {
        logger.error(`Failed to sign request: ${signError}`);
        throw new Error(`Request signing failed: ${(signError as Error).message}`);
      }
    }
    
    // Implement retry logic
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: method === 'POST' ? JSON.stringify(data) : undefined,
          // Add timeout for network requests
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }
        
        const responseData = await response.json();
        
        // Basic validation of response data structure
        if (responseData === null || responseData === undefined) {
          throw new Error('API returned null or undefined response');
        }
        
        return responseData as T;
      } catch (error) {
        lastError = error as Error;
        
        // Different backoff strategy depending on error type
        const isNetworkError = 
          error instanceof TypeError || 
          (error as Error).message.includes('network') ||
          (error as Error).message.includes('abort') ||
          (error as Error).message.includes('timeout');
        
        if (isNetworkError && attempt < retries) {
          // Exponential backoff for network errors
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.warn(`Network error, retrying in ${backoffMs}ms... (${attempt}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        
        // For non-network errors, or if we've exhausted retries
        logger.error(`Hyperliquid API request failed after ${attempt} attempts: ${error}`);
        throw error;
      }
    }
    
    // If we get here, all retries failed
    throw lastError || new Error('Request failed for unknown reason');
  }
  
  /**
   * Get current market data for a coin
   */
  async getMarketData(coin: string = config.pendlePerpTicker): Promise<HyperliquidMarketData> {
    try {
      const response = await this.makeRequest<any>('/market/data', 'GET');
      
      // Find the specific coin data
      const coinData = response.markets.find((market: any) => market.coin === coin);
      
      if (!coinData) {
        throw new Error(`Market data not found for coin: ${coin}`);
      }
      
      return {
        coin,
        price: parseFloat(coinData.mark),
        fundingRate: parseFloat(coinData.funding) // Assuming daily funding rate
      };
    } catch (error) {
      logger.error(`Failed to get market data for ${coin}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Get current positions
   */
  async getPositions(): Promise<HyperliquidPosition[]> {
    try {
      const response = await this.makeRequest<any>('/user/positions', 'GET');
      
      // Handle empty response or no positions
      if (!response.positions || !Array.isArray(response.positions) || response.positions.length === 0) {
        return [];
      }
      
      // Parse and convert to our interface
      return response.positions.map((pos: any) => {
        const size = parseFloat(pos.size || '0'); // Handle potential null/undefined
        
        return {
          coin: pos.coin,
          entryPrice: parseFloat(pos.entryPrice || '0'),
          size: size, // Size in USD
          side: size > 0 ? 'LONG' : 'SHORT',
          leverage: parseFloat(pos.leverage || '1'),
          marginUsd: parseFloat(pos.margin || '0'),
          markPrice: parseFloat(pos.markPrice || '0'),
          unrealizedPnl: parseFloat(pos.unrealizedPnl || '0'),
          liquidationPrice: parseFloat(pos.liquidationPrice || '0')
        };
      });
    } catch (error) {
      logger.error(`Failed to get positions: ${error}`);
      throw error;
    }
  }
  
  /**
   * Get a specific position by coin
   */
  async getPosition(coin: string = config.pendlePerpTicker): Promise<HyperliquidPosition | null> {
    try {
      const positions = await this.getPositions();
      return positions.find(pos => pos.coin === coin) || null;
    } catch (error) {
      logger.error(`Failed to get position for ${coin}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Place an order
   */
  async placeOrder(order: HyperliquidOrder): Promise<HyperliquidOrderResponse> {
    try {
      const requestData = {
        action: {
          type: order.orderType.toLowerCase(),
          coin: order.coin,
          side: order.side,
          size: order.size.toString(),
          price: order.price ? order.price.toString() : null, // For limit orders
          reduceOnly: order.reduceOnly
        }
      };
      
      const response = await this.makeRequest<any>('/trade', 'POST', requestData);
      
      if (response.status === 'success') {
        logger.trade(`Order placed successfully for ${order.coin}`, {
          side: order.side,
          size: order.size,
          type: order.orderType
        });
        
        return {
          status: 'success',
          order,
          id: response.id
        };
      } else {
        return {
          status: 'error',
          error: response.error || 'Unknown error'
        };
      }
    } catch (error) {
      logger.error(`Failed to place order: ${error}`);
      return {
        status: 'error',
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Place a market order to open/increase a short position
   */
  async openShortPosition(
    coin: string, 
    sizeUsd: number
  ): Promise<HyperliquidOrderResponse> {
    return this.placeOrder({
      coin,
      side: 'SELL',
      size: sizeUsd,
      price: null, // Market order
      orderType: 'MARKET',
      reduceOnly: false
    });
  }
  
  /**
   * Place a market order to reduce a short position
   */
  async reduceShortPosition(
    coin: string, 
    sizeUsd: number
  ): Promise<HyperliquidOrderResponse> {
    return this.placeOrder({
      coin,
      side: 'BUY',
      size: sizeUsd,
      price: null, // Market order
      orderType: 'MARKET',
      reduceOnly: true
    });
  }
  
  /**
   * Close all positions for a coin
   */
  async closePosition(coin: string): Promise<HyperliquidOrderResponse> {
    const position = await this.getPosition(coin);
    
    if (!position || position.size === 0) {
      return {
        status: 'success',
        order: undefined,
        id: undefined
      };
    }
    
    const side = position.side === 'LONG' ? 'SELL' : 'BUY';
    const sizeAbs = Math.abs(position.size);
    
    return this.placeOrder({
      coin,
      side,
      size: sizeAbs,
      price: null, // Market order
      orderType: 'MARKET',
      reduceOnly: true
    });
  }
}

export default HyperliquidClient;