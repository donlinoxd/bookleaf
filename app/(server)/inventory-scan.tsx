import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InventoryService } from '../../src/services/InventoryService';
import { useAppStore } from '../../src/store/appStore';
import { queryKeys } from '../../src/lib/queryKeys';
import { ScanSession } from '../../src/types';

const BRAND = '#2A5C33';
const LEAF = '#5CB85C';
const INACTIVE = '#94A3B8';

type LastScan = {
  title: string;
  count: number;
  unknown: boolean;
};

export default function InventoryScanScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const institution = useAppStore((s) => s.institution);
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();

  const [activeSession, setActiveSession] = useState<ScanSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [scanning, setScanning] = useState(false);

  const scannedRef = useRef(false);
  const lastScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: progress, refetch: refetchProgress } = useQuery({
    queryKey: queryKeys.inventorySessionProgress(activeSession?.id ?? 0),
    queryFn: () => InventoryService.getSessionProgress(activeSession!.id),
    enabled: !!activeSession,
    refetchInterval: false,
  });

  const { data: pastSessions = [] } = useQuery({
    queryKey: queryKeys.inventorySessions(institution?.id ?? 0),
    queryFn: () => InventoryService.getCompletedSessions(institution!.id),
    enabled: !!institution && !activeSession,
  });

  // Load active session on mount
  useEffect(() => {
    if (!institution) return;
    InventoryService.getActiveSession(institution.id).then((session) => {
      setActiveSession(session);
      setLoading(false);
    });
  }, [institution]);

  // Reset barcode lock when tab comes into focus
  useFocusEffect(useCallback(() => {
    scannedRef.current = false;
    setScanning(false);
    setLastScan(null);
  }, []));

  const handleStartSession = async () => {
    if (!institution) return;
    setStarting(true);
    try {
      const session = await InventoryService.startSession(institution.id);
      setActiveSession(session);
    } finally {
      setStarting(false);
    }
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scannedRef.current || !activeSession || !institution) return;
    scannedRef.current = true;
    setScanning(true);

    try {
      const { scanCount, resource } = await InventoryService.recordScan(
        activeSession.id,
        data,
        institution.id,
      );

      if (lastScanTimer.current) clearTimeout(lastScanTimer.current);
      setLastScan({
        title: resource?.title ?? data,
        count: scanCount,
        unknown: !resource,
      });
      lastScanTimer.current = setTimeout(() => setLastScan(null), 2500);

      refetchProgress();
    } finally {
      setTimeout(() => {
        scannedRef.current = false;
        setScanning(false);
      }, 2000);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession || !institution) return;

    const unscanned = await InventoryService.getUnscannedAvailableCount(
      activeSession.id,
      institution.id,
    );

    const scannedCount = progress?.uniqueIsbns ?? 0;

    Alert.alert(
      'End Inventory Session?',
      `${scannedCount} unique ISBN${scannedCount !== 1 ? 's' : ''} scanned.\n\n` +
      (unscanned > 0
        ? `⚠ ${unscanned} available resource${unscanned !== 1 ? 's' : ''} in the catalog not yet scanned. Are you sure the shelves are fully covered?`
        : 'All available resources appear to have been scanned.'),
      [
        { text: 'Keep Scanning', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            setEnding(true);
            try {
              const report = await InventoryService.endSession(activeSession.id, institution.id);
              queryClient.invalidateQueries({ queryKey: queryKeys.inventorySessions(institution.id) });
              setActiveSession(null);
              router.push({
                pathname: '/(server)/inventory-report/[sessionId]',
                params: { sessionId: String(report.session_id) },
              });
            } finally {
              setEnding(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F4F9F4', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={LEAF} />
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
        <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND, marginTop: 16, marginBottom: 8 }}>Camera Permission Needed</Text>
        <Text style={{ fontSize: 13, color: '#7A9A7E', textAlign: 'center', marginBottom: 24 }}>
          Camera access is required to scan barcodes during inventory.
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

  // ── Active session: camera scan view ────────────────────────────────────────
  if (activeSession) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <CameraView
          style={{ flex: 1 }}
          pointerEvents="none"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
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
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>Inventory Scan</Text>
            <Text style={{ color: '#A8D5A2', fontSize: 11, marginTop: 1 }}>
              Started {new Date(activeSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: ending ? '#666' : '#DC2626',
              borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8,
            }}
            onPress={handleEndSession}
            disabled={ending}
          >
            {ending
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>End Session</Text>}
          </TouchableOpacity>
        </View>

        {/* Scan frame */}
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          <View style={{
            width: 260, height: 120, borderWidth: 2, borderRadius: 12,
            borderColor: scanning ? '#F59E0B' : LEAF,
          }} />
          <Text style={{ color: scanning ? '#F59E0B' : '#FFFFFF', fontSize: 13, fontWeight: '500', marginTop: 14 }}>
            {scanning ? 'Hold on…' : 'Point at a barcode'}
          </Text>
        </View>

        {/* Progress counter */}
        <View style={{
          position: 'absolute', bottom: insets.bottom + 110, left: 20, right: 20,
          alignItems: 'center',
        }}>
          <View style={{
            backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20,
            paddingHorizontal: 20, paddingVertical: 8,
            flexDirection: 'row', alignItems: 'center', gap: 16,
          }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: LEAF, fontSize: 20, fontWeight: '800' }}>
                {progress?.totalScanned ?? 0}
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 10 }}>total scans</Text>
            </View>
            <View style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>
                {progress?.uniqueIsbns ?? 0}
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 10 }}>unique titles</Text>
            </View>
          </View>
        </View>

        {/* Last scan toast */}
        {lastScan && (
          <View style={{
            position: 'absolute', bottom: insets.bottom + 170, left: 20, right: 20,
            backgroundColor: lastScan.unknown ? '#7C3AED' : BRAND,
            borderRadius: 14, padding: 12,
            flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <Ionicons
              name={lastScan.unknown ? 'help-circle-outline' : 'checkmark-circle-outline'}
              size={22}
              color="#FFFFFF"
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                {lastScan.unknown ? 'Unknown ISBN' : lastScan.title}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>
                {lastScan.unknown
                  ? 'Not in catalog — will appear in report'
                  : `${lastScan.count}× scanned this session`}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── No active session: landing ───────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F4F9F4' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F9F4" />

      {/* Header */}
      <View style={{ backgroundColor: BRAND, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={{ color: '#A8D5A2', fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>
          Library Tools
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 4 }}>Inventory Scan</Text>
        <Text style={{ color: '#A8D5A2', fontSize: 13, marginTop: 4 }}>
          Walk the shelves, scan every barcode, and get a discrepancy report.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
        {/* Info cards */}
        <View style={{ gap: 10 }}>
          <InfoRow icon="search-circle-outline" color="#DC2626" bg="#FEE2E2"
            title="Ghost Copies" desc="Available in DB but not found on shelves" />
          <InfoRow icon="return-down-back-outline" color="#D97706" bg="#FEF3C7"
            title="Phantom Returns" desc="Found on shelves but marked as borrowed" />
          <InfoRow icon="help-circle-outline" color="#7C3AED" bg="#EDE9FE"
            title="Unknown Scans" desc="Scanned ISBNs not in the catalog" />
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={{
            backgroundColor: starting ? '#7A9A7E' : LEAF,
            borderRadius: 18, paddingVertical: 18, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 10,
          }}
          onPress={handleStartSession}
          disabled={starting}
        >
          {starting
            ? <ActivityIndicator color="#FFFFFF" />
            : <>
              <Ionicons name="barcode-outline" size={22} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Start Inventory Session</Text>
            </>}
        </TouchableOpacity>

        {/* Past sessions */}
        {pastSessions.length > 0 && (
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C2B1E', marginBottom: 10 }}>
              Past Reports
            </Text>
            <View style={{ gap: 8 }}>
              {pastSessions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={{
                    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
                    flexDirection: 'row', alignItems: 'center',
                    elevation: 1, shadowColor: BRAND, shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06, shadowRadius: 3,
                  }}
                  onPress={() => router.push({
                    pathname: '/(server)/inventory-report/[sessionId]',
                    params: { sessionId: String(s.id) },
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C2B1E' }}>
                      {new Date(s.started_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#7A9A7E', marginTop: 2 }}>
                      {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {s.ended_at ? ` – ${new Date(s.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={INACTIVE} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon, color, bg, title, desc,
}: {
  icon: string; color: string; bg: string; title: string; desc: string;
}) {
  return (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      elevation: 1, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 3,
    }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C2B1E' }}>{title}</Text>
        <Text style={{ fontSize: 11, color: '#7A9A7E', marginTop: 1 }}>{desc}</Text>
      </View>
    </View>
  );
}
