import { ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const BRAND = '#2A5C33';
const LEAF = '#5CB85C';

interface ReportCard {
  title: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  route: string;
  badge?: string;
}

const REPORTS: ReportCard[] = [
  {
    title: 'Collection Report',
    description: 'Total titles, copies by type, publication year distribution, and condition summary.',
    icon: 'library-outline',
    color: BRAND,
    bg: '#E2EFE0',
    route: '/(server)/reports/collection',
    badge: 'CHED',
  },
];

const COMING_SOON = [
  { title: 'Circulation Report', description: 'Most borrowed books, overdue trends, monthly transactions.', icon: 'swap-horizontal-outline' },
  { title: 'Patron Report', description: 'Registered users, active borrowers, department breakdown.', icon: 'people-outline' },
  { title: 'Fines Report', description: 'Total fines collected, pending, and by date range.', icon: 'cash-outline' },
];

export default function ReportsHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F9F4' }}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />

      <View style={{ backgroundColor: BRAND, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={{ color: '#A8D5A2', fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>
          Library Reports
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 4 }}>Reports</Text>
        <Text style={{ color: '#A8D5A2', fontSize: 13, marginTop: 4 }}>
          Generate and share accreditation-ready reports.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>

        <Text style={{ fontSize: 11, fontWeight: '700', color: '#7A9A7E', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
          Available
        </Text>

        {REPORTS.map((report) => (
          <TouchableOpacity
            key={report.title}
            style={{
              backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14,
              elevation: 2, shadowColor: BRAND, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
            }}
            onPress={() => router.push(report.route as any)}
          >
            <View style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: report.bg, alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name={report.icon as any} size={24} color={report.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1C2B1E' }}>{report.title}</Text>
                {report.badge && (
                  <View style={{ backgroundColor: '#DCFCE7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: BRAND, letterSpacing: 0.5 }}>{report.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 12, color: '#7A9A7E', marginTop: 3, lineHeight: 17 }}>{report.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
          </TouchableOpacity>
        ))}

        <Text style={{ fontSize: 11, fontWeight: '700', color: '#7A9A7E', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>
          Coming Soon
        </Text>

        {COMING_SOON.map((r) => (
          <View
            key={r.title}
            style={{
              backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14, opacity: 0.5,
              elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
            }}
          >
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={r.icon as any} size={24} color="#94A3B8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1C2B1E' }}>{r.title}</Text>
              <Text style={{ fontSize: 12, color: '#7A9A7E', marginTop: 3, lineHeight: 17 }}>{r.description}</Text>
            </View>
            <View style={{ backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5 }}>SOON</Text>
            </View>
          </View>
        ))}

      </ScrollView>
    </View>
  );
}
