/**
 * Utilities for handling sensitive information securely
 */

/**
 * Mask a sensitive string for display in logs
 * @param sensitiveString The sensitive string to mask
 * @param visibleChars Number of characters to show at start and end
 * @returns Masked string
 */
export function maskSensitiveString(
    sensitiveString: string, 
    visibleChars = 4
  ): string {
    if (!sensitiveString || sensitiveString.length <= visibleChars * 2) {
      return '******';
    }
    
    const start = sensitiveString.slice(0, visibleChars);
    const end = sensitiveString.slice(-visibleChars);
    const maskLength = Math.max(sensitiveString.length - (visibleChars * 2), 6);
    const mask = '*'.repeat(maskLength);
    
    return `${start}${mask}${end}`;
  }
  
  /**
   * Mask an address or key for display
   * @param address The address or key to mask
   * @returns Masked address or key
   */
  export function maskAddress(address: string): string {
    if (!address || address.length < 10) {
      return '******';
    }
    
    // For Ethereum-style addresses
    if (address.startsWith('0x')) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    
    // For other long strings
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }
  
  /**
   * Validates a private key
   * @param privateKey The private key to validate
   * @returns True if the private key is valid
   */
  export function isValidPrivateKey(privateKey: string): boolean {
    // Basic validation for Ethereum private keys
    // Remove '0x' prefix if present
    const key = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    
    // Check if it's a valid hex string of the right length
    const isHex = /^[0-9a-fA-F]+$/.test(key);
    const correctLength = key.length === 64; // 32 bytes = 64 hex chars
    
    return isHex && correctLength;
  }
  
  /**
   * Securely compare two strings in constant time
   * This prevents timing attacks when comparing secrets
   * @param a First string
   * @param b Second string
   * @returns True if strings are equal
   */
  export function secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
  
  /**
   * Validates an API key
   * @param apiKey The API key to validate
   * @returns True if the API key appears valid
   */
  export function isValidApiKey(apiKey: string): boolean {
    // Most API keys are at least 10 chars and alphanumeric with possible special chars
    if (!apiKey || apiKey.length < 10) {
      return false;
    }
    
    // Check for obviously invalid characters or patterns
    const containsInvalidChars = /[\s<>]/.test(apiKey);
    
    return !containsInvalidChars;
  }
  
  export default {
    maskSensitiveString,
    maskAddress,
    isValidPrivateKey,
    isValidApiKey,
    secureCompare
  };