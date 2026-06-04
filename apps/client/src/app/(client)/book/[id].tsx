import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
    ActivityIndicator, Alert, FlatList, Image, Linking, Modal, ScrollView, StatusBar,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { getTRPCErrorMessage, isTRPCUnauthorized, useTRPC } from '../../../lib/trpc'
import { useAppStore } from '../../../store/appStore'

interface BookDetail {
    id: number
    title: string
    author: string
    publisher: string | null
    year: number | null
    genre: string | null
    description: string | null
    material_type: string
    language: string | null
    call_number: string | null
    isbn: string | null
    edition: string | null
    url: string | null
    subject_headings: string | null
    cover_uri: string | null
    shelf_locations: string[] | undefined
    available_copies: number
    total_copies: number
}

interface SimilarBook {
    id: number
    title: string
    author: string
    genre: string | null
    cover_uri: string | null
    available_copies: number
    total_copies: number
}

interface Review {
    id: number
    rating: number
    comment: string | null
    created_at: string
    member_name: string
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
    return (
        <View className='flex-row gap-0.5'>
            {[1, 2, 3, 4, 5].map((s) => (
                <Ionicons key={s} name={s <= Math.round(rating) ? 'star' : 'star-outline'} size={size} color='#F59E0B' />
            ))}
        </View>
    )
}

