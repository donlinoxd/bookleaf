import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserService } from '../../../src/services/UserService';
import { BorrowService } from '../../../src/services/BorrowService';
import { useAppStore } from '../../../src/store/appStore';
import { User, Fine, UserRole } from '../../../src/types';
import { queryKeys } from '../../../src/lib/queryKeys';

const ROLE_COLOR: Record<UserRole, string> = {
  admin: '#7C3AED',
  librarian: '#2563EB',
  member: '#16A34A',
};

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAppStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';
  const userId = parseInt(id);

  const [editVisible, setEditVisible] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);

  const { data: member, isLoading } = useQuery({
    queryKey: queryKeys.member(userId),
    queryFn: () => UserService.getById(userId),
    enabled: !!userId,
  });

  const { data: activeBorrows = [] } = useQuery({
    queryKey: queryKeys.activeBorrows(userId),
    queryFn: () => BorrowService.getActiveByUser(userId),
    enabled: !!userId,
  });

  const { data: history = [] } = useQuery({
    queryKey: queryKeys.memberHistory(userId),
    queryFn: () => BorrowService.getFullHistoryByUser(userId),
    enabled: !!userId,
  });

  const { data: fines = [] } = useQuery({
    queryKey: queryKeys.memberFines(userId),
    queryFn: () => BorrowService.getUserFines(userId),
    enabled: !!userId,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (isActive: boolean) => UserService.updateStatus(userId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.member(userId) });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const payFineMutation = useMutation({
    mutationFn: (fineId: number) => BorrowService.payFine(fineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memberFines(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.member(userId) });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleToggleStatus = () => {
    if (!member) return;
    const action = member.is_active ? 'Deactivate' : 'Reactivate';
    Alert.alert(`${action} Member`, `${action} ${member.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: member.is_active ? 'destructive' : 'default',
        onPress: () => toggleStatusMutation.mutate(!member.is_active),
      },
    ]);
  };

  const handlePayFine = (fine: Fine) => {
    Alert.alert('Mark as Paid', `Mark ₱${fine.amount.toFixed(2)} fine as paid?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Paid', onPress: () => payFineMutation.mutate(fine.id) },
    ]);
  };

  const totalFines = fines.reduce((sum, f) => sum + f.amount, 0);
  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  if (!member) {
    return <View style={styles.centered}><Text style={styles.errorText}>Member not found</Text></View>;
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.topActions}>
            {isAdmin && (
              <TouchableOpacity style={styles.topBtn} onPress={() => setPinVisible(true)}>
                <Text style={styles.topBtnText}>Reset PIN</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.topBtn} onPress={() => setEditVisible(true)}>
              <Text style={styles.topBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: ROLE_COLOR[member.role] + '20' }]}>
            <Text style={[styles.avatarText, { color: ROLE_COLOR[member.role] }]}>
              {member.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberId}>ID: {member.id_number}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: ROLE_COLOR[member.role] + '20' }]}>
                <Text style={[styles.roleText, { color: ROLE_COLOR[member.role] }]}>{member.role}</Text>
              </View>
              <View style={[styles.statusBadge, member.is_active ? styles.activeStyle : styles.inactiveStyle]}>
                <Text style={styles.statusText}>{member.is_active ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.toggleBtn, member.is_active ? styles.toggleDeactivate : styles.toggleActivate]}
              onPress={handleToggleStatus}
            >
              <Text style={styles.toggleBtnText}>{member.is_active ? 'Deactivate' : 'Reactivate'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Currently Borrowed" value={activeBorrows.length} color="#2563EB" />
          <StatCard label="Total Borrows" value={history.length} color="#7C3AED" />
          <StatCard label="Unpaid Fines" value={fines.length} color={fines.length > 0 ? '#DC2626' : '#16A34A'} />
        </View>

        {fines.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Outstanding Fines</Text>
              <Text style={styles.finesTotal}>Total: ₱{totalFines.toFixed(2)}</Text>
            </View>
            {fines.map((fine) => (
              <View key={fine.id} style={styles.fineRow}>
                <Text style={styles.fineAmount}>₱{fine.amount.toFixed(2)}</Text>
                <TouchableOpacity style={styles.payBtn} onPress={() => handlePayFine(fine)}>
                  <Text style={styles.payBtnText}>Mark Paid</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Currently Borrowed ({activeBorrows.length})</Text>
          {activeBorrows.length === 0 ? (
            <Text style={styles.emptyText}>No books currently borrowed</Text>
          ) : (
            activeBorrows.map((b) => (
              <View key={b.id} style={styles.borrowRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.borrowTitle}>{b.book_title}</Text>
                  <Text style={styles.borrowAuthor}>{b.book_author}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.dueDate, isOverdue(b.due_date) && styles.overdueText]}>
                    {isOverdue(b.due_date) ? 'OVERDUE' : `Due ${new Date(b.due_date).toLocaleDateString()}`}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Borrow History ({history.length})</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No borrow history</Text>
          ) : (
            history.map((b) => (
              <View key={b.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.borrowTitle}>{b.book_title}</Text>
                  <Text style={styles.historyDate}>{new Date(b.borrowed_at).toLocaleDateString()}</Text>
                </View>
                {b.returned_at
                  ? <Text style={styles.returnedText}>Returned</Text>
                  : <Text style={[styles.activeText, isOverdue(b.due_date) && styles.overdueText]}>
                      {isOverdue(b.due_date) ? 'Overdue' : 'Active'}
                    </Text>
                }
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <EditMemberModal
        visible={editVisible}
        member={member}
        onClose={() => setEditVisible(false)}
        onSaved={() => setEditVisible(false)}
        userId={userId}
      />

      <ResetPinModal
        visible={pinVisible}
        member={member}
        onClose={() => setPinVisible(false)}
        onSaved={() => setPinVisible(false)}
      />
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface EditModalProps {
  visible: boolean;
  member: User;
  onClose: () => void;
  onSaved: () => void;
  userId: number;
}

const ROLES: UserRole[] = ['member', 'librarian', 'admin'];

function EditMemberModal({ visible, member, onClose, onSaved, userId }: EditModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(member.name);
  const [idNumber, setIdNumber] = useState(member.id_number);
  const [role, setRole] = useState<UserRole>(member.role);

  useEffect(() => {
    setName(member.name);
    setIdNumber(member.id_number);
    setRole(member.role);
  }, [member]);

  const updateMutation = useMutation({
    mutationFn: () => UserService.update(member.id, { name: name.trim(), id_number: idNumber.trim(), role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.member(userId) });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      onSaved();
    },
    onError: (e: any) => Alert.alert('Error', e.message ?? 'Failed to save'),
  });

  const handleSave = () => {
    if (!name.trim() || !idNumber.trim()) {
      Alert.alert('Error', 'Name and ID number are required');
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modal.container}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={modal.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modal.title}>Edit Member</Text>
          <TouchableOpacity onPress={handleSave} disabled={updateMutation.isPending}>
            <Text style={modal.save}>{updateMutation.isPending ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={modal.body}>
          <Text style={modal.label}>Full Name *</Text>
          <TextInput style={modal.input} value={name} onChangeText={setName} placeholder="Full name" />

          <Text style={modal.label}>ID Number *</Text>
          <TextInput style={modal.input} value={idNumber} onChangeText={setIdNumber} placeholder="ID number" autoCapitalize="none" />

          <Text style={modal.label}>Role</Text>
          <View style={modal.roleRow}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[modal.roleBtn, role === r && { backgroundColor: ROLE_COLOR[r] }]}
                onPress={() => setRole(r)}
              >
                <Text style={[modal.roleBtnText, role === r && { color: '#FFFFFF' }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

interface PinModalProps {
  visible: boolean;
  member: User;
  onClose: () => void;
  onSaved: () => void;
}

function ResetPinModal({ visible, member, onClose, onSaved }: PinModalProps) {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReset = async () => {
    if (newPin.length < 4) { Alert.alert('Error', 'PIN must be at least 4 digits'); return; }
    if (newPin !== confirmPin) { Alert.alert('Error', 'PINs do not match'); return; }
    setSaving(true);
    try {
      await UserService.changePin(member.id, newPin);
      setNewPin('');
      setConfirmPin('');
      Alert.alert('Done', `PIN for ${member.name} has been reset.`);
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to reset PIN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modal.container}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={modal.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modal.title}>Reset PIN</Text>
          <TouchableOpacity onPress={handleReset} disabled={saving}>
            <Text style={modal.save}>{saving ? 'Saving…' : 'Reset'}</Text>
          </TouchableOpacity>
        </View>
        <View style={modal.body}>
          <Text style={pin.subtitle}>Resetting PIN for {member.name}</Text>
          <Text style={modal.label}>New PIN *</Text>
          <TextInput
            style={modal.input} value={newPin} onChangeText={setNewPin}
            placeholder="Min 4 digits" secureTextEntry keyboardType="numeric"
          />
          <Text style={modal.label}>Confirm PIN *</Text>
          <TextInput
            style={modal.input} value={confirmPin} onChangeText={setConfirmPin}
            placeholder="Repeat PIN" secureTextEntry keyboardType="numeric"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 16 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backText: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  topActions: { flexDirection: 'row', gap: 8 },
  topBtn: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  topBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#FFFFFF', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '700' },
  profileInfo: { flex: 1, gap: 4 },
  memberName: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  memberId: { fontSize: 14, color: '#64748B' },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  roleBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  statusBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  activeStyle: { backgroundColor: '#DCFCE7' },
  inactiveStyle: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  toggleBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  toggleDeactivate: { backgroundColor: '#FEE2E2' },
  toggleActivate: { backgroundColor: '#DCFCE7' },
  toggleBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, alignItems: 'center', borderTopWidth: 3, elevation: 1 },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, textAlign: 'center' },
  section: { backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 16, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  finesTotal: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  fineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  fineAmount: { fontSize: 16, fontWeight: '700', color: '#DC2626' },
  payBtn: { backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  payBtnText: { fontSize: 13, fontWeight: '600', color: '#16A34A' },
  borrowRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  borrowTitle: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  borrowAuthor: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  dueDate: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  overdueText: { color: '#DC2626' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  historyDate: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  returnedText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },
  activeText: { fontSize: 12, fontWeight: '600', color: '#2563EB' },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 8 },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: 20, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  cancel: { fontSize: 15, color: '#64748B' },
  save: { fontSize: 15, fontWeight: '700', color: '#2563EB' },
  body: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  roleRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  roleBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: '#F1F5F9' },
  roleBtnText: { fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'capitalize' },
});

const pin = StyleSheet.create({
  subtitle: { fontSize: 14, color: '#64748B', marginBottom: 16 },
});
