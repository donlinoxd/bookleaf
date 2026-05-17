import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQueryClient } from '@tanstack/react-query';
import { GateService } from '../../src/services/GateService';
import { UserService } from '../../src/services/UserService';
import { useAppStore } from '../../src/store/appStore';
import { queryKeys } from '../../src/lib/queryKeys';
import { GateDirection } from '../../src/types';

const BRAND = '#2A5C33';
const LEAF = '#5CB85C';

type Toast = {
  name: string;
  direction: GateDirection;
};

export default function GateScanScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const institution = useAppStore((s) => s.institution);
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();

  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scannedRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    scannedRef.current = false;
    setScanning(false);
    setToast(null);
    setError(null);
  }, []));

  const showToast = (t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scannedRef.current || !institution) return;
    scannedRef.current = true;
    setScanning(true);
    setError(null);

    try {
      const user = await UserService.getByIdNumber(data);
      if (!user || !user.is_active) {
        setError('Member not found or inactive.');
        return;
      }
      const result = await GateService.logEntry(user.id, institution.id, 'manual');
      queryClient.invalidateQueries({ queryKey: queryKeys.gateTodayLogs(institution.id) });
      showToast({ name: user.name, direction: result.direction });
    } catch {
      setError('Failed to log entry. Try again.');
    } finally {
      setTimeout(() => {
        scannedRef.current = false;
        setScanning(false);
      }, 1800);
    }
  };

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F4F9F4', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <StatusBar barStyle="dark-content" />
        <Ionicons name="camera-outline" size={56} color="#C8DFC5" />
        <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND, marginTop: 16, marginBottom: 8 }}>Camera Permission Needed</Text>
        <Text style={{ fontSize: 13, color: '#7A9A7E', textAlign: 'center', marginBottom: 24 }}>
          Camera access is required to scan member QR codes.
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
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}>
        <View>
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>Gate Scanner</Text>
          <Text style={{ color: '#A8D5A2', fontSize: 11, marginTop: 1 }}>Scan a member QR card to log in or out</Text>
        </View>
        <TouchableOpacity
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
          onPress={() => router.push('/(server)/gate-qr')}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Gate QR</Text>
        </TouchableOpacity>
      </View>

      {/* Scan frame */}
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
        <View style={{
          width: 220, height: 220, borderWidth: 2, borderRadius: 16,
          borderColor: scanning ? '#F59E0B' : LEAF,
        }} />
        <Text style={{ color: scanning ? '#F59E0B' : '#FFFFFF', fontSize: 13, fontWeight: '500', marginTop: 14 }}>
          {scanning ? 'Processing…' : 'Point at member QR code'}
        </Text>
      </View>

      {/* Toast — check in/out confirmation */}
      {toast && (
        <View style={{
          position: 'absolute', bottom: insets.bottom + 120, left: 20, right: 20,
          backgroundColor: toast.direction === 'in' ? BRAND : '#D97706',
          borderRadius: 16, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons
              name={toast.direction === 'in' ? 'log-in-outline' : 'log-out-outline'}
              size={24}
              color="#FFFFFF"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>{toast.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }}>
              {toast.direction === 'in' ? 'Checked IN' : 'Checked OUT'}
            </Text>
          </View>
        </View>
      )}

      {/* Error toast */}
      {error && !toast && (
        <View style={{
          position: 'absolute', bottom: insets.bottom + 120, left: 20, right: 20,
          backgroundColor: '#DC2626', borderRadius: 16, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <Ionicons name="alert-circle-outline" size={24} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', flex: 1 }}>{error}</Text>
        </View>
      )}

      {/* Processing spinner overlay */}
      {scanning && !toast && !error && (
        <View style={{
          position: 'absolute', bottom: insets.bottom + 120, left: 20, right: 20,
          backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>Looking up member…</Text>
        </View>
      )}
    </View>
  );
}