export default function ClientBookDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const router = useRouter()
    const currentUser = useAppStore((s) => s.currentUser)
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const resourceId = Number(id)
    const isSignedIn = !!currentUser

    const [reviewModalVisible, setReviewModalVisible] = useState(false)
    const [reviewRating, setReviewRating] = useState(5)
    const [reviewComment, setReviewComment] = useState('')

    const bookQuery = useQuery(trpc.catalog.byId.queryOptions({ id: resourceId }))
    const similarQuery = useQuery(trpc.catalog.similar.queryOptions({ id: resourceId }))
    const reviewsQuery = useQuery(trpc.books.reviews.queryOptions({ resourceId }))
    const favoriteStatusQuery = useQuery({
        ...trpc.books.favoriteStatus.queryOptions({ resourceId }),
        enabled: isSignedIn,
    })

    const book = bookQuery.data as BookDetail | undefined
    const similar: SimilarBook[] = (similarQuery.data as SimilarBook[] | undefined) ?? []
    const reviewsData = reviewsQuery.data as { reviews: Review[]; avg_rating: number | null } | undefined
    const reviews: Review[] = reviewsData?.reviews ?? []
    const avgRating: number = reviewsData?.avg_rating ?? 0
    const favorited: boolean = favoriteStatusQuery.data?.favorited ?? false

    const loading = bookQuery.isLoading

    const requireSignIn = (action: string) => {
        Alert.alert('Sign In Required', `Please sign in to ${action}.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => router.push('/(auth)/login') },
        ])
    }

    const toggleFavoriteMutation = useMutation(
        trpc.books.toggleFavorite.mutationOptions({
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: trpc.books.favoriteStatus.queryKey({ resourceId }) })
                queryClient.invalidateQueries({ queryKey: trpc.me.favorites.queryKey() })
            },
            onError: (e: unknown) => {
                if (isTRPCUnauthorized(e)) {
                    useAppStore.getState().clearClientSession()
                    return
                }
                Alert.alert('Error', getTRPCErrorMessage(e))
            },
        })
    )

    const reserveMutation = useMutation(
        trpc.books.reserve.mutationOptions({
            onSuccess: () => {
                Alert.alert('Hold Placed', 'You have been added to the waitlist for this item.')
            },
            onError: (e: unknown) => {
                if (isTRPCUnauthorized(e)) {
                    useAppStore.getState().clearClientSession()
                    return
                }
                Alert.alert('Error', getTRPCErrorMessage(e))
            },
        })
    )

    const addReviewMutation = useMutation(
        trpc.books.addReview.mutationOptions({
            onSuccess: () => {
                setReviewModalVisible(false)
                setReviewComment('')
                setReviewRating(5)
                queryClient.invalidateQueries({ queryKey: trpc.books.reviews.queryKey({ resourceId }) })
                Alert.alert('Review Submitted', 'Thank you for your feedback!')
            },
            onError: (e: unknown) => {
                if (isTRPCUnauthorized(e)) {
                    useAppStore.getState().clearClientSession()
                    return
                }
                Alert.alert('Error', getTRPCErrorMessage(e))
            },
        })
    )

    const handleToggleFavorite = () => {
        if (!isSignedIn) { requireSignIn('save favorites'); return }
        toggleFavoriteMutation.mutate({ resourceId })
    }

    const handleReserve = () => {
        if (!isSignedIn) { requireSignIn('place a hold'); return }
        reserveMutation.mutate({ resourceId })
    }

    const handleOpenReview = () => {
        if (!isSignedIn) { requireSignIn('write a review'); return }
        setReviewModalVisible(true)
    }

    const handleSubmitReview = () => {
        if (!isSignedIn) return
        addReviewMutation.mutate({
            resourceId,
            rating: reviewRating,
            comment: reviewComment.trim() || undefined,
        })
    }

    if (loading) {
        return (
            <View className='flex-1 bg-bio items-center justify-center'>
                <ActivityIndicator color='#2A5C33' size='large' />
            </View>
        )
    }

    if (!book) {
        return (
            <View className='flex-1 bg-bio items-center justify-center px-8'>
                <Ionicons name='alert-circle-outline' size={48} color='#C8DFC5' />
                <Text className='text-sm text-[#94A3B8] mt-3 text-center'>Book not found</Text>
                <TouchableOpacity onPress={() => router.back()} className='mt-4'>
                    <Text className='text-brand font-semibold'>Go Back</Text>
                </TouchableOpacity>
            </View>
        )
    }

    const subjects: string[] = (() => { try { return JSON.parse(book.subject_headings ?? '[]') } catch { return [] } })()

    return (
        <ScrollView className='flex-1 bg-bio' contentContainerStyle={{ paddingBottom: 110 }}>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            {/* Header */}
            <View className='bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]'>
                <TouchableOpacity onPress={() => router.back()} className='flex-row items-center gap-1 mb-4'>
                    <Ionicons name='chevron-back' size={20} color='#A8D5A2' />
                    <Text className='text-[#A8D5A2] text-sm font-medium'>Back</Text>
                </TouchableOpacity>
                <View className='flex-row items-start gap-3'>
                    {book.cover_uri ? (
                        <Image source={{ uri: book.cover_uri }} className='w-16 h-20 rounded-xl flex-shrink-0' resizeMode='cover' />
                    ) : (
                        <View className='w-16 h-20 bg-[#1C3E23] rounded-xl items-center justify-center flex-shrink-0'>
                            <Text className='text-3xl font-extrabold text-white'>{book.title[0]}</Text>
                        </View>
                    )}
                    <View className='flex-1'>
                        <Text className='text-xl font-extrabold text-white leading-6'>{book.title}</Text>
                        <Text className='text-sm text-[#A8D5A2] mt-1'>{book.author}</Text>
                        {book.publisher && <Text className='text-xs text-[#7A9A7E] mt-0.5'>{book.publisher}{book.year ? `, ${book.year}` : ''}</Text>}
                        <View className='flex-row items-center gap-2 mt-2'>
                            <View className={`rounded-full px-2.5 py-1 ${book.available_copies > 0 ? 'bg-leaf' : 'bg-red-500'}`}>
                                <Text className='text-xs font-bold text-white'>
                                    {book.available_copies > 0 ? `${book.available_copies} Available` : 'Unavailable'}
                                </Text>
                            </View>
                            <View className='bg-[#1C3E23] rounded-full px-2.5 py-1'>
                                <Text className='text-xs font-semibold text-[#A8D5A2]'>{book.material_type}</Text>
                            </View>
                        </View>
                    </View>
                    <TouchableOpacity onPress={handleToggleFavorite} disabled={toggleFavoriteMutation.isPending} className='mt-1'>
                        <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={24} color={favorited ? '#EF4444' : '#A8D5A2'} />
                    </TouchableOpacity>
                </View>
            </View>

            <View className='px-4 pt-4 gap-4'>
                {/* Action buttons */}
                <View className='flex-row gap-3'>
                    {book.available_copies === 0 && (
                        <TouchableOpacity
                            className='flex-1 bg-brand rounded-2xl py-3.5 items-center flex-row justify-center gap-2'
                            style={{ elevation: 2 }}
                            onPress={handleReserve}
                            disabled={reserveMutation.isPending}
                        >
                            <Ionicons name='bookmark-outline' size={18} color='#fff' />
                            <Text className='text-white font-bold'>{reserveMutation.isPending ? 'Placing…' : 'Place Hold'}</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        className='flex-1 bg-white border border-mint rounded-2xl py-3.5 items-center flex-row justify-center gap-2'
                        style={{ elevation: 1 }}
                        onPress={handleOpenReview}
                    >
                        <Ionicons name='star-outline' size={18} color='#2A5C33' />
                        <Text className='text-brand font-bold'>Write Review</Text>
                    </TouchableOpacity>
                </View>

                {/* Online access buttons */}
                {book.url && (
                    <View className='flex-row gap-3'>
                        <TouchableOpacity
                            className='flex-1 bg-leaf rounded-2xl py-3.5 items-center flex-row justify-center gap-2'
                            style={{ elevation: 2, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}
                            onPress={() => Linking.openURL(book.url!)}
                        >
                            <Ionicons name='globe-outline' size={18} color='#fff' />
                            <Text className='text-white font-bold'>
                                {book.material_type === 'DIGITAL' ? 'Read Online' : 'View Online'}
                            </Text>
                        </TouchableOpacity>
                        {book.material_type === 'DIGITAL' && (
                            <TouchableOpacity
                                className='flex-1 bg-white border border-mint rounded-2xl py-3.5 items-center flex-row justify-center gap-2'
                                style={{ elevation: 1 }}
                                onPress={() => Linking.openURL(book.url!)}
                            >
                                <Ionicons name='download-outline' size={18} color='#2A5C33' />
                                <Text className='text-brand font-bold'>Download</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Meta chips */}
                <View className='flex-row flex-wrap gap-2'>
                    {book.genre && (
                        <View className='bg-mint rounded-full px-3 py-1'>
                            <Text className='text-xs font-semibold text-brand'>{book.genre}</Text>
                        </View>
                    )}
                    {book.language && (
                        <View className='bg-mint rounded-full px-3 py-1'>
                            <Text className='text-xs font-semibold text-brand'>{book.language}</Text>
                        </View>
                    )}
                    {book.edition && (
                        <View className='bg-mint rounded-full px-3 py-1'>
                            <Text className='text-xs font-semibold text-brand'>{book.edition} ed.</Text>
                        </View>
                    )}
                    {book.call_number && (
                        <View className='bg-mint rounded-full px-3 py-1'>
                            <Text className='text-xs font-semibold text-brand'>{book.call_number}</Text>
                        </View>
                    )}
                    {book.isbn && (
                        <View className='bg-mint rounded-full px-3 py-1'>
                            <Text className='text-xs font-semibold text-brand'>ISBN {book.isbn}</Text>
                        </View>
                    )}
                </View>

                {/* Shelf location */}
                {(book.shelf_locations ?? []).length > 0 && (
                    <View className='bg-white rounded-2xl p-4 gap-3' style={{ elevation: 1 }}>
                        <View className='flex-row items-center gap-2'>
                            <Ionicons name='location-outline' size={16} color='#2A5C33' />
                            <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Find It</Text>
                        </View>
                        <View className='gap-2'>
                            {(book.shelf_locations ?? []).map((loc, i) => (
                                <View key={i} className='flex-row items-center gap-3'>
                                    <View className='w-7 h-7 bg-mint rounded-lg items-center justify-center'>
                                        <Ionicons name='library-outline' size={14} color='#2A5C33' />
                                    </View>
                                    <Text className='text-sm font-semibold text-[#1C2B1E]'>{loc}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Subject headings */}
                {subjects.length > 0 && (
                    <View className='bg-white rounded-2xl p-4 gap-2' style={{ elevation: 1 }}>
                        <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Subjects</Text>
                        <View className='flex-row flex-wrap gap-1.5'>
                            {subjects.map((s, i) => (
                                <View key={i} className='bg-bio border border-mint rounded-md px-2 py-1'>
                                    <Text className='text-xs text-[#1C2B1E]'>{s}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Description */}
                {book.description && (
                    <View className='bg-white rounded-2xl p-4 gap-2' style={{ elevation: 1 }}>
                        <Text className='text-xs font-bold text-brand uppercase tracking-wider'>About</Text>
                        <Text className='text-sm text-[#3A4A3E] leading-5'>{book.description}</Text>
                    </View>
                )}

                {/* Ratings summary */}
                {reviews.length > 0 && (
                    <View className='bg-white rounded-2xl p-4 flex-row items-center gap-4' style={{ elevation: 1 }}>
                        <View className='items-center'>
                            <Text className='text-4xl font-extrabold text-brand'>{avgRating.toFixed(1)}</Text>
                            <Stars rating={avgRating} size={12} />
                            <Text className='text-xs text-[#94A3B8] mt-1'>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</Text>
                        </View>
                        <View className='flex-1 gap-1'>
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count = reviews.filter((r) => r.rating === star).length
                                const pct = reviews.length ? (count / reviews.length) * 100 : 0
                                return (
                                    <View key={star} className='flex-row items-center gap-2'>
                                        <Text className='text-[10px] text-[#94A3B8] w-2'>{star}</Text>
                                        <View className='flex-1 h-1.5 bg-bio rounded-full overflow-hidden'>
                                            <View className='h-full bg-amber-400 rounded-full' style={{ width: `${pct}%` }} />
                                        </View>
                                    </View>
                                )
                            })}
                        </View>
                    </View>
                )}

                {/* Reviews list */}
                {reviews.length > 0 && (
                    <View className='gap-2'>
                        <Text className='text-xs font-bold text-brand uppercase tracking-wider px-1'>Reviews</Text>
                        {reviews.slice(0, 5).map((r) => (
                            <View key={r.id} className='bg-white rounded-2xl p-4 gap-1.5' style={{ elevation: 1 }}>
                                <View className='flex-row items-center justify-between'>
                                    <Text className='text-sm font-semibold text-[#1C2B1E]'>{r.member_name}</Text>
                                    <Stars rating={r.rating} size={12} />
                                </View>
                                {r.comment && <Text className='text-sm text-[#5A7A5E] leading-5'>{r.comment}</Text>}
                                <Text className='text-xs text-[#94A3B8]'>{new Date(r.created_at).toLocaleDateString()}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Similar books */}
                {similar.length > 0 && (
                    <View className='gap-2'>
                        <Text className='text-xs font-bold text-brand uppercase tracking-wider px-1'>You May Also Like</Text>
                        <FlatList
                            horizontal
                            data={similar}
                            keyExtractor={(s) => String(s.id)}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 10, paddingRight: 4 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    className='bg-white rounded-2xl p-3 w-36'
                                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                    onPress={() => router.push(`/(client)/book/${item.id}`)}
                                >
                                    {item.cover_uri ? (
                                        <Image source={{ uri: item.cover_uri }} className='w-full h-16 rounded-xl mb-2' resizeMode='cover' />
                                    ) : (
                                        <View className='w-full h-16 bg-mint rounded-xl items-center justify-center mb-2'>
                                            <Text className='text-2xl font-extrabold text-brand'>{item.title[0]}</Text>
                                        </View>
                                    )}
                                    <Text className='text-xs font-bold text-[#1C2B1E] leading-4' numberOfLines={2}>{item.title}</Text>
                                    <Text className='text-[10px] text-[#7A9A7E] mt-0.5' numberOfLines={1}>{item.author}</Text>
                                    <View className={`self-start rounded-md px-1.5 py-0.5 mt-1.5 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
                                        <Text className={`text-[10px] font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
                                            {item.available_copies > 0 ? 'Available' : 'Unavailable'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                )}
            </View>

            {/* Review Modal */}
            <Modal visible={reviewModalVisible} transparent animationType='slide' onRequestClose={() => setReviewModalVisible(false)}>
                <View className='flex-1 bg-black/50 justify-end'>
                    <View className='bg-white rounded-t-3xl p-6 gap-4'>
                        <Text className='text-lg font-extrabold text-[#1C2B1E]'>Write a Review</Text>
                        <Text className='text-xs text-[#94A3B8]'>You must have borrowed this item to leave a review.</Text>
                        <View className='gap-1'>
                            <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Rating</Text>
                            <View className='flex-row gap-3 py-1'>
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <TouchableOpacity key={s} onPress={() => setReviewRating(s)}>
                                        <Ionicons name={s <= reviewRating ? 'star' : 'star-outline'} size={32} color='#F59E0B' />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <TextInput
                            className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                            value={reviewComment}
                            onChangeText={setReviewComment}
                            placeholder='Share your thoughts (optional)'
                            placeholderTextColor='#94A3B8'
                            multiline
                            numberOfLines={3}
                            style={{ minHeight: 80, textAlignVertical: 'top' }}
                        />
                        <View className='flex-row gap-3'>
                            <TouchableOpacity
                                className='flex-1 bg-bio border border-mint rounded-xl py-3 items-center'
                                onPress={() => { setReviewModalVisible(false); setReviewComment(''); setReviewRating(5) }}
                            >
                                <Text className='font-bold text-[#5A7A5E]'>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className='flex-1 bg-brand rounded-xl py-3 items-center'
                                onPress={handleSubmitReview}
                                disabled={addReviewMutation.isPending}
                            >
                                {addReviewMutation.isPending ? <ActivityIndicator color='#fff' size='small' /> : <Text className='text-white font-bold'>Submit</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    )
}
