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
import { GateDirection } from '@bookleaf/types';

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
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-[#F4F9F4] items-center justify-center px-8">
        <StatusBar barStyle="dark-content" />
        <Ionicons name="camera-outline" size={56} color="#C8DFC5" />
        <Text className="text-base font-extrabold text-brand mt-4 mb-2">Camera Permission Needed</Text>
        <Text className="text-[13px] text-[#7A9A7E] text-center mb-6">
          Camera access is required to scan member QR codes.
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
        className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-5 pb-4 bg-black/[0.55]"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View>
          <Text className="text-white text-[17px] font-extrabold">Gate Scanner</Text>
          <Text className="text-[#A8D5A2] text-[11px] mt-[1px]">Scan a member QR card to log in or out</Text>
        </View>
        <TouchableOpacity
          className="bg-white/[0.15] rounded-xl px-[14px] py-2"
          onPress={() => router.push('/(server)/gate-qr')}
        >
          <Text className="text-white font-bold text-[13px]">Gate QR</Text>
        </TouchableOpacity>
      </View>

      {/* Scan frame */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="absolute inset-0 bg-black/[0.35]" />
        <View
          className="w-[220px] h-[220px] border-2 rounded-2xl"
          style={{ borderColor: scanning ? '#F59E0B' : LEAF }}
        />
        <Text
          className="text-[13px] font-medium mt-[14px]"
          style={{ color: scanning ? '#F59E0B' : '#FFFFFF' }}
        >
          {scanning ? 'Processing…' : 'Point at member QR code'}
        </Text>
      </View>

      {/* Toast — check in/out confirmation */}
      {toast && (
        <View
          className="absolute left-5 right-5 rounded-2xl p-4 flex-row items-center gap-3"
          style={{
            bottom: insets.bottom + 120,
            backgroundColor: toast.direction === 'in' ? '#2A5C33' : '#D97706',
          }}
        >
          <View className="w-11 h-11 rounded-full bg-white/20 items-center justify-center">
            <Ionicons
              name={toast.direction === 'in' ? 'log-in-outline' : 'log-out-outline'}
              size={24}
              color="#FFFFFF"
            />
          </View>
          <View className="flex-1">
            <Text className="text-white text-[15px] font-extrabold">{toast.name}</Text>
            <Text className="text-white/80 text-[13px] mt-[2px]">
              {toast.direction === 'in' ? 'Checked IN' : 'Checked OUT'}
            </Text>
          </View>
        </View>
      )}

      {/* Error toast */}
      {error && !toast && (
        <View
          className="absolute left-5 right-5 bg-[#DC2626] rounded-2xl p-4 flex-row items-center gap-3"
          style={{ bottom: insets.bottom + 120 }}
        >
          <Ionicons name="alert-circle-outline" size={24} color="#FFFFFF" />
          <Text className="text-white text-[13px] font-bold flex-1">{error}</Text>
        </View>
      )}

      {/* Processing spinner overlay */}
      {scanning && !toast && !error && (
        <View
          className="absolute left-5 right-5 bg-black/[0.65] rounded-2xl p-4 flex-row items-center gap-3"
          style={{ bottom: insets.bottom + 120 }}
        >
          <ActivityIndicator color="#FFFFFF" />
          <Text className="text-white text-[13px] font-semibold">Looking up member…</Text>
        </View>
      )}
    </View>
  );
}
