import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ResourceService } from '../../src/services/ResourceService';
import { BorrowService } from '../../src/services/BorrowService';
import { UserService } from '../../src/services/UserService';
import { useAppStore } from '../../src/store/appStore';
import { BorrowingRecord, Resource, User } from '../../src/types';

const BRAND = '#2A5C33';
const LEAF = '#5CB85C';
const INACTIVE = '#94A3B8';

type Phase = 'scanning' | 'resolving' | 'found' | 'not_found';
type ActionMode = 'view' | 'checkout' | 'return';

export default function ScanScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const institution = useAppStore((s) => s.institution);
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>('scanning');
  const [action, setAction] = useState<ActionMode>('view');
  const [scannedIsbn, setScannedIsbn] = useState('');
  const [resource, setResource] = useState<Resource | null>(null);

  const [memberQuery, setMemberQuery] = useState('');
  const [member, setMember] = useState<User | null>(null);
  const [memberScanOpen, setMemberScanOpen] = useState(false);

  const scannedRef = useRef(false);
  const memberScannedRef = useRef(false);

  const reset = () => {
    scannedRef.current = false;
    setPhase('scanning');
    setAction('view');
    setScannedIsbn('');
    setResource(null);
    setMember(null);
    setMemberQuery('');
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScannedIsbn(data);
    setPhase('resolving');
    const results = await ResourceService.search(institution!.id, data);
    if (results.length > 0) {
      setResource(results[0]);
      setPhase('found');
    } else {
      setPhase('not_found');
    }
  };

  const { data: activeBorrows = [], isLoading: borrowsLoading } = useQuery({
    queryKey: ['active-borrows-resource', resource?.id],
    queryFn: () => BorrowService.getActiveBorrowsByResource(resource!.id),
    enabled: !!resource && action === 'return',
  });

  const lookupMember = async (idOverride?: string) => {
    const id = idOverride ?? memberQuery.trim();
    if (!id) return;
    const found = await UserService.getByIdNumber(id);
    if (!found) { Alert.alert('Not Found', 'No member with that ID'); return; }
    setMember(found);
  };

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const canBorrow = await BorrowService.canBorrow(member!.id);
      if (!canBorrow.allowed) throw new Error(canBorrow.reason);
      if (!resource!.is_loanable) throw new Error('This resource is not available for borrowing');
      const copy = await ResourceService.getAvailableCopy(resource!.id);
      if (!copy) throw new Error('No available copies');
      await BorrowService.borrowBook(copy.id, member!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['overdue'] });
      Alert.alert('Checked Out', `"${resource!.title}" checked out to ${member!.name}`, [
        { text: 'Scan Another', onPress: reset },
      ]);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const returnMutation = useMutation({
    mutationFn: ({ borrowId }: { borrowId: number }) => BorrowService.returnBook(borrowId),
    onSuccess: (fine) => {
      queryClient.invalidateQueries({ queryKey: ['active-borrows-resource', resource?.id] });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['overdue'] });
      const msg = fine ? `Returned successfully.\nFine: ₱${fine.amount.toFixed(2)}` : 'Returned successfully.';
      Alert.alert('Returned', msg);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-bio items-center justify-center px-8">
        <StatusBar barStyle="dark-content" />
        <Ionicons name="camera-outline" size={56} color="#C8DFC5" />
        <Text className="text-base font-bold text-brand mt-4 mb-2">Camera Permission Needed</Text>
        <Text className="text-sm text-[#7A9A7E] text-center mb-6">
          Camera access is required to scan barcodes and QR codes.
        </Text>
        <TouchableOpacity className="bg-leaf rounded-2xl px-8 py-3.5" onPress={requestPermission}>
          <Text className="text-white font-bold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
        onBarcodeScanned={phase === 'scanning' ? handleBarcodeScan : undefined}
      />

      {/* Scanning frame overlay */}
      {phase === 'scanning' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
          <View style={{ width: 260, height: 120, borderWidth: 2, borderColor: LEAF, borderRadius: 12 }} />
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500', marginTop: 20 }}>
            Point at a barcode or QR code
          </Text>
        </View>
      )}

      {/* Resolving spinner */}
      {phase === 'resolving' && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <ActivityIndicator size="large" color={LEAF} />
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>
            Looking up {scannedIsbn}…
          </Text>
        </View>
      )}

      {/* Not found sheet */}
      {phase === 'not_found' && (
        <BottomSheet>
          <View style={{ alignItems: 'center', gap: 8, paddingBottom: 4 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="search-outline" size={26} color="#DC2626" />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#1C2B1E' }}>Not in Catalog</Text>
            <Text style={{ fontSize: 12, color: INACTIVE }}>{scannedIsbn}</Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: BRAND, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
            onPress={() => router.push({ pathname: '/(server)/book/add', params: { isbn: scannedIsbn } })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Add to Catalog</Text>
          </TouchableOpacity>
          <ScanAgainButton onPress={reset} />
        </BottomSheet>
      )}

      {/* Found sheet */}
      {phase === 'found' && resource && (
        <BottomSheet>
          {/* Resource card */}
          <View style={{ backgroundColor: '#F0F7EE', borderRadius: 14, padding: 14, gap: 6 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1C2B1E' }} numberOfLines={2}>
              {resource.title}
            </Text>
            <Text style={{ fontSize: 12, color: '#5A7A5E' }}>{resource.author}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <Badge
                label={`${resource.available_copies} available`}
                color={resource.available_copies > 0 ? BRAND : '#DC2626'}
              />
              <Badge label={resource.material_type} color={INACTIVE} />
            </View>
          </View>

          {action === 'view' && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: resource.available_copies > 0 && resource.is_loanable ? LEAF : '#C8DFC5',
                }}
                onPress={() => setAction('checkout')}
                disabled={resource.available_copies === 0 || !resource.is_loanable}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Check Out</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => setAction('return')}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Return</Text>
              </TouchableOpacity>
            </View>
          )}

          {action === 'checkout' && (
            <CheckoutAction
              memberQuery={memberQuery}
              member={member}
              isPending={checkoutMutation.isPending}
              onChangeQuery={setMemberQuery}
              onLookup={() => lookupMember()}
              onOpenMemberScan={() => { memberScannedRef.current = false; setMemberScanOpen(true); }}
              onConfirm={() => checkoutMutation.mutate()}
              onBack={() => { setAction('view'); setMember(null); setMemberQuery(''); }}
            />
          )}

          {action === 'return' && (
            <ReturnAction
              activeBorrows={activeBorrows}
              loading={borrowsLoading}
              isPending={returnMutation.isPending}
              onReturn={(borrowId) => returnMutation.mutate({ borrowId })}
              onBack={() => setAction('view')}
            />
          )}

          <ScanAgainButton onPress={reset} />
        </BottomSheet>
      )}

      {/* Member QR scanner modal (used inside checkout flow) */}
      <Modal visible={memberScanOpen} animationType="slide" onRequestClose={() => setMemberScanOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16 }}>
            <TouchableOpacity onPress={() => setMemberScanOpen(false)}>
              <Text style={{ color: LEAF, fontSize: 16, fontWeight: '600' }}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>Scan Member QR</Text>
          </View>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (memberScannedRef.current) return;
              memberScannedRef.current = true;
              setMemberScanOpen(false);
              setMemberQuery(data);
              lookupMember(data);
            }}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
              <View style={{ width: 220, height: 220, borderWidth: 2, borderColor: LEAF, borderRadius: 16 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>
                Point at a member's QR code
              </Text>
            </View>
          </CameraView>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BottomSheet({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  // Push content above the floating tab bar: tab bar sits at (max(insets.bottom,8)+8) from bottom, height ≈ 78px
  const tabBarClearance = Math.max(insets.bottom, 8) + 8 + 78 + 12;

  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      elevation: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    }}>
      {/* Handle */}
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />
      <ScrollView
        contentContainerStyle={{ padding: 20, rowGap: 14, paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: color + '22' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
}

function ScanAgainButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={{ alignItems: 'center', paddingVertical: 6 }}
      onPress={onPress}
    >
      <Text style={{ fontSize: 13, color: INACTIVE, fontWeight: '600' }}>Scan Again</Text>
    </TouchableOpacity>
  );
}

function CheckoutAction({
  memberQuery, member, isPending,
  onChangeQuery, onLookup, onOpenMemberScan, onConfirm, onBack,
}: {
  memberQuery: string;
  member: User | null;
  isPending: boolean;
  onChangeQuery: (v: string) => void;
  onLookup: () => void;
  onOpenMemberScan: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color={INACTIVE} />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C2B1E' }}>Find Member</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          style={{ flex: 1, backgroundColor: '#F0F7EE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1C2B1E' }}
          value={memberQuery}
          onChangeText={onChangeQuery}
          placeholder="Enter member ID number"
          placeholderTextColor={INACTIVE}
          keyboardType="default"
        />
        <TouchableOpacity
          style={{ backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' }}
          onPress={onOpenMemberScan}
        >
          <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ backgroundColor: LEAF, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' }}
          onPress={onLookup}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Find</Text>
        </TouchableOpacity>
      </View>

      {member && (
        <View style={{ backgroundColor: '#F0F7EE', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C2B1E' }}>{member.name}</Text>
            <Text style={{ fontSize: 11, color: '#5A7A5E', marginTop: 1 }}>{member.role} · ID: {member.id_number}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={{ backgroundColor: LEAF, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: member ? 1 : 0.4 }}
        onPress={onConfirm}
        disabled={!member || isPending}
      >
        {isPending
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Confirm Checkout</Text>}
      </TouchableOpacity>
    </View>
  );
}

function ReturnAction({
  activeBorrows, loading, isPending, onReturn, onBack,
}: {
  activeBorrows: BorrowingRecord[];
  loading: boolean;
  isPending: boolean;
  onReturn: (borrowId: number) => void;
  onBack: () => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color={INACTIVE} />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C2B1E' }}>Active Borrows</Text>
      </View>

      {loading && (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <ActivityIndicator color={LEAF} />
        </View>
      )}

      {!loading && activeBorrows.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
          <Ionicons name="checkmark-circle-outline" size={32} color="#C8DFC5" />
          <Text style={{ fontSize: 13, color: INACTIVE }}>No active borrows for this resource</Text>
        </View>
      )}

      <View>
        {activeBorrows.map((b) => {
          const overdue = new Date(b.due_date) < new Date();
          return (
            <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 8, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C2B1E' }}>{b.member_name}</Text>
                <Text style={{ fontSize: 11, color: '#7A9A7E', marginTop: 2 }}>
                  Due: {new Date(b.due_date).toLocaleDateString()}
                  {overdue ? '  ⚠ OVERDUE' : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                onPress={() => onReturn(b.id)}
                disabled={isPending}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Return</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}
