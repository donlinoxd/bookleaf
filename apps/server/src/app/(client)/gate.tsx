import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAppStore } from '../../src/store/appStore';
import { clientFetch } from '../../src/services/clientApi';
import { GateDirection } from '@bookleaf/types';

const BRAND = '#2A5C33';
const LEAF = '#5CB85C';

type Result = {
  direction: GateDirection;
  user_name: string;
};

export default function ClientGateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser } = useAppStore();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scannedRef = useRef(false);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    scannedRef.current = false;
    setScanning(false);
    setResult(null);
    setError(null);
  }, []));

  const showResult = (r: Result) => {
    setResult(r);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setResult(null), 4000);
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scannedRef.current || !currentUser) return;

    // Only handle URLs that look like gate check-in links
    if (!data.includes('/gate')) return;

    scannedRef.current = true;
    setScanning(true);
    setError(null);

    // Derive base server URL from the scanned URL (strip path)
    let baseUrl: string;
    try {
      const parsed = new URL(data);
      baseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
      setError('Invalid QR code.');
      scannedRef.current = false;
      setScanning(false);
      return;
    }

    try {
      const res = await clientFetch(`${baseUrl}/api/gate/log`, { method: 'POST' });
      const json = await res.json();
      if (res.status === 401) {
        setError('Your session expired. Please sign in again.');
        return;
      }
      if (!res.ok || json.error) {
        setError(json.error ?? 'Check-in failed.');
        return;
      }
      showResult({ direction: json.direction, user_name: json.user_name });
    } catch {
      setError('Cannot reach the library server.');
    } finally {
      setTimeout(() => {
        scannedRef.current = false;
        setScanning(false);
      }, 2000);
    }
  };

  if (!currentUser) {
    return (
      <View className="flex-1 bg-[#F4F9F4] items-center justify-center px-8 gap-4">
        <View className="w-16 h-16 bg-mint rounded-2xl items-center justify-center">
          <Ionicons name="qr-code-outline" size={36} color="#2A5C33" />
        </View>
        <View className="items-center gap-1">
          <Text className="text-base font-bold text-[#1C2B1E]">Sign in to use Gate</Text>
          <Text className="text-sm text-[#7A9A7E] text-center">You need to be signed in to check in or out at the library gate.</Text>
        </View>
        <TouchableOpacity
          className="bg-leaf rounded-2xl px-8 py-3.5 mt-2"
          onPress={() => router.push('/(auth)/client-login')}
          style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
        >
          <Text className="text-white font-bold">Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-[#F4F9F4] items-center justify-center px-8">
        <StatusBar barStyle="dark-content" />
        <Ionicons name="camera-outline" size={56} color="#C8DFC5" />
        <Text className="text-base font-extrabold text-brand mt-4 mb-2">
          Camera Permission Needed
        </Text>
        <Text className="text-[13px] text-[#7A9A7E] text-center mb-6">
          Camera access is required to scan the library gate QR.
        </Text>
        <TouchableOpacity
          className="bg-leaf rounded-2xl px-8 py-[14px]"
          onPress={requestPermission}
        >
          <Text className="text-white font-bold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <CameraView
        style={{ flex: 1 }}
        pointerEvents="none"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? undefined : handleBarcodeScan}
      />

      {/* Top bar */}
      <View
        className="absolute top-0 left-0 right-0 px-5 pb-4 bg-black/55"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Text className="text-white text-[17px] font-extrabold">Gate Check-in</Text>
        <Text className="text-[#A8D5A2] text-xs mt-0.5">
          Logged in as {currentUser.name}
        </Text>
      </View>

      {/* Scan frame */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="absolute inset-0 bg-black/35" />
        <View
          className="w-[220px] h-[220px] border-2 rounded-2xl"
          style={{ borderColor: scanning ? '#F59E0B' : LEAF }}
        />
        <Text
          className="text-[13px] font-medium mt-[14px]"
          style={{ color: scanning ? '#F59E0B' : '#FFFFFF' }}
        >
          {scanning ? 'Processing…' : 'Scan the gate QR at the entrance'}
        </Text>
      </View>

      {/* Result toast */}
      {result && (
        <View
          className="absolute left-5 right-5 rounded-2xl p-5 items-center gap-2"
          style={{
            bottom: insets.bottom + 120,
            backgroundColor: result.direction === 'in' ? BRAND : '#D97706',
          }}
        >
          <Ionicons
            name={result.direction === 'in' ? 'log-in-outline' : 'log-out-outline'}
            size={36}
            color="#FFFFFF"
          />
          <Text className="text-white text-lg font-extrabold">
            {result.direction === 'in' ? 'Checked IN' : 'Checked OUT'}
          </Text>
          <Text className="text-[rgba(255,255,255,0.8)] text-[13px]">{result.user_name}</Text>
        </View>
      )}

      {/* Error toast */}
      {error && !result && (
        <View
          className="absolute left-5 right-5 bg-red-600 rounded-2xl p-4 flex-row items-center gap-3"
          style={{ bottom: insets.bottom + 120 }}
        >
          <Ionicons name="alert-circle-outline" size={24} color="#FFFFFF" />
          <Text className="text-white text-[13px] font-bold flex-1">{error}</Text>
        </View>
      )}

      {/* Processing spinner */}
      {scanning && !result && !error && (
        <View
          className="absolute left-5 right-5 bg-black/65 rounded-2xl p-4 flex-row items-center gap-3"
          style={{ bottom: insets.bottom + 120 }}
        >
          <ActivityIndicator color="#FFFFFF" />
          <Text className="text-white text-[13px] font-semibold">Logging attendance…</Text>
        </View>
      )}
    </View>
  );
}
