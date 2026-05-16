import { Platform, NativeModules } from 'react-native';

/**
 * Returns the device's local Wi-Fi IP address.
 * On Android, uses the NetworkInfo native module.
 * Falls back gracefully if unavailable.
 */
export async function getLocalIpAddress(): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      const { NetworkInfo } = NativeModules;
      if (NetworkInfo?.getIPAddress) {
        return new Promise((resolve, reject) => {
          NetworkInfo.getIPAddress(resolve, reject);
        });
      }
    }
  } catch {
    // fall through to placeholder
  }
  return '0.0.0.0';
}
