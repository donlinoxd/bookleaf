import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ResourceService } from '../../src/services/ResourceService';
import { BorrowService } from '../../src/services/BorrowService';
import { UserService } from '../../src/services/UserService';
import { useAppStore } from '../../src/store/appStore';
import { BorrowingRecord, Resource, User } from '../../src/types';

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

  const reset = useCallback(() => {
    scannedRef.current = false;
    setPhase('scanning');
    setAction('view');
    setScannedIsbn('');
    setResource(null);
    setMember(null);
    setMemberQuery('');
  }, []);

  useFocusEffect(useCallback(() => {
    return () => reset();
  }, [reset]));

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

  if (!permission) return <View className="flex-1 bg-black" />;

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
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <CameraView
        className="flex-1"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
        onBarcodeScanned={phase === 'scanning' ? handleBarcodeScan : undefined}
      />

      {/* Scanning frame overlay */}
      {phase === 'scanning' && (
        <View className="absolute inset-0 items-center justify-center">
          <View className="absolute inset-0 bg-black/[0.45]" />
          <View className="w-[260px] h-[120px] border-2 border-leaf rounded-xl" />
          <Text className="text-white text-[14px] font-medium mt-5">
            Point at a barcode or QR code
          </Text>
        </View>
      )}

      {/* Resolving spinner */}
      {phase === 'resolving' && (
        <View className="absolute inset-0 bg-black/60 items-center justify-center gap-4">
          <ActivityIndicator size="large" color={LEAF} />
          <Text className="text-white text-[14px] font-medium">
            Looking up {scannedIsbn}…
          </Text>
        </View>
      )}

      {/* Not found sheet */}
      {phase === 'not_found' && (
        <BottomSheet>
          <View className="items-center gap-2 pb-1">
            <View className="w-[52px] h-[52px] rounded-full bg-[#FEE2E2] items-center justify-center">
              <Ionicons name="search-outline" size={26} color="#DC2626" />
            </View>
            <Text className="text-[17px] font-extrabold text-[#1C2B1E]">Not in Catalog</Text>
            <Text className="text-[12px] text-[#94A3B8]">{scannedIsbn}</Text>
          </View>
          <TouchableOpacity
            className="bg-brand rounded-2xl py-[14px] items-center"
            onPress={() => router.push({ pathname: '/(server)/book/add', params: { isbn: scannedIsbn } })}
          >
            <Text className="text-white font-bold text-[15px]">Add to Catalog</Text>
          </TouchableOpacity>
          <ScanAgainButton onPress={reset} />
        </BottomSheet>
      )}

      {/* Found sheet */}
      {phase === 'found' && resource && (
        <BottomSheet>
          {/* Resource card */}
          <View className="bg-[#F0F7EE] rounded-[14px] p-[14px] gap-[6px]">
            <Text className="text-[15px] font-extrabold text-[#1C2B1E]" numberOfLines={2}>
              {resource.title}
            </Text>
            <Text className="text-[12px] text-[#5A7A5E]">{resource.author}</Text>
            <View className="flex-row gap-2 mt-[2px]">
              <Badge
                label={`${resource.available_copies} available`}
                color={resource.available_copies > 0 ? '#2A5C33' : '#DC2626'}
              />
              <Badge label={resource.material_type} color={INACTIVE} />
            </View>
          </View>

          {action === 'view' && (
            <View className="flex-row gap-[10px]">
              <TouchableOpacity
                className="flex-1 rounded-[14px] py-[14px] items-center"
                style={{ backgroundColor: resource.available_copies > 0 && resource.is_loanable ? '#5CB85C' : '#C8DFC5' }}
                onPress={() => setAction('checkout')}
                disabled={resource.available_copies === 0 || !resource.is_loanable}
              >
                <Text className="text-white font-bold text-[15px]">Check Out</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-brand rounded-[14px] py-[14px] items-center"
                onPress={() => setAction('return')}
              >
                <Text className="text-white font-bold text-[15px]">Return</Text>
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
        <View className="flex-1 bg-black">
          <View className="flex-row items-center gap-4 px-5 pt-[52px] pb-4">
            <TouchableOpacity onPress={() => setMemberScanOpen(false)}>
              <Text className="text-leaf text-base font-semibold">✕ Close</Text>
            </TouchableOpacity>
            <Text className="text-white text-[17px] font-bold">Scan Member QR</Text>
          </View>
          <CameraView
            className="flex-1"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (memberScannedRef.current) return;
              memberScannedRef.current = true;
              setMemberScanOpen(false);
              setMemberQuery(data);
              lookupMember(data);
            }}
          >
            <View className="flex-1 justify-center items-center gap-5">
              <View className="w-[220px] h-[220px] border-2 border-leaf rounded-2xl" />
              <Text className="text-white text-[14px] font-medium">
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
  const tabBarClearance = Math.max(insets.bottom, 8) + 8 + 78 + 12;

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[28px]"
      style={{
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      }}
    >
      {/* Handle */}
      <View className="w-10 h-1 rounded-sm bg-[#E2E8F0] self-center mt-3 mb-1" />
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
      className="items-center py-[6px]"
      onPress={onPress}
    >
      <Text className="text-[13px] text-[#94A3B8] font-semibold">Scan Again</Text>
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
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color={INACTIVE} />
        </TouchableOpacity>
        <Text className="text-[14px] font-bold text-[#1C2B1E]">Find Member</Text>
      </View>

      <View className="flex-row gap-2">
        <TextInput
          className="flex-1 bg-[#F0F7EE] rounded-xl px-[14px] py-[10px] text-[14px] text-[#1C2B1E]"
          value={memberQuery}
          onChangeText={onChangeQuery}
          placeholder="Enter member ID number"
          placeholderTextColor={INACTIVE}
          keyboardType="default"
        />
        <TouchableOpacity
          className="bg-brand rounded-xl px-3 justify-center"
          onPress={onOpenMemberScan}
        >
          <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-leaf rounded-xl px-[14px] justify-center"
          onPress={onLookup}
        >
          <Text className="text-white font-bold text-[13px]">Find</Text>
        </TouchableOpacity>
      </View>

      {member && (
        <View className="bg-[#F0F7EE] rounded-xl p-3 flex-row items-center gap-[10px]">
          <View className="w-9 h-9 rounded-full bg-brand items-center justify-center">
            <Ionicons name="person" size={18} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-bold text-[#1C2B1E]">{member.name}</Text>
            <Text className="text-[11px] text-[#5A7A5E] mt-[1px]">{member.role} · ID: {member.id_number}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        className="bg-leaf rounded-[14px] py-[14px] items-center"
        style={{ opacity: member ? 1 : 0.4 }}
        onPress={onConfirm}
        disabled={!member || isPending}
      >
        {isPending
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text className="text-white font-bold text-[15px]">Confirm Checkout</Text>}
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
    <View className="gap-[10px]">
      <View className="flex-row items-center gap-2">
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color={INACTIVE} />
        </TouchableOpacity>
        <Text className="text-[14px] font-bold text-[#1C2B1E]">Active Borrows</Text>
      </View>

      {loading && (
        <View className="items-center py-4">
          <ActivityIndicator color={LEAF} />
        </View>
      )}

      {!loading && activeBorrows.length === 0 && (
        <View className="items-center py-4 gap-[6px]">
          <Ionicons name="checkmark-circle-outline" size={32} color="#C8DFC5" />
          <Text className="text-[13px] text-[#94A3B8]">No active borrows for this resource</Text>
        </View>
      )}

      <View>
        {activeBorrows.map((b) => {
          const overdue = new Date(b.due_date) < new Date();
          return (
            <View key={b.id} className="flex-row items-center bg-[#F8FAFC] rounded-xl p-3 mb-2 gap-[10px]">
              <View className="flex-1">
                <Text className="text-[13px] font-bold text-[#1C2B1E]">{b.member_name}</Text>
                <Text className="text-[11px] text-[#7A9A7E] mt-[2px]">
                  Due: {new Date(b.due_date).toLocaleDateString()}
                  {overdue ? '  ⚠ OVERDUE' : ''}
                </Text>
              </View>
              <TouchableOpacity
                className="bg-brand rounded-[10px] px-[14px] py-2"
                onPress={() => onReturn(b.id)}
                disabled={isPending}
              >
                <Text className="text-white font-bold text-[13px]">Return</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}
