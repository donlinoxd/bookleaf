import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native'
import MASCOT from '../../../assets/images/bookleaf-mascot.png'
import { HorizontalBookCard } from '../../components/books/HorizontalBookCard'
import type { BookResult } from '../../components/books/HorizontalBookCard'
import { useTRPC } from '../../lib/trpc'
import { useAppStore } from '../../store/appStore'

const MATERIAL_TYPES = ['BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER']

export default function ClientHomeScreen() {
    const { institutionId } = useAppStore()
    const iid = institutionId ?? 1
    const router = useRouter()
    const trpc = useTRPC()

    const [query, setQuery] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [searched, setSearched] = useState(false)

    const [filterVisible, setFilterVisible] = useState(false)
    const [filterType, setFilterType] = useState('')
    const [filterYearFrom, setFilterYearFrom] = useState('')
    const [filterYearTo, setFilterYearTo] = useState('')
    const [filterLanguage, setFilterLanguage] = useState('')
    const [pendingType, setPendingType] = useState('')
    const [pendingYearFrom, setPendingYearFrom] = useState('')
    const [pendingYearTo, setPendingYearTo] = useState('')
    const [pendingLanguage, setPendingLanguage] = useState('')

    const hasActiveFilters = !!(filterType || filterYearFrom || filterYearTo || filterLanguage)

    const recentQuery = useQuery(trpc.catalog.recent.queryOptions({ institutionId: iid, limit: 10 }))
    const popularQuery = useQuery(trpc.catalog.popular.queryOptions({ institutionId: iid, limit: 10 }))

    const searchQuery = useQuery({
        ...trpc.catalog.search.queryOptions({
            institutionId: iid,
            q: query,
            type: filterType || undefined,
            yearFrom: filterYearFrom ? Number(filterYearFrom) : undefined,
            yearTo: filterYearTo ? Number(filterYearTo) : undefined,
            language: filterLanguage || undefined,
        }),
        enabled: searched && !!(query || filterType || filterYearFrom || filterYearTo || filterLanguage),
    })

    const recent: BookResult[] = (recentQuery.data as BookResult[] | undefined) ?? []
    const popular: BookResult[] = (popularQuery.data as BookResult[] | undefined) ?? []
    const books: BookResult[] = (searchQuery.data as BookResult[] | undefined) ?? []
    const discoveryLoading = recentQuery.isLoading || popularQuery.isLoading
    const loading = searchQuery.isFetching

    const handleSearch = () => {
        const trimmed = searchInput.trim()
        if (!trimmed && !filterType && !filterYearFrom && !filterYearTo && !filterLanguage) return
        setQuery(trimmed)
        setSearched(true)
    }

    const applyFilters = () => {
        setFilterType(pendingType)
        setFilterYearFrom(pendingYearFrom)
        setFilterYearTo(pendingYearTo)
        setFilterLanguage(pendingLanguage)
        setFilterVisible(false)
        setQuery(searchInput.trim())
        setSearched(true)
    }

    const clearFilters = () => {
        setPendingType('')
        setPendingYearFrom('')
        setPendingYearTo('')
        setPendingLanguage('')
        setFilterType('')
        setFilterYearFrom('')
        setFilterYearTo('')
        setFilterLanguage('')
        setFilterVisible(false)
    }

    const openFilter = () => {
        setPendingType(filterType)
        setPendingYearFrom(filterYearFrom)
        setPendingYearTo(filterYearTo)
        setPendingLanguage(filterLanguage)
        setFilterVisible(true)
    }

    const BookCard = ({ item }: { item: BookResult }) => (
        <TouchableOpacity
            className='bg-white rounded-2xl flex-row p-4 mb-3'
            style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
            onPress={() => router.push(`/(client)/book/${item.id}`)}
        >
            {item.cover_uri ? (
                <Image source={{ uri: item.cover_uri }} className='w-14 h-[72px] rounded-xl' resizeMode='cover' />
            ) : (
                <View className='w-14 h-[72px] bg-mint rounded-xl items-center justify-center'>
                    <Text className='text-2xl font-extrabold text-brand'>{item.title[0]}</Text>
                </View>
            )}
            <View className='flex-1 ml-4'>
                <Text className='text-base font-bold text-[#1C2B1E] leading-5' numberOfLines={2}>
                    {item.title}
                </Text>
                <Text className='text-sm font-medium text-[#5A7A5E] mt-1'>{item.author}</Text>
                <View className='flex-row flex-wrap gap-1.5 mt-2'>
                    {item.genre && (
                        <View className='bg-mint rounded-md px-2 py-0.5'>
                            <Text className='text-xs font-semibold text-brand'>{item.genre}</Text>
                        </View>
                    )}
                    {item.year && (
                        <View className='bg-mint rounded-md px-2 py-0.5'>
                            <Text className='text-xs font-semibold text-brand'>{item.year}</Text>
                        </View>
                    )}
                    {item.language && (
                        <View className='bg-mint rounded-md px-2 py-0.5'>
                            <Text className='text-xs font-semibold text-brand'>{item.language}</Text>
                        </View>
                    )}
                </View>
                <View className={`self-start rounded-md px-2.5 py-1 mt-2 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
                    <Text className={`text-xs font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
                        {item.available_copies > 0 ? `${item.available_copies} Available` : 'Unavailable'}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    )

    return (
        <View className='flex-1 bg-bio'>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            <View className='bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]'>
                <View className='flex-row items-end mb-5'>
                    <View className='flex-1'>
                        <Text className='text-xs font-semibold text-[#A8D5A2] tracking-widest uppercase mb-1'>Welcome to</Text>
                        <Text className='text-3xl font-extrabold text-white leading-9'>Bookleaf{'\n'}Library</Text>
                    </View>
                    <Image source={MASCOT} className='w-24 h-24 -mb-2' resizeMode='contain' />
                </View>

                <View className='flex-row gap-2'>
                    <View
                        className='flex-1 flex-row bg-white rounded-2xl overflow-hidden'
                        style={{ elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 }}
                    >
                        <TextInput
                            className='flex-1 px-4 py-3.5 text-[15px] text-slate-800'
                            value={searchInput}
                            onChangeText={setSearchInput}
                            placeholder='Search books, authors, call numbers…'
                            placeholderTextColor='#94A3B8'
                            onSubmitEditing={handleSearch}
                            returnKeyType='search'
                        />
                        <TouchableOpacity className='bg-leaf px-5 justify-center' onPress={handleSearch} disabled={loading}>
                            <Text className='text-white font-bold text-sm'>{loading ? '…' : 'Search'}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                        className={`w-12 rounded-2xl items-center justify-center ${hasActiveFilters ? 'bg-leaf' : 'bg-white'}`}
                        style={{ elevation: 3 }}
                        onPress={openFilter}
                    >
                        <Ionicons name='options-outline' size={20} color={hasActiveFilters ? '#fff' : '#2A5C33'} />
                        {hasActiveFilters && <View className='absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full' />}
                    </TouchableOpacity>
                </View>
            </View>

            {searched ? (
                <FlatList
                    data={books}
                    keyExtractor={(b) => String(b.id)}
                    renderItem={({ item }) => <BookCard item={item} />}
                    contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
                    ListHeaderComponent={
                        books.length > 0 ? (
                            <View className='flex-row items-center justify-between mb-3'>
                                <Text className='text-sm text-slate-500 font-medium'>
                                    {books.length} result{books.length !== 1 ? 's' : ''}
                                </Text>
                                {hasActiveFilters && (
                                    <TouchableOpacity onPress={clearFilters} className='flex-row items-center gap-1'>
                                        <Ionicons name='close-circle' size={14} color='#DC2626' />
                                        <Text className='text-xs font-semibold text-red-600'>Clear filters</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : null
                    }
                    ListEmptyComponent={
                        loading ? (
                            <ActivityIndicator color='#2A5C33' style={{ marginTop: 40 }} />
                        ) : (
                            <View className='items-center pt-12 px-8'>
                                <Text className='text-lg font-bold text-brand mb-2'>No results found</Text>
                                <Text className='text-sm text-[#7A9A7E] text-center'>Try a different search term or adjust filters</Text>
                            </View>
                        )
                    }
                />
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
                    {discoveryLoading ? (
                        <ActivityIndicator color='#2A5C33' style={{ marginTop: 40 }} />
                    ) : (
                        <>
                            {recent.length > 0 && (
                                <View className='pt-5 gap-3'>
                                    <Text className='text-xs font-bold text-brand uppercase tracking-wider px-4'>Recently Added</Text>
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
                                <View className='pt-5 gap-3'>
                                    <Text className='text-xs font-bold text-brand uppercase tracking-wider px-4'>Most Popular</Text>
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
                            {recent.length === 0 && popular.length === 0 && (
                                <View className='items-center pt-12 px-8'>
                                    <Image source={MASCOT} className='w-36 h-36 mb-4' resizeMode='contain' />
                                    <Text className='text-lg font-bold text-brand mb-2'>Find your next read</Text>
                                    <Text className='text-sm text-[#7A9A7E] text-center leading-5'>
                                        Search the catalog by title, author, call number, or publisher
                                    </Text>
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            )}

            {/* Filter Bottom Sheet */}
            <Modal visible={filterVisible} transparent animationType='slide' onRequestClose={() => setFilterVisible(false)}>
                <View className='flex-1 bg-black/50 justify-end'>
                    <View className='bg-white rounded-t-3xl px-5 pt-5 pb-10 gap-5'>
                        <View className='flex-row items-center justify-between'>
                            <Text className='text-lg font-extrabold text-[#1C2B1E]'>Filter Results</Text>
                            <TouchableOpacity onPress={() => setFilterVisible(false)}>
                                <Ionicons name='close' size={22} color='#94A3B8' />
                            </TouchableOpacity>
                        </View>

                        <View className='gap-2'>
                            <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Material Type</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {MATERIAL_TYPES.map((t) => (
                                    <TouchableOpacity
                                        key={t}
                                        className={`px-3 py-2 rounded-full border ${pendingType === t ? 'bg-brand border-brand' : 'bg-bio border-mint'}`}
                                        onPress={() => setPendingType(pendingType === t ? '' : t)}
                                    >
                                        <Text className={`text-xs font-semibold ${pendingType === t ? 'text-white' : 'text-brand'}`}>{t}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <View className='flex-row gap-3'>
                            <View className='flex-1 gap-1'>
                                <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Year From</Text>
                                <TextInput
                                    className='bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]'
                                    value={pendingYearFrom}
                                    onChangeText={setPendingYearFrom}
                                    placeholder='e.g. 2010'
                                    placeholderTextColor='#94A3B8'
                                    keyboardType='numeric'
                                />
                            </View>
                            <View className='flex-1 gap-1'>
                                <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Year To</Text>
                                <TextInput
                                    className='bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]'
                                    value={pendingYearTo}
                                    onChangeText={setPendingYearTo}
                                    placeholder='e.g. 2024'
                                    placeholderTextColor='#94A3B8'
                                    keyboardType='numeric'
                                />
                            </View>
                        </View>

                        <View className='gap-1'>
                            <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Language</Text>
                            <TextInput
                                className='bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]'
                                value={pendingLanguage}
                                onChangeText={setPendingLanguage}
                                placeholder='e.g. English, Filipino'
                                placeholderTextColor='#94A3B8'
                            />
                        </View>

                        <View className='flex-row gap-3'>
                            <TouchableOpacity className='flex-1 bg-bio border border-mint rounded-xl py-3.5 items-center' onPress={clearFilters}>
                                <Text className='font-bold text-[#5A7A5E]'>Clear All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className='flex-1 bg-brand rounded-xl py-3.5 items-center' onPress={applyFilters}>
                                <Text className='text-white font-bold'>Apply Filters</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    )
}
