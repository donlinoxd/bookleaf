import { useRouter } from 'expo-router'
import { Text, TouchableOpacity, View } from 'react-native'

export interface BookResult {
    id: number
    title: string
    author: string
    genre: string | null
    year: number | null
    language?: string | null
    material_type: string
    available_copies: number
    total_copies: number
}

export function HorizontalBookCard({ item }: { item: BookResult }) {
    const router = useRouter()
    return (
        <TouchableOpacity
            className='bg-white rounded-2xl p-3 w-36 mr-3'
            style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
            onPress={() => router.push(`/(client)/book/${item.id}`)}
        >
            <View className='w-full h-16 bg-mint rounded-xl items-center justify-center mb-2'>
                <Text className='text-2xl font-extrabold text-brand'>{item.title[0]}</Text>
            </View>
            <Text className='text-xs font-bold text-[#1C2B1E] leading-4' numberOfLines={2}>
                {item.title}
            </Text>
            <Text className='text-[10px] text-[#7A9A7E] mt-0.5' numberOfLines={1}>
                {item.author}
            </Text>
            <View className={`self-start rounded-md px-1.5 py-0.5 mt-1.5 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
                <Text className={`text-[10px] font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
                    {item.available_copies > 0 ? 'Available' : 'Unavailable'}
                </Text>
            </View>
        </TouchableOpacity>
    )
}
