import { useState } from 'react';
import { Alert, Modal, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserService } from '../../src/services/UserService';
import { ResourceService } from '../../src/services/ResourceService';
import { BorrowService } from '../../src/services/BorrowService';
import { User, Resource } from '../../src/types';
import { queryKeys } from '../../src/lib/queryKeys';

type Mode = 'checkout' | 'return';

export default function BorrowScreen() {
  const [mode, setMode] = useState<Mode>('checkout');

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-5 pt-[52px] rounded-b-[28px]">
        <Text className="text-2xl font-extrabold text-white mb-4">Borrow / Return</Text>
        <View className="flex-row bg-[#1C3E23] rounded-2xl p-1">
          {(['checkout', 'return'] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              className={`flex-1 py-2.5 rounded-xl items-center ${mode === m ? 'bg-white' : ''}`}
              onPress={() => setMode(m)}
            >
              <Text className={`text-sm font-bold ${mode === m ? 'text-brand' : 'text-[#A8D5A2]'}`}>
                {m === 'checkout' ? 'Check Out' : 'Return'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {mode === 'checkout' ? <CheckoutForm /> : <ReturnForm />}
    </View>
  );
}

function CheckoutForm() {
  const queryClient = useQueryClient();
  const [memberQuery, setMemberQuery] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const [member, setMember] = useState<User | null>(null);
  const [resource, setResource] = useState<Resource | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const lookupMember = async (idOverride?: string) => {
    const id = idOverride ?? memberQuery.trim();
    if (!id) return;
    const found = await UserService.getByIdNumber(id);
    if (!found) return Alert.alert('Not Found', 'No member with that ID');
    setMember(found);
  };

  const borrowMutation = useMutation({
    mutationFn: async () => {
      const canBorrow = await BorrowService.canBorrow(member!.id);
      if (!canBorrow.allowed) throw new Error(canBorrow.reason);
      if (!resource!.is_loanable) throw new Error('This resource is not available for borrowing');
      const copy = await ResourceService.getAvailableCopy(resource!.id);
      if (!copy) throw new Error('No available copies of this resource');
      await BorrowService.borrowBook(copy.id, member!.id);
    },
    onSuccess: () => {
      Alert.alert('Success', `"${resource!.title}" checked out to ${member!.name}`);
      setMember(null); setResource(null); setMemberQuery(''); setResourceQuery('');
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['overdue'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const lookupResource = async () => {
    if (!resourceQuery.trim()) return;
    const results = await ResourceService.search(1, resourceQuery.trim());
    if (!results.length) return Alert.alert('Not Found', 'No resource found');
    setResource(results[0]);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 110 }}>
      <StepCard step={1} label="Find Member">
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
            value={memberQuery}
            onChangeText={setMemberQuery}
            placeholder="Enter member ID number"
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity className="bg-brand rounded-xl px-3 justify-center" onPress={() => setScannerOpen(true)}>
            <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity className="bg-leaf rounded-xl px-4 justify-center" onPress={() => lookupMember()}>
            <Text className="text-white font-bold text-sm">Find</Text>
          </TouchableOpacity>
        </View>
        {member && <ResultCard label={member.name} sub={`${member.role} · ID: ${member.id_number}`} variant="mint" />}
      </StepCard>

      <QrScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(id) => { setMemberQuery(id); setScannerOpen(false); lookupMember(id); }}
      />

      <StepCard step={2} label="Find Resource">
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
            value={resourceQuery}
            onChangeText={setResourceQuery}
            placeholder="Title, author, or ISBN"
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity className="bg-leaf rounded-xl px-4 justify-center" onPress={lookupResource}>
            <Text className="text-white font-bold text-sm">Find</Text>
          </TouchableOpacity>
        </View>
        {resource && (
          <ResultCard
            label={resource.title}
            sub={`${resource.author} · ${resource.available_copies} available`}
            variant={resource.available_copies > 0 && resource.is_loanable ? 'mint' : 'red'}
          />
        )}
      </StepCard>

      <TouchableOpacity
        className="bg-leaf rounded-2xl py-4 items-center"
        style={{ opacity: (member && resource) ? 1 : 0.45, elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
        onPress={() => borrowMutation.mutate()}
        disabled={borrowMutation.isPending || !member || !resource}
      >
        <Text className="text-white font-bold text-base">
          {borrowMutation.isPending ? 'Processing…' : 'Check Out'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ReturnForm() {
  const queryClient = useQueryClient();
  const [memberQuery, setMemberQuery] = useState('');
  const [member, setMember] = useState<User | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const { data: activeBorrows = [] } = useQuery({
    queryKey: queryKeys.activeBorrows(member?.id ?? 0),
    queryFn: () => BorrowService.getActiveByUser(member!.id),
    enabled: !!member,
  });

  const lookupMember = async (idOverride?: string) => {
    const id = idOverride ?? memberQuery.trim();
    if (!id) return;
    const found = await UserService.getByIdNumber(id);
    if (!found) return Alert.alert('Not Found', 'No member with that ID');
    setMember(found);
  };

  const returnMutation = useMutation({
    mutationFn: ({ borrowId }: { borrowId: number; bookTitle: string }) => BorrowService.returnBook(borrowId),
    onSuccess: (fine, { bookTitle }) => {
      if (fine) Alert.alert('Returned', `"${bookTitle}" returned.\nFine: ₱${fine.amount.toFixed(2)}`);
      else Alert.alert('Returned', `"${bookTitle}" returned successfully.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.activeBorrows(member!.id) });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['overdue'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}>
      <StepCard step={1} label="Find Member">
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
            value={memberQuery}
            onChangeText={setMemberQuery}
            placeholder="Enter member ID number"
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity className="bg-brand rounded-xl px-3 justify-center" onPress={() => setScannerOpen(true)}>
            <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity className="bg-leaf rounded-xl px-4 justify-center" onPress={() => lookupMember()}>
            <Text className="text-white font-bold text-sm">Find</Text>
          </TouchableOpacity>
        </View>
        {member && <ResultCard label={member.name} sub={`${activeBorrows.length} items borrowed`} variant="mint" />}
      </StepCard>

      <QrScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(id) => { setMemberQuery(id); setScannerOpen(false); lookupMember(id); }}
      />

      {activeBorrows.map((b) => {
        const overdue = new Date(b.due_date) < new Date();
        return (
          <View key={b.id} className="bg-white rounded-2xl p-4 flex-row items-center"
            style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
            <View className="flex-1">
              <Text className="text-sm font-bold text-[#1C2B1E]">{b.book_title}</Text>
              <Text className="text-xs text-[#5A7A5E] mt-0.5">Due: {new Date(b.due_date).toLocaleDateString()}</Text>
              {overdue && (
                <View className="self-start bg-red-100 rounded px-1.5 py-0.5 mt-1">
                  <Text className="text-[10px] font-bold text-red-600">OVERDUE</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              className="bg-leaf rounded-xl px-4 py-2"
              onPress={() => returnMutation.mutate({ borrowId: b.id, bookTitle: b.book_title ?? '' })}
              disabled={returnMutation.isPending}
            >
              <Text className="text-white font-bold text-sm">Return</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

function StepCard({ step, label, children }: { step: number; label: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl p-4 gap-3"
      style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
      <View className="flex-row items-center gap-2">
        <View className="w-6 h-6 rounded-full bg-brand items-center justify-center">
          <Text className="text-white text-xs font-extrabold">{step}</Text>
        </View>
        <Text className="text-sm font-bold text-[#1C2B1E]">{label}</Text>
      </View>
      {children}
    </View>
  );
}

function ResultCard({ label, sub, variant }: { label: string; sub: string; variant: 'mint' | 'red' }) {
  return (
    <View className={`rounded-xl p-3 ${variant === 'mint' ? 'bg-mint' : 'bg-red-50'}`}>
      <Text className={`text-sm font-bold ${variant === 'mint' ? 'text-brand' : 'text-red-700'}`}>{label}</Text>
      <Text className={`text-xs mt-0.5 ${variant === 'mint' ? 'text-[#5A7A5E]' : 'text-red-500'}`}>{sub}</Text>
    </View>
  );
}

function QrScannerModal({ visible, onClose, onScanned }: { visible: boolean; onClose: () => void; onScanned: (id: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = { current: false };
  if (!visible) return null;

  if (!permission?.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View className="flex-1 justify-center items-center px-8 bg-bio">
          <Ionicons name="camera-outline" size={56} color="#C8DFC5" />
          <Text className="text-base font-bold text-brand mt-4 mb-2">Camera Permission Needed</Text>
          <Text className="text-sm text-[#7A9A7E] text-center mb-6">Camera access is required to scan QR codes.</Text>
          <TouchableOpacity className="bg-leaf rounded-2xl px-8 py-3.5 mb-3" onPress={requestPermission}>
            <Text className="text-white font-bold">Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-[#94A3B8] text-sm">Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (scanned.current) return;
            scanned.current = true;
            onScanned(data);
          }}
        />
        <View className="absolute inset-0 items-center justify-center gap-5">
          <View className="w-[220px] h-[220px] border-2 border-leaf rounded-2xl" />
          <Text className="text-white text-sm font-medium">Point at a member's QR code</Text>
          <TouchableOpacity
            className="bg-black/60 rounded-xl px-7 py-3"
            onPress={onClose}
          >
            <Text className="text-white font-bold">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
