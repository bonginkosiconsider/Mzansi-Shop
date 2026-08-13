import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';

const CATEGORIES = [
  'Food',
  'Retail',
  'Entertainment',
  'Travel',
  'Experiences',
  'Gaming',
  'Wellness'
];

const TRUST_BADGES = ['Verified Sellers', 'Instant Delivery', 'No Fees — 100% Value', 'Buyer Protection'];

const TRENDING = [
  { name: 'Takealot', tag: 'Retail' },
  { name: 'Woolworths', tag: 'Food' },
  { name: 'Steam', tag: 'Gaming' },
  { name: 'Netflix', tag: 'Entertainment' },
  { name: 'FlySafair', tag: 'Travel' },
  { name: 'Uber', tag: 'Experiences' }
];

const BRAND_INDEX = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function GiftCards() {
  const [query, setQuery] = useState('');

  const filteredTrending = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return TRENDING;
    return TRENDING.filter((item) => item.name.toLowerCase().includes(needle));
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <section className="bg-gradient-to-br from-amber-500 via-yellow-400 to-orange-400 text-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-800/80">
            Gift Cards Marketplace
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-2">Gift Cards from 500+ Top Brands</h1>
          <p className="mt-2 max-w-2xl text-gray-800/90">
            Discover verified gift cards across South Africa — instantly delivered with buyer protection.
          </p>

          <form
            onSubmit={(event) => event.preventDefault()}
            className="mt-6 flex flex-col sm:flex-row gap-3 max-w-3xl"
          >
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search 500+ brands"
              className="flex-1 px-4 py-3 rounded-md text-gray-900"
              aria-label="Search gift card brands"
            />
            <button
              type="button"
              className="px-6 py-3 rounded-md bg-gray-900 text-white font-semibold hover:bg-gray-800"
            >
              Search
            </button>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className="px-3 py-1 rounded-full bg-white/60 text-sm text-gray-900 hover:bg-white"
              >
                {category}
              </button>
            ))}
            <button
              type="button"
              className="px-3 py-1 rounded-full bg-gray-900 text-sm text-white hover:bg-gray-800"
            >
              View All
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-gray-900/90">
            {TRUST_BADGES.map((badge) => (
              <span key={badge} className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-gray-900" />
                {badge}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              to="#browse"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-gray-900 text-white font-semibold hover:bg-gray-800"
            >
              Buy a Gift Card
            </Link>
            <Link
              to="#check-balance"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-gray-900 text-gray-900 font-semibold hover:bg-gray-900 hover:text-white"
            >
              Check Balance
            </Link>
          </div>
        </div>
      </section>

      <section id="browse" className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Trending now</h2>
            <p className="text-sm text-gray-500">
              {query ? `Showing results for "${query}"` : 'Top picked brands this week.'}
            </p>
          </div>
          <Link to="/stores" className="text-sm text-blue-600 hover:text-blue-700">
            All brands
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTrending.map((item) => (
            <div key={item.name} className="bg-white rounded-lg shadow p-5 flex flex-col">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-400">{item.tag}</div>
              <h3 className="text-lg font-semibold text-gray-900 mt-2">{item.name}</h3>
              <p className="text-sm text-gray-600 mt-2 flex-1">
                Instant digital delivery. Use online or in-store where accepted.
              </p>
              <button
                type="button"
                className="mt-4 px-4 py-2 rounded-md bg-yellow-400 text-gray-900 font-semibold hover:bg-yellow-500"
              >
                Buy card
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-t border-b">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900">Compare options</h3>
              <p className="text-sm text-gray-600 mt-2">
                See fees, expiry, and where each card can be used before you buy.
              </p>
              <button className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700" type="button">
                Compare cards
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900">Corporate & bulk</h3>
              <p className="text-sm text-gray-600 mt-2">
                Reward teams or clients with flexible, multi-brand gift cards.
              </p>
              <button className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700" type="button">
                Get a quote
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900">Sell gift cards</h3>
              <p className="text-sm text-gray-600 mt-2">
                List your brand and reach new customers on MzansiShop.
              </p>
              <Link to="/register" className="mt-4 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700">
                Become a partner
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="check-balance" className="max-w-7xl mx-auto px-4 py-10">
        <div className="bg-gray-900 text-white rounded-xl p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold">Check your balance</h3>
              <p className="text-gray-300 mt-2">
                Enter your card details or reach support for quick help.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/help"
                className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-yellow-400 text-gray-900 font-semibold hover:bg-yellow-500"
              >
                Visit Help Center
              </Link>
              <a
                href="mailto:support@mzansishop.com"
                className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-white text-white font-semibold hover:bg-white hover:text-gray-900"
              >
                Contact support
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 border-t">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Browse A–Z brands</h3>
          <div className="flex flex-wrap gap-2">
            {BRAND_INDEX.map((letter) => (
              <button
                key={letter}
                type="button"
                className="h-9 w-9 rounded-md bg-white shadow text-gray-700 font-semibold hover:bg-gray-900 hover:text-white"
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      </section>

      <ShopFooter />
    </div>
  );
}
