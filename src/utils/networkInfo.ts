import * as Network from 'expo-network';

/**
 * Returns the device's local Wi-Fi IPv4 address, or '0.0.0.0' if unavailable.
 */
export async function getLocalIpAddress(): Promise<string> {
  try {
    return await Network.getIpAddressAsync();
  } catch {
    return '0.0.0.0';
  }
}
