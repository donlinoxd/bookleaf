import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Alert, ScrollView, StatusBar, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native'
import { getTRPCErrorMessage, isTRPCUnauthorized, useTRPC } from '../../lib/trpc'
import { useAppStore } from '../../store/appStore'

interface BorrowInfo {
    id: number
    resource_id: number
    book_title: string
    book_author: string
    due_date: string
    returned_at: string | null
    renewal_count: number
    fine_amount: number
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

interface Favorite {
    id: number
    resource_id: number
    book_title: string
    book_author: string
    available_copies: number
}

export default function MyBooksScreen() {
    const { currentUser } = useAppStore()
    const router = useRouter()
    const trpc = useTRPC()
    const queryClient = useQueryClient()

    const borrowsQuery = useQuery({
        ...trpc.me.borrows.queryOptions(),
        enabled: !!currentUser,
    })
    const reservationsQuery = useQuery({
        ...trpc.me.reservations.queryOptions(),
        enabled: !!currentUser,
    })
    const favoritesQuery = useQuery({
        ...trpc.me.favorites.queryOptions(),
        enabled: !!currentUser,
    })

    const borrowsData = borrowsQuery.data as { borrows: BorrowInfo[]; total_fines: number } | undefined
    const borrows: BorrowInfo[] = borrowsData?.borrows ?? []
    const fines: number = borrowsData?.total_fines ?? 0

    const reservationsData = reservationsQuery.data as { reservations: Reservation[] } | undefined
    const reservations: Reservation[] = reservationsData?.reservations ?? []

    const favoritesData = favoritesQuery.data as { favorites: Favorite[] } | undefined
    const favorites: Favorite[] = favoritesData?.favorites ?? []

    const loading = borrowsQuery.isLoading || reservationsQuery.isLoading || favoritesQuery.isLoading
    const loaded = borrowsQuery.isSuccess

    const renewMutation = useMutation(
        trpc.borrows.renew.mutationOptions({
            onSuccess: (data: any) => {
                queryClient.invalidateQueries({ queryKey: trpc.me.borrows.queryKey() })
                Alert.alert('Renewed', `New due date: ${new Date(data.new_due_date).toLocaleDateString()}`)
            },
            onError: (e: unknown) => {
                if (isTRPCUnauthorized(e)) {
                    useAppStore.getState().clearClientSession()
                    return
                }
                Alert.alert('Cannot Renew', getTRPCErrorMessage(e))
            },
        })
    )

    const daysUntil = (dueDate: string) =>
        Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

    const dueDateLabel = (dueDate: string) => {
        const d = daysUntil(dueDate)
        if (d < 0) return `${Math.abs(d)} day${Math.abs(d) !== 1 ? 's' : ''} overdue`
        if (d === 0) return 'Due today'
        return `${d} day${d !== 1 ? 's' : ''} left`
    }

    const active = borrows.filter((b) => !b.returned_at)
    const history = borrows.filter((b) => !!b.returned_at)

    // Guest state — prompt to sign in
    if (!currentUser) {
        return (
            <View className='flex-1 bg-bio'>
                <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />
                <View className='bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]'>
                    <Text className='text-2xl font-extrabold text-white'>My Account</Text>
                    <Text className='text-xs text-[#A8D5A2] mt-1'>Borrows, holds, and favorites</Text>
                </View>
                <View className='flex-1 items-center justify-center px-8 gap-4'>
                    <View className='w-16 h-16 bg-mint rounded-2xl items-center justify-center'>
                        <Ionicons name='person-circle-outline' size={36} color='#2A5C33' />
                    </View>
                    <View className='items-center gap-1'>
                        <Text className='text-base font-bold text-[#1C2B1E]'>Sign in to view your account</Text>
                        <Text className='text-sm text-[#7A9A7E] text-center'>See your borrowed books, active holds, favorites, and reading history.</Text>
                    </View>
                    <TouchableOpacity
                        className='bg-leaf rounded-2xl px-8 py-3.5 mt-2'
                        onPress={() => router.push('/(auth)/login')}
                        style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
                    >
                        <Text className='text-white font-bold'>Sign In</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    return (
        <ScrollView className='flex-1 bg-bio' contentContainerStyle={{ paddingBottom: 110 }}>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            <View className='bg-brand px-5 pb-5 pt-[52px] rounded-b-[28px]'>
                <Text className='text-2xl font-extrabold text-white mb-0.5'>My Account</Text>
                <Text className='text-xs text-[#A8D5A2]'>{currentUser.name} · {currentUser.id_number}</Text>
            </View>

            {loading ? (
                <ActivityIndicator color='#2A5C33' style={{ marginTop: 48 }} />
            ) : !loaded ? (
                <View className='items-center pt-12 px-8'>
                    <Ionicons name='reload-outline' size={40} color='#C8DFC5' />
                    <Text className='text-sm text-[#94A3B8] mt-3'>Loading your account…</Text>
                </View>
            ) : (
                <View className='px-4 pt-4 gap-4'>
                    {fines > 0 && (
                        <View className='bg-red-50 border-l-4 border-red-500 rounded-r-2xl px-4 py-3'>
                            <Text className='text-sm font-bold text-red-600'>Outstanding fines: ₱{fines.toFixed(2)}</Text>
                            <Text className='text-xs text-red-400 mt-0.5'>Please settle with the librarian</Text>
                        </View>
                    )}

                    {/* Active borrows */}
                    {active.length > 0 && (
                        <View className='gap-2'>
                            <View className='flex-row items-center gap-2'>
                                <View className='w-2 h-2 rounded-full bg-leaf' />
                                <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Currently Borrowed</Text>
                            </View>
                            {active.map((item) => {
                                const days = daysUntil(item.due_date)
                                const overdue = days < 0
                                const dueSoon = days >= 0 && days <= 3
                                return (
                                    <View key={item.id} className='bg-white rounded-2xl px-4 py-3.5'
                                        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                                        <TouchableOpacity onPress={() => router.push(`/(client)/book/${item.resource_id}`)}>
                                            <Text className='text-sm font-bold text-[#1C2B1E]' numberOfLines={1}>{item.book_title}</Text>
                                            <Text className='text-xs text-[#5A7A5E] mt-0.5'>{item.book_author}</Text>
                                        </TouchableOpacity>
                                        <View className='flex-row items-center justify-between mt-2'>
                                            <View className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${overdue ? 'bg-red-100' : dueSoon ? 'bg-amber-50' : 'bg-mint'}`}>
                                                <Ionicons
                                                    name={overdue ? 'alert-circle' : 'time-outline'}
                                                    size={11}
                                                    color={overdue ? '#DC2626' : dueSoon ? '#D97706' : '#2A5C33'}
                                                />
                                                <Text className={`text-xs font-semibold ${overdue ? 'text-red-600' : dueSoon ? 'text-amber-700' : 'text-brand'}`}>
                                                    {dueDateLabel(item.due_date)}
                                                </Text>
                                            </View>
                                            <Text className='text-[10px] text-[#94A3B8]'>Renewed {item.renewal_count}×</Text>
                                        </View>
                                        {item.fine_amount > 0 && (
                                            <View className='flex-row items-center gap-1.5 mt-2 bg-red-50 rounded-xl px-3 py-1.5'>
                                                <Ionicons name='receipt-outline' size={13} color='#DC2626' />
                                                <Text className='text-xs font-bold text-red-600'>Fine: ₱{item.fine_amount.toFixed(2)}</Text>
                                            </View>
                                        )}
                                        <TouchableOpacity
                                            className='mt-2.5 bg-mint border border-[#C8DFC5] rounded-xl py-2 items-center'
                                            onPress={() => renewMutation.mutate({ borrowingId: item.id })}
                                            disabled={renewMutation.isPending}
                                        >
                                            {renewMutation.isPending
                                                ? <ActivityIndicator color='#2A5C33' size='small' />
                                                : <Text className='text-xs font-bold text-brand'>Renew</Text>}
                                        </TouchableOpacity>
                                    </View>
                                )
                            })}
                        </View>
                    )}

                    {/* Holds / Reservations */}
                    {reservations.length > 0 && (
                        <View className='gap-2'>
                            <View className='flex-row items-center gap-2'>
                                <View className='w-2 h-2 rounded-full bg-amber-400' />
                                <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Active Holds</Text>
                            </View>
                            {reservations.map((item) => {
                                const ready = item.available_copies > 0
                                return (
                                    <View key={item.id} className='bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3'
                                        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                                        <View className={`w-9 h-9 rounded-full items-center justify-center ${ready ? 'bg-mint' : 'bg-amber-50'}`}>
                                            <Ionicons name='bookmark' size={16} color={ready ? '#2A5C33' : '#D97706'} />
                                        </View>
                                        <TouchableOpacity className='flex-1' onPress={() => router.push(`/(client)/book/${item.resource_id}`)}>
                                            <Text className='text-sm font-bold text-[#1C2B1E]' numberOfLines={1}>{item.book_title}</Text>
                                            <Text className='text-xs text-[#5A7A5E]'>{item.book_author}</Text>
                                            <Text className='text-xs text-[#94A3B8] mt-0.5'>
                                                Placed {new Date(item.reserved_at).toLocaleDateString()}
                                            </Text>
                                        </TouchableOpacity>
                                        <View className={`rounded-full px-2.5 py-1 ${ready ? 'bg-leaf' : 'bg-amber-100'}`}>
                                            <Text className={`text-[10px] font-bold ${ready ? 'text-white' : 'text-amber-700'}`}>
                                                {ready ? 'Ready' : 'In Queue'}
                                            </Text>
                                        </View>
                                    </View>
                                )
                            })}
                        </View>
                    )}

                    {/* Favorites */}
                    {favorites.length > 0 && (
                        <View className='gap-2'>
                            <View className='flex-row items-center gap-2'>
                                <View className='w-2 h-2 rounded-full bg-red-400' />
                                <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Saved Favorites</Text>
                            </View>
                            {favorites.map((item) => (
                                <TouchableOpacity key={item.id}
                                    className='bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3'
                                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                    onPress={() => router.push(`/(client)/book/${item.resource_id}`)}
                                >
                                    <View className='w-9 h-9 rounded-full bg-red-50 items-center justify-center'>
                                        <Ionicons name='heart' size={16} color='#EF4444' />
                                    </View>
                                    <View className='flex-1'>
                                        <Text className='text-sm font-bold text-[#1C2B1E]' numberOfLines={1}>{item.book_title}</Text>
                                        <Text className='text-xs text-[#5A7A5E]'>{item.book_author}</Text>
                                    </View>
                                    <View className={`rounded-md px-2 py-0.5 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
                                        <Text className={`text-[10px] font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
                                            {item.available_copies > 0 ? 'Available' : 'Unavailable'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Borrow history */}
                    {history.length > 0 && (
                        <View className='gap-2'>
                            <View className='flex-row items-center gap-2'>
                                <View className='w-2 h-2 rounded-full bg-[#C8DFC5]' />
                                <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Reading History</Text>
                            </View>
                            {history.map((item) => (
                                <TouchableOpacity key={item.id}
                                    className='bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3'
                                    style={{ elevation: 1 }}
                                    onPress={() => router.push(`/(client)/book/${item.resource_id}`)}
                                >
                                    <View className='w-9 h-9 rounded-full bg-[#E2EFE0] items-center justify-center'>
                                        <Ionicons name='checkmark' size={16} color='#2A5C33' />
                                    </View>
                                    <View className='flex-1'>
                                        <Text className='text-sm font-semibold text-[#1C2B1E]' numberOfLines={1}>{item.book_title}</Text>
                                        <Text className='text-xs text-[#5A7A5E]'>{item.book_author}</Text>
                                        <Text className='text-xs text-leaf font-medium mt-0.5'>
                                            Returned {new Date(item.returned_at!).toLocaleDateString()}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {active.length === 0 && reservations.length === 0 && favorites.length === 0 && history.length === 0 && (
                        <View className='items-center py-10 gap-2'>
                            <Ionicons name='bookmark-outline' size={48} color='#C8DFC5' />
                            <Text className='text-sm text-[#94A3B8]'>No activity found</Text>
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    )
}
