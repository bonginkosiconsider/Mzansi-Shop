import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { loadPublishedProducts } from '../utils/products';
import { useAuth } from '../context/AuthContext';
import { trackSearch, getPersonalizedRecommendations } from '../utils/searchHistory';
import { normalizeText, scoreItem } from '../utils/search';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import ProductCard from '../components/shop/ProductCard';
import { Search, TrendingUp, History } from 'lucide-react';

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function SearchResults() {
  const params = useQuery();
  const queryText = params.get('q') || '';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const items = await loadPublishedProducts();
        const needle = normalizeText(queryText);
        const filteredProducts = items
          .map((item) => ({ item, score: scoreItem(item, needle) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.item);

        setProducts(filteredProducts);

        // Track the search if user is logged in and there's a query
        if (queryText && user) {
          await trackSearch(user.uid, queryText, filteredProducts.length);
        }
      } catch (error) {
        console.error('Search failed', error);
      } finally {
        setLoading(false);
      }
    };

    if (queryText) {
      run();
    } else {
      setProducts([]);
      setLoading(false);
    }
  }, [queryText, user]);

  useEffect(() => {
    // Load recommendations when component mounts or when user changes
    const loadRecommendations = async () => {
      if (!user) return;

      setLoadingRecommendations(true);
      try {
        const recs = await getPersonalizedRecommendations(user.uid);
        setRecommendations(recs);
      } catch (error) {
        console.error('Error loading recommendations:', error);
      } finally {
        setLoadingRecommendations(false);
      }
    };

    loadRecommendations();
  }, [user]);

  const handleRecommendationClick = (recommendation) => {
    // Navigate to search with the recommendation
    window.location.href = `/search?q=${encodeURIComponent(recommendation)}`;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} searching={loading} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Search Results</h1>
        <p className="text-sm text-gray-500 mb-6">
          Showing results for: <span className="font-semibold">{queryText || 'All products'}</span>
          {products.length > 0 && (
            <span className="ml-2 text-gray-400">({products.length} results)</span>
          )}
        </p>

        {/* Recommendations Section */}
        {user && !queryText && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold">Recommended for you</h2>
            </div>

            {loadingRecommendations ? (
              <div className="flex gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-gray-200 h-8 w-24 rounded"></div>
                  </div>
                ))}
              </div>
            ) : recommendations.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {recommendations.map((rec, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecommendationClick(rec)}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition-colors text-sm"
                  >
                    <Search size={14} />
                    {rec}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Search for products to get personalized recommendations</p>
            )}
          </div>
        )}

        {/* Search Results */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Searching...</p>
          </div>
        )}

        {!loading && queryText && products.length === 0 && (
          <div className="text-center py-12">
            <Search size={48} className="text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No results found</p>
            <p className="text-gray-400 text-sm">Try different keywords or check your spelling</p>
          </div>
        )}

        {!loading && products.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} showAddToCart={false} />
              ))}
            </div>
          </>
        )}

        {/* Popular Searches for non-logged-in users */}
        {!user && !queryText && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <History size={20} className="text-green-600" />
              <h2 className="text-lg font-semibold">Popular searches</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                'electronics', 'clothing', 'books', 'home & garden',
                'sports', 'beauty', 'toys', 'automotive'
              ].map((term, index) => (
                <button
                  key={index}
                  onClick={() => handleRecommendationClick(term)}
                  className="flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-full hover:bg-green-100 transition-colors text-sm"
                >
                  <Search size={14} />
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <ShopFooter />
    </div>
  );
}
