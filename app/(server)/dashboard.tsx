import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ServerStatusCard } from '../../src/components/common/ServerStatusCard'
import { queryKeys } from '../../src/lib/queryKeys'
import { BorrowService } from '../../src/services/BorrowService'
import { ReportService } from '../../src/services/ReportService'
import { useAppStore } from '../../src/store/appStore'

interface Stats {
    total_books: number
    available_copies: number
    borrowed_copies: number
}

export default function DashboardScreen() {
    const router = useRouter()
    const { currentUser, institution, settings } = useAppStore()

    const { data: stats } = useQuery({
        queryKey: queryKeys.dashboard(institution?.id ?? 0),
        queryFn: () => ReportService.inventorySummary(institution!.id) as Promise<Stats>,
        enabled: !!institution,
    })

    const { data: overdueAll = [] } = useQuery({
        queryKey: queryKeys.overdue(),
        queryFn: BorrowService.getOverdue,
    })

    const overdue = overdueAll.slice(0, 5)

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.greeting}>Hello, {currentUser?.name?.split(' ')[0]}</Text>
                <Text style={styles.institution}>{settings?.institution_name}</Text>
            </View>

            {(currentUser?.role === 'admin' || currentUser?.role === 'librarian') && institution && (
                <ServerStatusCard institutionId={institution.id} />
            )}

            <View style={styles.statsRow}>
                <StatCard label='Total Books' value={stats?.total_books ?? 0} color='#2563EB' />
                <StatCard label='Available' value={stats?.available_copies ?? 0} color='#16A34A' />
                <StatCard label='Borrowed' value={stats?.borrowed_copies ?? 0} color='#D97706' />
                <StatCard label='Overdue' value={overdue.length} color='#DC2626' />
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Overdue Books</Text>
                {overdue.length === 0 ? (
                    <Text style={styles.emptyText}>No overdue books</Text>
                ) : (
                    overdue.map((record) => (
                        <View key={record.id} style={styles.overdueItem}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.overdueTitle}>{record.book_title}</Text>
                                <Text style={styles.overdueMember}>
                                    {record.member_name} • {record.member_id_number}
                                </Text>
                            </View>
                            <Text style={styles.overdueDate}>Due: {new Date(record.due_date).toLocaleDateString()}</Text>
                        </View>
                    ))
                )}
            </View>

            <View style={styles.quickActions}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.actionRow}>
                    <ActionButton label='Check Out' onPress={() => router.push('/(server)/borrow')} color='#2563EB' />
                    <ActionButton label='Return Book' onPress={() => router.push('/(server)/borrow')} color='#16A34A' />
                    <ActionButton label='Add Book' onPress={() => router.push('/(server)/books')} color='#7C3AED' />
                </View>
            </View>
        </ScrollView>
    )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <View style={[styles.statCard, { borderTopColor: color }]}>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    )
}

function ActionButton({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
    return (
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: color }]} onPress={onPress}>
            <Text style={styles.actionLabel}>{label}</Text>
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { backgroundColor: '#2563EB', padding: 24, paddingTop: 56 },
    greeting: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
    institution: { fontSize: 14, color: '#BFDBFE', marginTop: 2 },
    statsRow: { flexDirection: 'row', padding: 16, gap: 8 },
    statCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 10,
        alignItems: 'center',
        borderTopWidth: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        elevation: 2,
    },
    statValue: { fontSize: 22, fontWeight: '700' },
    statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, textAlign: 'center' },
    section: { margin: 16, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, elevation: 1 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
    emptyText: { color: '#94A3B8', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
    overdueItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    overdueTitle: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
    overdueMember: { fontSize: 12, color: '#64748B', marginTop: 2 },
    overdueDate: { fontSize: 12, color: '#DC2626', fontWeight: '600' },
    quickActions: { margin: 16 },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionButton: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
    actionLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
})
