import { collection, addDoc, getDocs, query, where, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const SEARCH_HISTORY_COLLECTION = 'searchHistory';
const MAX_HISTORY_ITEMS = 50;
const MAX_RECOMMENDATIONS = 10;

// Track a search query
export const trackSearch = async (userId, query, resultsCount = 0) => {
  if (!query || query.trim().length < 2) return;

  try {
    // Clean up old entries if user has too many
    await cleanupOldSearches(userId);

    await addDoc(collection(db, SEARCH_HISTORY_COLLECTION), {
      userId,
      query: query.trim().toLowerCase(),
      resultsCount,
      timestamp: new Date(),
      sessionId: getSessionId()
    });
  } catch (error) {
    console.error('Error tracking search:', error);
  }
};

// Get search history for a user
export const getSearchHistory = async (userId) => {
  try {
    const q = query(
      collection(db, SEARCH_HISTORY_COLLECTION),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(MAX_HISTORY_ITEMS)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting search history:', error);
    return [];
  }
};

// Get popular searches (trending)
export const getPopularSearches = async (days = 7) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const q = query(
      collection(db, SEARCH_HISTORY_COLLECTION),
      where('timestamp', '>=', since),
      orderBy('timestamp', 'desc'),
      limit(1000) // Get more to aggregate
    );

    const snapshot = await getDocs(q);
    const searches = snapshot.docs.map(doc => doc.data());

    // Aggregate by query and count
    const aggregated = searches.reduce((acc, search) => {
      const key = search.query;
      if (!acc[key]) {
        acc[key] = { query: key, count: 0, lastSearched: search.timestamp };
      }
      acc[key].count++;
      if (search.timestamp > acc[key].lastSearched) {
        acc[key].lastSearched = search.timestamp;
      }
      return acc;
    }, {});

    // Sort by count and recency
    return Object.values(aggregated)
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        return b.lastSearched.seconds - a.lastSearched.seconds;
      })
      .slice(0, MAX_RECOMMENDATIONS);
  } catch (error) {
    console.error('Error getting popular searches:', error);
    return [];
  }
};

// Get personalized recommendations based on user's search history
export const getPersonalizedRecommendations = async (userId) => {
  try {
    const history = await getSearchHistory(userId);
    if (history.length === 0) {
      return await getPopularSearches();
    }

    // Extract keywords from user's recent searches
    const recentQueries = history.slice(0, 10).map(h => h.query);
    const keywords = extractKeywords(recentQueries);

    // Find similar searches by other users
    const recommendations = new Set();

    for (const keyword of keywords.slice(0, 3)) {
      const similarSearches = await findSimilarSearches(keyword, userId);
      similarSearches.forEach(search => recommendations.add(search));
    }

    // Fill with popular searches if needed
    if (recommendations.size < MAX_RECOMMENDATIONS) {
      const popular = await getPopularSearches();
      popular.forEach(search => {
        if (recommendations.size < MAX_RECOMMENDATIONS) {
          recommendations.add(search.query);
        }
      });
    }

    return Array.from(recommendations).slice(0, MAX_RECOMMENDATIONS);
  } catch (error) {
    console.error('Error getting personalized recommendations:', error);
    return [];
  }
};

// Clear search history for a user
export const clearSearchHistory = async (userId) => {
  try {
    const q = query(
      collection(db, SEARCH_HISTORY_COLLECTION),
      where('userId', '==', userId)
    );

    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));

    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error('Error clearing search history:', error);
    return false;
  }
};

// Helper functions
const getSessionId = () => {
  let sessionId = localStorage.getItem('searchSessionId');
  if (!sessionId) {
    sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('searchSessionId', sessionId);
  }
  return sessionId;
};

const cleanupOldSearches = async (userId) => {
  try {
    const q = query(
      collection(db, SEARCH_HISTORY_COLLECTION),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(q);
    if (snapshot.docs.length > MAX_HISTORY_ITEMS) {
      const toDelete = snapshot.docs.slice(MAX_HISTORY_ITEMS);
      const deletePromises = toDelete.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    }
  } catch (error) {
    console.error('Error cleaning up old searches:', error);
  }
};

const extractKeywords = (queries) => {
  const words = queries
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2);

  const wordCount = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .map(([word]) => word);
};

const findSimilarSearches = async (keyword, excludeUserId) => {
  try {
    const q = query(
      collection(db, SEARCH_HISTORY_COLLECTION),
      where('query', '>=', keyword),
      where('query', '<=', keyword + '\uf8ff'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    const searches = snapshot.docs
      .map(doc => doc.data())
      .filter(search => search.userId !== excludeUserId && search.query !== keyword)
      .map(search => search.query);

    return [...new Set(searches)]; // Remove duplicates
  } catch (error) {
    console.error('Error finding similar searches:', error);
    return [];
  }
};