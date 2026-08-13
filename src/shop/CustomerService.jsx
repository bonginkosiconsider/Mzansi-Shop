import { Link } from 'react-router-dom';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';

const SUPPORT_EMAIL = 'support@mzansishop.com';

const CUSTOMER_SERVICE_LINKS = [
  {
    title: 'Help Center',
    description: 'Need help? Visit our Help Center for quick answers to common questions.',
    to: '/help'
  },
  {
    title: 'Track Your Order',
    description: 'Check delivery status, tracking updates, and delivery estimates.',
    to: '/orders'
  },
  {
    title: 'Returns & Refunds',
    description: 'Learn about return windows, conditions, and refund processing times.',
    to: '/help'
  },
  {
    title: 'Shipping & Delivery',
    description: 'Delivery areas, timelines, costs, and express options.',
    to: '/help'
  },
  {
    title: 'Payment Options',
    description: 'Direct EFT payment instructions, verification timing, and order confirmation details.',
    to: '/help'
  },
  {
    title: 'Contact Us',
    description: 'Email, phone, and WhatsApp support for urgent help.',
    href: `mailto:${SUPPORT_EMAIL}`
  },
  {
    title: 'Frequently Asked Questions',
    description: 'Answers to delivery times, refunds, and order changes.',
    to: '/help'
  },
  {
    title: 'Cancel an Order',
    description: 'Cancel before shipping for a fast refund.',
    to: '/help'
  },
  {
    title: 'Report a Problem',
    description: 'Damaged item, wrong delivery, or missing items? Let us know.',
    to: '/help'
  }
];

const TRUST_ITEMS = [
  {
    title: 'Secure Payments',
    description: 'EFT payments are verified manually before order confirmation is sent.'
  },
  {
    title: 'Buyer Protection',
    description: 'Get a refund if your order does not arrive or is not as described.'
  },
  {
    title: 'Delivery Guarantee',
    description: 'Fast and reliable delivery across South Africa.'
  }
];

export default function CustomerService() {
  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-400">
            Customer Service
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-2">How can we help?</h1>
          <p className="text-gray-300 mt-2 max-w-2xl">
            Find quick answers, track orders, and get support from the MzansiShop team.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Customer Service</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CUSTOMER_SERVICE_LINKS.map((item) => (
            <div key={item.title} className="bg-white rounded-lg shadow p-5 flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-600 mt-2 flex-1">{item.description}</p>
              <div className="mt-4">
                {item.to ? (
                  <Link to={item.to} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    Learn more
                  </Link>
                ) : (
                  <a href={item.href} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    Contact support
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Trusted Shopping</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TRUST_ITEMS.map((item) => (
              <div key={item.title} className="bg-gray-50 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-600 mt-2">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-10">
        <div className="bg-gray-900 text-white rounded-xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold">Contact Customer Support</h3>
              <p className="text-gray-300 mt-2">
                Still need help? Email our support team for a quick response.
              </p>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-yellow-400 text-gray-900 font-semibold hover:bg-yellow-500"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </section>

      <ShopFooter />
    </div>
  );
}
