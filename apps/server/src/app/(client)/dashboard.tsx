import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { HorizontalBookCard } from '../../src/components/books/HorizontalBookCard'
import type { BookResult } from '../../src/components/books/HorizontalBookCard'
import { useAppStore } from '../../src/store/appStore'

interface BorrowInfo {
    id: number
    resource_id: number
    book_title: string
    book_author: string
    due_date: string
    returned_at: string | null
    renewal_count: number
}

interface Reservation {
    id: number
    resource_id: number
    book_title: string
    book_author: string
    reserved_at: string
    status: string
    available_copies: number
}

const DAYS_UNTIL_DUE_WARNING = 3

function getGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

function daysUntil(dateStr: string) {
    const diff = new Date(dateStr).getTime() - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function DashboardScreen() {
    const { serverUrl, currentUser } = useAppStore()
    const router = useRouter()

    const [borrows, setBorrows] = useState<BorrowInfo[]>([])
    const [reservations, setReservations] = useState<Reservation[]>([])
    const [fines, setFines] = useState(0)
    const [recent, setRecent] = useState<BookResult[]>([])
    const [popular, setPopular] = useState<BookResult[]>([])
    const [loading, setLoading] = useState(false)
    const [renewingId, setRenewingId] = useState<number | null>(null)

    useEffect(() => {
        if (!serverUrl) return
        loadDashboard()
    }, [serverUrl, currentUser])

    const loadDashboard = async () => {
        if (!serverUrl) return
        setLoading(true)
        try {
            const catalogFetches = [
                fetch(`${serverUrl}/api/books/recent?limit=10`).then((r) => r.json()).catch(() => []),
                fetch(`${serverUrl}/api/books/popular?limit=10`).then((r) => r.json()).catch(() => []),
            ]

            if (currentUser) {
                const id = encodeURIComponent(currentUser.id_number)
                const [borrowRes, resRes, rec, pop] = await Promise.all([
                    fetch(`${serverUrl}/api/members/${id}/borrows`).then((r) => r.json()).catch(() => null),
                    fetch(`${serverUrl}/api/members/${id}/reservations`).then((r) => r.json()).catch(() => null),
                    ...catalogFetches,
                ])
                if (borrowRes) {
                    setBorrows(borrowRes.borrows ?? [])
                    setFines(borrowRes.total_fines ?? 0)
                }
                if (resRes) setReservations(resRes.reservations ?? [])
                setRecent(rec ?? [])
                setPopular(pop ?? [])
            } else {
                const [rec, pop] = await Promise.all(catalogFetches)
                setRecent(rec ?? [])
                setPopular(pop ?? [])
            }
        } finally {
            setLoading(false)
        }
    }

    const handleRenew = async (borrowId: number) => {
        if (!currentUser || !serverUrl) return
        setRenewingId(borrowId)
        try {
            const res = await fetch(`${serverUrl}/api/borrows/${borrowId}/renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idNumber: currentUser.id_number }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setBorrows((prev) =>
                prev.map((b) =>
                    b.id === borrowId ? { ...b, due_date: data.new_due_date, renewal_count: b.renewal_count + 1 } : b
                )
            )
            Alert.alert('Renewed', `New due date: ${new Date(data.new_due_date).toLocaleDateString()}`)
        } catch (e: any) {
            Alert.alert('Cannot Renew', e.message)
        } finally {
            setRenewingId(null)
        }
    }

    const active = borrows.filter((b) => !b.returned_at)
    const overdueBorrows = active.filter((b) => daysUntil(b.due_date) < 0)
    const dueSoonBorrows = active.filter((b) => {
        const d = daysUntil(b.due_date)
        return d >= 0 && d <= DAYS_UNTIL_DUE_WARNING
    })
    const activeReservations = reservations.filter((r) => r.status === 'pending' || r.status === 'active')

    const AlertBanner = () => {
        if (overdueBorrows.length > 0 || fines > 0) {
            return (
                <View className='bg-red-50 border-l-4 border-red-500 rounded-r-2xl px-4 py-3 gap-0.5'>
                    <Text className='text-sm font-bold text-red-600'>
                        {overdueBorrows.length > 0
                            ? `${overdueBorrows.length} overdue book${overdueBorrows.length > 1 ? 's' : ''}`
                            : `Outstanding fines: ₱${fines.toFixed(2)}`}
                    </Text>
                    <Text className='text-xs text-red-400'>
                        {overdueBorrows.length > 0 && fines > 0
                            ? `₱${fines.toFixed(2)} in fines — please return and settle with the librarian`
                            : overdueBorrows.length > 0
                            ? 'Please return overdue items as soon as possible'
                            : 'Please settle with the librarian'}
                    </Text>
                </View>
            )
        }
        if (dueSoonBorrows.length > 0) {
            return (
                <View className='bg-amber-50 border-l-4 border-amber-400 rounded-r-2xl px-4 py-3 gap-0.5'>
                    <Text className='text-sm font-bold text-amber-700'>
                        {dueSoonBorrows.length} book{dueSoonBorrows.length > 1 ? 's' : ''} due soon
                    </Text>
                    <Text className='text-xs text-amber-500'>
                        Due within {DAYS_UNTIL_DUE_WARNING} days — renew or return to avoid fines
                    </Text>
                </View>
            )
        }
        return null
    }

    const QuickStat = ({ icon, label, value, color, onPress }: { icon: any; label: string; value: string | number; color: string; onPress: () => void }) => (
        <TouchableOpacity
            onPress={onPress}
            className='flex-1 bg-white rounded-2xl px-3 py-3 items-center gap-1'
            style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
        >
            <Ionicons name={icon} size={20} color={color} />
            <Text className='text-base font-extrabold text-[#1C2B1E]'>{value}</Text>
            <Text className='text-[10px] text-[#94A3B8] font-medium text-center' numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
    )

    const SectionHeader = ({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) => (
        <View className='flex-row items-center justify-between px-4'>
            <Text className='text-xs font-bold text-brand uppercase tracking-wider'>{title}</Text>
            {onSeeAll && (
                <TouchableOpacity onPress={onSeeAll}>
                    <Text className='text-xs font-semibold text-leaf'>See all</Text>
                </TouchableOpacity>
            )}
        </View>
    )

    return (
        <View className='flex-1 bg-bio'>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            {/* Header */}
            <View className='bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]'>
                {currentUser ? (
                    <>
                        <Text className='text-xs font-semibold text-[#A8D5A2] tracking-widest uppercase mb-1'>
                            {getGreeting()}
                        </Text>
                        <Text className='text-2xl font-extrabold text-white leading-8' numberOfLines={1}>
                            {currentUser.name.split(' ')[0]}
                        </Text>
                        <Text className='text-xs text-[#A8D5A2] mt-0.5'>{currentUser.id_number}</Text>
                    </>
                ) : (
                    <>
                        <Text className='text-xs font-semibold text-[#A8D5A2] tracking-widest uppercase mb-1'>
                            Welcome to
                        </Text>
                        <Text className='text-2xl font-extrabold text-white leading-8'>Bookleaf Library</Text>
                        <TouchableOpacity
                            className='self-start mt-3 bg-leaf rounded-xl px-4 py-2'
                            onPress={() => router.push('/(auth)/client-login')}
                            style={{ elevation: 4, shadowColor: '#5CB85C', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6 }}
                        >
                            <Text className='text-white font-bold text-sm'>Sign In</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {loading ? (
                <ActivityIndicator color='#2A5C33' style={{ marginTop: 48 }} />
            ) : (
                <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 110, gap: 20 }} showsVerticalScrollIndicator={false}>

                    {/* Patron sections — logged in only */}
                    {currentUser && (
                        <>
                            {/* Alert banner */}
                            <View className='px-4'>
                                <AlertBanner />
                            </View>

                            {/* Quick stats */}
                            <View className='flex-row px-4 gap-3'>
                                <QuickStat
                                    icon='book-outline'
                                    label='Active Borrows'
                                    value={active.length}
                                    color='#2A5C33'
                                    onPress={() => router.push('/(client)/my-books')}
                                />
                                <QuickStat
                                    icon='bookmark-outline'
                                    label='Holds'
                                    value={activeReservations.length}
                                    color='#D97706'
                                    onPress={() => router.push('/(client)/my-books')}
                                />
                                <QuickStat
                                    icon='receipt-outline'
                                    label='Fines'
                                    value={fines > 0 ? `₱${fines.toFixed(0)}` : '₱0'}
                                    color={fines > 0 ? '#DC2626' : '#2A5C33'}
                                    onPress={() => router.push('/(client)/my-books')}
                                />
                            </View>

                            {/* Active borrows preview */}
                            {active.length > 0 && (
                                <View className='gap-3'>
                                    <SectionHeader
                                        title='Currently Borrowed'
                                        onSeeAll={() => router.push('/(client)/my-books')}
                                    />
                                    <View className='px-4 gap-2'>
                                        {active.slice(0, 3).map((item) => {
                                            const days = daysUntil(item.due_date)
                                            const isOverdue = days < 0
                                            const isDueSoon = days >= 0 && days <= DAYS_UNTIL_DUE_WARNING
                                            return (
                                                <View
                                                    key={item.id}
                                                    className='bg-white rounded-2xl px-4 py-3.5'
                                                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                                >
                                                    <TouchableOpacity onPress={() => router.push(`/(client)/book/${item.resource_id}`)}>
                                                        <Text className='text-sm font-bold text-[#1C2B1E]' numberOfLines={1}>
                                                            {item.book_title}
                                                        </Text>
                                                        <Text className='text-xs text-[#5A7A5E] mt-0.5'>{item.book_author}</Text>
                                                    </TouchableOpacity>
                                                    <View className='flex-row items-center justify-between mt-2'>
                                                        <View className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${isOverdue ? 'bg-red-100' : isDueSoon ? 'bg-amber-50' : 'bg-mint'}`}>
                                                            <Ionicons
                                                                name={isOverdue ? 'alert-circle' : 'time-outline'}
                                                                size={11}
                                                                color={isOverdue ? '#DC2626' : isDueSoon ? '#D97706' : '#2A5C33'}
                                                            />
                                                            <Text className={`text-xs font-semibold ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-amber-700' : 'text-brand'}`}>
                                                                {isOverdue
                                                                    ? `${Math.abs(days)}d overdue`
                                                                    : days === 0
                                                                    ? 'Due today'
                                                                    : `Due in ${days}d`}
                                                            </Text>
                                                        </View>
                                                        <TouchableOpacity
                                                            className='bg-mint border border-[#C8DFC5] rounded-xl px-3 py-1.5'
                                                            onPress={() => handleRenew(item.id)}
                                                            disabled={renewingId === item.id}
                                                        >
                                                            {renewingId === item.id ? (
                                                                <ActivityIndicator color='#2A5C33' size='small' />
                                                            ) : (
                                                                <Text className='text-xs font-bold text-brand'>Renew</Text>
                                                            )}
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )
                                        })}
                                        {active.length > 3 && (
                                            <TouchableOpacity
                                                className='items-center py-2'
                                                onPress={() => router.push('/(client)/my-books')}
                                            >
                                                <Text className='text-xs font-semibold text-leaf'>
                                                    +{active.length - 3} more — see all
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            )}

                            {/* Reservations / holds preview */}
                            {activeReservations.length > 0 && (
                                <View className='gap-3'>
                                    <SectionHeader
                                        title='Active Holds'
                                        onSeeAll={() => router.push('/(client)/my-books')}
                                    />
                                    <View className='px-4 gap-2'>
                                        {activeReservations.slice(0, 2).map((item) => (
                                            <TouchableOpacity
                                                key={item.id}
                                                className='bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3'
                                                style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                                onPress={() => router.push(`/(client)/book/${item.resource_id}`)}
                                            >
                                                <View className='w-9 h-9 rounded-full bg-amber-50 items-center justify-center'>
                                                    <Ionicons name='bookmark' size={16} color='#D97706' />
                                                </View>
                                                <View className='flex-1'>
                                                    <Text className='text-sm font-bold text-[#1C2B1E]' numberOfLines={1}>
                                                        {item.book_title}
                                                    </Text>
                                                    <Text className='text-xs text-[#5A7A5E]'>{item.book_author}</Text>
                                                </View>
                                                {item.available_copies > 0 && (
                                                    <View className='bg-leaf rounded-full px-2 py-0.5'>
                                                        <Text className='text-[10px] font-bold text-white'>Ready</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Quick actions */}
                            <View className='gap-3'>
                                <SectionHeader title='Quick Actions' />
                                <View className='flex-row px-4 gap-3'>
                                    <TouchableOpacity
                                        className='flex-1 bg-white rounded-2xl py-4 items-center gap-2'
                                        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                        onPress={() => router.push('/(client)/home')}
                                    >
                                        <View className='w-10 h-10 bg-mint rounded-xl items-center justify-center'>
                                            <Ionicons name='search-outline' size={20} color='#2A5C33' />
                                        </View>
                                        <Text className='text-xs font-bold text-[#1C2B1E]'>Search</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        className='flex-1 bg-white rounded-2xl py-4 items-center gap-2'
                                        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                        onPress={() => router.push('/(client)/my-card')}
                                    >
                                        <View className='w-10 h-10 bg-mint rounded-xl items-center justify-center'>
                                            <Ionicons name='card-outline' size={20} color='#2A5C33' />
                                        </View>
                                        <Text className='text-xs font-bold text-[#1C2B1E]'>My Card</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        className='flex-1 bg-white rounded-2xl py-4 items-center gap-2'
                                        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                        onPress={() => router.push('/(client)/gate')}
                                    >
                                        <View className='w-10 h-10 bg-mint rounded-xl items-center justify-center'>
                                            <Ionicons name='qr-code-outline' size={20} color='#2A5C33' />
                                        </View>
                                        <Text className='text-xs font-bold text-[#1C2B1E]'>Gate</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </>
                    )}

                    {/* Discovery — shown for all users */}
                    {recent.length > 0 && (
                        <View className='gap-3'>
                            <SectionHeader title='New Arrivals' onSeeAll={() => router.push('/(client)/home')} />
                            <FlatList
                                horizontal
                                data={recent}
                                keyExtractor={(b) => `rec-${b.id}`}
                                renderItem={({ item }) => <HorizontalBookCard item={item} />}
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
                            />
                        </View>
                    )}

                    {popular.length > 0 && (
                        <View className='gap-3'>
                            <SectionHeader title='Popular Right Now' onSeeAll={() => router.push('/(client)/home')} />
                            <FlatList
                                horizontal
                                data={popular}
                                keyExtractor={(b) => `pop-${b.id}`}
                                renderItem={({ item }) => <HorizontalBookCard item={item} />}
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
                            />
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    )
}
