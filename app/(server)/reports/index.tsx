import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const BRAND = '#2A5C33'

interface ReportCard {
    title: string
    description: string
    icon: string
    color: string
    bg: string
    route: string
    badge?: string
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
    {
        title: 'Circulation Report',
        description: 'Most borrowed books, overdue materials, monthly trends, and top borrowers.',
        icon: 'swap-horizontal-outline',
        color: '#0F766E',
        bg: '#CCFBF1',
        route: '/(server)/reports/circulation',
    },
    {
        title: 'Inventory & Audit',
        description: 'Accession register, condition by material type, and last physical inventory count results.',
        icon: 'clipboard-outline',
        color: '#7C3AED',
        bg: '#EDE9FE',
        route: '/(server)/reports/inventory',
    },
    {
        title: 'Fines Report',
        description: 'Total fines issued, collected vs. pending, monthly trends, and top debtors.',
        icon: 'cash-outline',
        color: '#B45309',
        bg: '#FEF3C7',
        route: '/(server)/reports/fines',
    },
    {
        title: 'Patron Report',
        description: 'Registered members by type and department, attendance trends, and new registrations.',
        icon: 'people-outline',
        color: '#0F766E',
        bg: '#CCFBF1',
        route: '/(server)/reports/patron',
        badge: 'CHED',
    },
]

const COMING_SOON: { title: string; description: string; icon: string }[] = []

export default function ReportsHubScreen() {
    const insets = useSafeAreaInsets()
    const router = useRouter()

    return (
        <View className='flex-1 bg-[#F4F9F4]'>
            <StatusBar barStyle='light-content' backgroundColor={BRAND} />

            <View
                style={{ paddingTop: insets.top + 16 }}
                className='bg-brand px-5 pb-6 rounded-b-[28px]'
            >
                <Text className='text-[#A8D5A2] text-[11px] font-semibold tracking-[1.2px] uppercase'>
                    Library Reports
                </Text>
                <Text className='text-white text-[24px] font-extrabold mt-1'>Reports</Text>
                <Text className='text-[#A8D5A2] text-[13px] mt-1'>Generate and share accreditation-ready reports.</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                <Text className='text-[11px] font-bold text-[#7A9A7E] tracking-[0.8px] uppercase mb-1'>
                    Available
                </Text>

                {REPORTS.map((report) => (
                    <TouchableOpacity
                        key={report.title}
                        className='bg-white rounded-2xl p-4 flex-row items-center gap-[14px]'
                        style={{ elevation: 2, shadowColor: BRAND, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                        onPress={() => router.push(report.route as any)}
                    >
                        <View
                            style={{ backgroundColor: report.bg }}
                            className='w-12 h-12 rounded-[14px] items-center justify-center'
                        >
                            <Ionicons name={report.icon as any} size={24} color={report.color} />
                        </View>
                        <View className='flex-1'>
                            <View className='flex-row items-center gap-2'>
                                <Text className='text-[14px] font-extrabold text-[#1C2B1E]'>{report.title}</Text>
                                {report.badge && (
                                    <View className='bg-[#DCFCE7] rounded px-[6px] py-[2px]'>
                                        <Text className='text-[9px] font-bold text-brand tracking-[0.5px]'>{report.badge}</Text>
                                    </View>
                                )}
                            </View>
                            <Text className='text-[12px] text-[#7A9A7E] mt-[3px] leading-[17px]'>{report.description}</Text>
                        </View>
                        <Ionicons name='chevron-forward' size={18} color='#CBD5E1' />
                    </TouchableOpacity>
                ))}

                {COMING_SOON.length > 0 && (
                    <Text className='text-[11px] font-bold text-[#7A9A7E] tracking-[0.8px] uppercase mt-2 mb-1'>
                        Coming Soon
                    </Text>
                )}

                {COMING_SOON.map((r) => (
                    <View
                        key={r.title}
                        className='bg-white rounded-2xl p-4 flex-row items-center gap-[14px] opacity-50'
                        style={{ elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 }}
                    >
                        <View className='w-12 h-12 rounded-[14px] bg-[#F1F5F9] items-center justify-center'>
                            <Ionicons name={r.icon as any} size={24} color='#94A3B8' />
                        </View>
                        <View className='flex-1'>
                            <Text className='text-[14px] font-extrabold text-[#1C2B1E]'>{r.title}</Text>
                            <Text className='text-[12px] text-[#7A9A7E] mt-[3px] leading-[17px]'>{r.description}</Text>
                        </View>
                        <View className='bg-[#F1F5F9] rounded-md px-2 py-[3px]'>
                            <Text className='text-[9px] font-bold text-[#94A3B8] tracking-[0.5px]'>SOON</Text>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </View>
    )
}
