import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppStore } from '../../../src/store/appStore';

interface BookDetail {
  id: number;
  title: string;
  author: string;
  publisher: string | null;
  year: number | null;
  genre: string | null;
  description: string | null;
  material_type: string;
  language: string | null;
  call_number: string | null;
  isbn: string | null;
  subject_headings: string | null;
  available_copies: number;
  total_copies: number;
}

interface SimilarBook {
  id: number;
  title: string;
  author: string;
  genre: string | null;
  available_copies: number;
  total_copies: number;
}

interface Review {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  member_name: string;
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons key={s} name={s <= Math.round(rating) ? 'star' : 'star-outline'} size={size} color="#F59E0B" />
      ))}
    </View>
  );
}

export default function ClientBookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const serverUrl = useAppStore((s) => s.serverUrl);
  const resourceId = Number(id);

  const [book, setBook] = useState<BookDetail | null>(null);
  const [similar, setSimilar] = useState<SimilarBook[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [favorited, setFavorited] = useState(false);

  const [reserveModalVisible, setReserveModalVisible] = useState(false);
  const [reserveId, setReserveId] = useState('');
  const [reserving, setReserving] = useState(false);

  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewIdNumber, setReviewIdNumber] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const [favIdNumber, setFavIdNumber] = useState('');
  const [favModalVisible, setFavModalVisible] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);

  useEffect(() => {
    if (!serverUrl || !resourceId) return;
    Promise.all([
      fetch(`${serverUrl}/api/books/${resourceId}`).then(r => r.json()),
      fetch(`${serverUrl}/api/books/${resourceId}/similar`).then(r => r.json()),
      fetch(`${serverUrl}/api/books/${resourceId}/reviews`).then(r => r.json()),
    ]).then(([detail, sim, rev]) => {
      setBook(detail);
      setSimilar(sim ?? []);
      setReviews(rev?.reviews ?? []);
      setAvgRating(rev?.avg_rating ?? 0);
    }).catch(() => {
      Alert.alert('Error', 'Could not load book details.');
    }).finally(() => setLoading(false));
  }, [serverUrl, resourceId]);

  const checkFavorite = async (idn: string) => {
    if (!idn.trim()) return;
    try {
      const res = await fetch(`${serverUrl}/api/books/${resourceId}/favorite?idNumber=${encodeURIComponent(idn.trim())}`);
      const data = await res.json();
      setFavorited(data.favorited);
      setFavIdNumber(idn.trim());
    } catch {}
  };

  const handleToggleFavorite = async () => {
    if (!favIdNumber) { setFavModalVisible(true); return; }
    setTogglingFav(true);
    try {
      const res = await fetch(`${serverUrl}/api/books/${resourceId}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber: favIdNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFavorited(data.favorited);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setTogglingFav(false); }
  };

  const handleFavIdSubmit = async () => {
    if (!favIdNumber.trim()) return;
    setFavModalVisible(false);
    await checkFavorite(favIdNumber.trim());
    setTogglingFav(true);
    try {
      const res = await fetch(`${serverUrl}/api/books/${resourceId}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber: favIdNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFavorited(data.favorited);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setTogglingFav(false); }
  };

  const handleReserve = async () => {
    if (!reserveId.trim()) return;
    setReserving(true);
    try {
      const res = await fetch(`${serverUrl}/api/books/${resourceId}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber: reserveId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReserveModalVisible(false);
      setReserveId('');
      Alert.alert('Hold Placed', 'You have been added to the waitlist for this item.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setReserving(false); }
  };

  const handleSubmitReview = async () => {
    if (!reviewIdNumber.trim()) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(`${serverUrl}/api/books/${resourceId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber: reviewIdNumber.trim(), rating: reviewRating, comment: reviewComment.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReviewModalVisible(false);
      setReviewIdNumber(''); setReviewComment(''); setReviewRating(5);
      const rev = await fetch(`${serverUrl}/api/books/${resourceId}/reviews`).then(r => r.json());
      setReviews(rev?.reviews ?? []);
      setAvgRating(rev?.avg_rating ?? 0);
      Alert.alert('Review Submitted', 'Thank you for your feedback!');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSubmittingReview(false); }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-bio items-center justify-center">
        <ActivityIndicator color="#2A5C33" size="large" />
      </View>
    );
  }

  if (!book) {
    return (
      <View className="flex-1 bg-bio items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={48} color="#C8DFC5" />
        <Text className="text-sm text-[#94A3B8] mt-3 text-center">Book not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-brand font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const subjects: string[] = (() => { try { return JSON.parse(book.subject_headings ?? '[]'); } catch { return []; } })();

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 110 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      {/* Header */}
      <View className="bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1 mb-4">
          <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
          <Text className="text-[#A8D5A2] text-sm font-medium">Back</Text>
        </TouchableOpacity>
        <View className="flex-row items-start gap-3">
          <View className="w-16 h-20 bg-[#1C3E23] rounded-xl items-center justify-center flex-shrink-0">
            <Text className="text-3xl font-extrabold text-white">{book.title[0]}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-xl font-extrabold text-white leading-6">{book.title}</Text>
            <Text className="text-sm text-[#A8D5A2] mt-1">{book.author}</Text>
            {book.publisher && <Text className="text-xs text-[#7A9A7E] mt-0.5">{book.publisher}{book.year ? `, ${book.year}` : ''}</Text>}
            <View className="flex-row items-center gap-2 mt-2">
              <View className={`rounded-full px-2.5 py-1 ${book.available_copies > 0 ? 'bg-leaf' : 'bg-red-500'}`}>
                <Text className="text-xs font-bold text-white">
                  {book.available_copies > 0 ? `${book.available_copies} Available` : 'Unavailable'}
                </Text>
              </View>
              <View className="bg-[#1C3E23] rounded-full px-2.5 py-1">
                <Text className="text-xs font-semibold text-[#A8D5A2]">{book.material_type}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={handleToggleFavorite} disabled={togglingFav} className="mt-1">
            <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={24} color={favorited ? '#EF4444' : '#A8D5A2'} />
          </TouchableOpacity>
        </View>
      </View>

      <View className="px-4 pt-4 gap-4">
        {/* Action buttons */}
        <View className="flex-row gap-3">
          {book.available_copies === 0 && (
            <TouchableOpacity
              className="flex-1 bg-brand rounded-2xl py-3.5 items-center flex-row justify-center gap-2"
              style={{ elevation: 2 }}
              onPress={() => setReserveModalVisible(true)}
            >
              <Ionicons name="bookmark-outline" size={18} color="#fff" />
              <Text className="text-white font-bold">Place Hold</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className="flex-1 bg-white border border-mint rounded-2xl py-3.5 items-center flex-row justify-center gap-2"
            style={{ elevation: 1 }}
            onPress={() => setReviewModalVisible(true)}
          >
            <Ionicons name="star-outline" size={18} color="#2A5C33" />
            <Text className="text-brand font-bold">Write Review</Text>
          </TouchableOpacity>
        </View>

        {/* Meta chips */}
        <View className="flex-row flex-wrap gap-2">
          {book.genre && (
            <View className="bg-mint rounded-full px-3 py-1">
              <Text className="text-xs font-semibold text-brand">{book.genre}</Text>
            </View>
          )}
          {book.language && (
            <View className="bg-mint rounded-full px-3 py-1">
              <Text className="text-xs font-semibold text-brand">{book.language}</Text>
            </View>
          )}
          {book.call_number && (
            <View className="bg-mint rounded-full px-3 py-1">
              <Text className="text-xs font-semibold text-brand">{book.call_number}</Text>
            </View>
          )}
          {book.isbn && (
            <View className="bg-mint rounded-full px-3 py-1">
              <Text className="text-xs font-semibold text-brand">ISBN {book.isbn}</Text>
            </View>
          )}
        </View>

        {/* Subject headings */}
        {subjects.length > 0 && (
          <View className="bg-white rounded-2xl p-4 gap-2" style={{ elevation: 1 }}>
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">Subjects</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {subjects.map((s, i) => (
                <View key={i} className="bg-bio border border-mint rounded-md px-2 py-1">
                  <Text className="text-xs text-[#1C2B1E]">{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Description */}
        {book.description && (
          <View className="bg-white rounded-2xl p-4 gap-2" style={{ elevation: 1 }}>
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">About</Text>
            <Text className="text-sm text-[#3A4A3E] leading-5">{book.description}</Text>
          </View>
        )}

        {/* Ratings summary */}
        {reviews.length > 0 && (
          <View className="bg-white rounded-2xl p-4 flex-row items-center gap-4" style={{ elevation: 1 }}>
            <View className="items-center">
              <Text className="text-4xl font-extrabold text-brand">{avgRating.toFixed(1)}</Text>
              <Stars rating={avgRating} size={12} />
              <Text className="text-xs text-[#94A3B8] mt-1">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</Text>
            </View>
            <View className="flex-1 gap-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviews.filter(r => r.rating === star).length;
                const pct = reviews.length ? (count / reviews.length) * 100 : 0;
                return (
                  <View key={star} className="flex-row items-center gap-2">
                    <Text className="text-[10px] text-[#94A3B8] w-2">{star}</Text>
                    <View className="flex-1 h-1.5 bg-bio rounded-full overflow-hidden">
                      <View className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Reviews list */}
        {reviews.length > 0 && (
          <View className="gap-2">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider px-1">Reviews</Text>
            {reviews.slice(0, 5).map((r) => (
              <View key={r.id} className="bg-white rounded-2xl p-4 gap-1.5" style={{ elevation: 1 }}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-[#1C2B1E]">{r.member_name}</Text>
                  <Stars rating={r.rating} size={12} />
                </View>
                {r.comment && <Text className="text-sm text-[#5A7A5E] leading-5">{r.comment}</Text>}
                <Text className="text-xs text-[#94A3B8]">{new Date(r.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Similar books */}
        {similar.length > 0 && (
          <View className="gap-2">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider px-1">You May Also Like</Text>
            <FlatList
              horizontal
              data={similar}
              keyExtractor={(s) => String(s.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 4 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="bg-white rounded-2xl p-3 w-36"
                  style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                  onPress={() => router.push(`/(client)/book/${item.id}`)}
                >
                  <View className="w-full h-16 bg-mint rounded-xl items-center justify-center mb-2">
                    <Text className="text-2xl font-extrabold text-brand">{item.title[0]}</Text>
                  </View>
                  <Text className="text-xs font-bold text-[#1C2B1E] leading-4" numberOfLines={2}>{item.title}</Text>
                  <Text className="text-[10px] text-[#7A9A7E] mt-0.5" numberOfLines={1}>{item.author}</Text>
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

      {/* Reserve Modal */}
      <Modal visible={reserveModalVisible} transparent animationType="fade" onRequestClose={() => setReserveModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-3xl p-6 gap-4">
            <Text className="text-lg font-extrabold text-[#1C2B1E]">Place a Hold</Text>
            <Text className="text-sm text-[#5A7A5E]">Enter your library ID number to join the waitlist for "{book.title}".</Text>
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={reserveId}
              onChangeText={setReserveId}
              placeholder="Your ID number"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 bg-bio border border-mint rounded-xl py-3 items-center" onPress={() => { setReserveModalVisible(false); setReserveId(''); }}>
                <Text className="font-bold text-[#5A7A5E]">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-brand rounded-xl py-3 items-center"
                onPress={handleReserve}
                disabled={!reserveId.trim() || reserving}
                style={{ opacity: reserveId.trim() ? 1 : 0.4 }}
              >
                {reserving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-bold">Place Hold</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Favorite ID Modal */}
      <Modal visible={favModalVisible} transparent animationType="fade" onRequestClose={() => setFavModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-3xl p-6 gap-4">
            <Text className="text-lg font-extrabold text-[#1C2B1E]">Save to Favorites</Text>
            <Text className="text-sm text-[#5A7A5E]">Enter your library ID to save this to your personal reading list.</Text>
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={favIdNumber}
              onChangeText={setFavIdNumber}
              placeholder="Your ID number"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 bg-bio border border-mint rounded-xl py-3 items-center" onPress={() => setFavModalVisible(false)}>
                <Text className="font-bold text-[#5A7A5E]">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-brand rounded-xl py-3 items-center"
                onPress={handleFavIdSubmit}
                disabled={!favIdNumber.trim()}
                style={{ opacity: favIdNumber.trim() ? 1 : 0.4 }}
              >
                <Text className="text-white font-bold">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal visible={reviewModalVisible} transparent animationType="slide" onRequestClose={() => setReviewModalVisible(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 gap-4">
            <Text className="text-lg font-extrabold text-[#1C2B1E]">Write a Review</Text>
            <Text className="text-xs text-[#94A3B8]">You must have borrowed this item to leave a review.</Text>
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={reviewIdNumber}
              onChangeText={setReviewIdNumber}
              placeholder="Your library ID number"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
            />
            <View className="gap-1">
              <Text className="text-xs font-bold text-brand uppercase tracking-wider">Rating</Text>
              <View className="flex-row gap-3 py-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity key={s} onPress={() => setReviewRating(s)}>
                    <Ionicons name={s <= reviewRating ? 'star' : 'star-outline'} size={32} color="#F59E0B" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Share your thoughts (optional)"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 bg-bio border border-mint rounded-xl py-3 items-center" onPress={() => { setReviewModalVisible(false); setReviewIdNumber(''); setReviewComment(''); setReviewRating(5); }}>
                <Text className="font-bold text-[#5A7A5E]">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-brand rounded-xl py-3 items-center"
                onPress={handleSubmitReview}
                disabled={!reviewIdNumber.trim() || submittingReview}
                style={{ opacity: reviewIdNumber.trim() ? 1 : 0.4 }}
              >
                {submittingReview ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-bold">Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
