import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAppStore } from '../../src/store/appStore';
import { GateDirection } from '../../src/types';

const BRAND = '#2A5C33';
const LEAF = '#5CB85C';

type Result = {
  direction: GateDirection;
  user_name: string;
};

export default function ClientGateScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, serverUrl } = useAppStore();
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
      const res = await fetch(`${baseUrl}/api/gate/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber: currentUser.id_number, institutionId: currentUser.institution_id }),
      });
      const json = await res.json();
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
      <View style={{ flex: 1, backgroundColor: '#F4F9F4', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="person-circle-outline" size={56} color="#C8DFC5" />
        <Text style={{ fontSize: 15, fontWeight: '700', color: BRAND, marginTop: 16, textAlign: 'center' }}>
          You need to be logged in to check in or out.
        </Text>
      </View>
    );
  }

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F4F9F4', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <StatusBar barStyle="dark-content" />
        <Ionicons name="camera-outline" size={56} color="#C8DFC5" />
        <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND, marginTop: 16, marginBottom: 8 }}>
          Camera Permission Needed
        </Text>
        <Text style={{ fontSize: 13, color: '#7A9A7E', textAlign: 'center', marginBottom: 24 }}>
          Camera access is required to scan the library gate QR.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: LEAF, borderRadius: 16, paddingHorizontal: 32, paddingVertical: 14 }}
          onPress={requestPermission}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <CameraView
        style={{ flex: 1 }}
        pointerEvents="none"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? undefined : handleBarcodeScan}
      />

      {/* Top bar */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16,
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>Gate Check-in</Text>
        <Text style={{ color: '#A8D5A2', fontSize: 12, marginTop: 2 }}>
          Logged in as {currentUser.name}
        </Text>
      </View>

      {/* Scan frame */}
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
        <View style={{
          width: 220, height: 220, borderWidth: 2, borderRadius: 16,
          borderColor: scanning ? '#F59E0B' : LEAF,
        }} />
        <Text style={{ color: scanning ? '#F59E0B' : '#FFFFFF', fontSize: 13, fontWeight: '500', marginTop: 14 }}>
          {scanning ? 'Processing…' : 'Scan the gate QR at the entrance'}
        </Text>
      </View>

      {/* Result toast */}
      {result && (
        <View style={{
          position: 'absolute', bottom: insets.bottom + 120, left: 20, right: 20,
          backgroundColor: result.direction === 'in' ? BRAND : '#D97706',
          borderRadius: 16, padding: 20, alignItems: 'center', gap: 8,
        }}>
          <Ionicons
            name={result.direction === 'in' ? 'log-in-outline' : 'log-out-outline'}
            size={36}
            color="#FFFFFF"
          />
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>
            {result.direction === 'in' ? 'Checked IN' : 'Checked OUT'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{result.user_name}</Text>
        </View>
      )}

      {/* Error toast */}
      {error && !result && (
        <View style={{
          position: 'absolute', bottom: insets.bottom + 120, left: 20, right: 20,
          backgroundColor: '#DC2626', borderRadius: 16, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <Ionicons name="alert-circle-outline" size={24} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', flex: 1 }}>{error}</Text>
        </View>
      )}

      {/* Processing spinner */}
      {scanning && !result && !error && (
        <View style={{
          position: 'absolute', bottom: insets.bottom + 120, left: 20, right: 20,
          backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>Logging attendance…</Text>
        </View>
      )}
    </View>
  );
}
