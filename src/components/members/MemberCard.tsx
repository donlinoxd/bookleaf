import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const ROLE_COLOR: Record<string, string> = {
  admin: '#7C3AED',
  librarian: '#2563EB',
  member: '#16A34A',
};

interface Props {
  name: string;
  idNumber: string;
  role: string;
  institutionName: string;
  qrSize?: number;
  getRef?: (ref: { toDataURL: (cb: (data: string) => void) => void } | null) => void;
}

export function MemberCard({ name, idNumber, role, institutionName, qrSize = 120, getRef }: Props) {
  const color = ROLE_COLOR[role] ?? '#64748B';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.institutionName} numberOfLines={1}>{institutionName}</Text>
        <Text style={styles.libraryLabel}>LIBRARY CARD</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.info}>
          <View style={[styles.avatar, { backgroundColor: color + '20' }]}>
            <Text style={[styles.avatarText, { color }]}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.roleText, { color }]}>{role.toUpperCase()}</Text>
          </View>
          <Text style={styles.idLabel}>ID NUMBER</Text>
          <Text style={styles.idNumber}>{idNumber}</Text>
        </View>
        <View style={styles.qr}>
          <QRCode
            value={idNumber}
            size={qrSize}
            color="#1E293B"
            backgroundColor="white"
            getRef={getRef}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E2E8F0',
    elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08,
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 12,
  },
  institutionName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  libraryLabel: { color: '#94A3B8', fontSize: 10, marginTop: 2, letterSpacing: 1 },
  body: { flexDirection: 'row', padding: 16, gap: 16, alignItems: 'center' },
  info: { flex: 1, gap: 4 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  roleBadge: {
    alignSelf: 'flex-start', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 2,
  },
  roleText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  idLabel: { fontSize: 10, color: '#94A3B8', marginTop: 8, letterSpacing: 1 },
  idNumber: { fontSize: 15, fontWeight: '700', color: '#1E293B', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  qr: { alignItems: 'center', justifyContent: 'center' },
});
