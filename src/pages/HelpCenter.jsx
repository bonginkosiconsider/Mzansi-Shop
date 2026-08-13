import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';

const SUPPORT_PHONE_DISPLAY = '065 532 9691';
const SUPPORT_PHONE_LINK = '0655329691';

export default function HelpCenter() {
  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <section className="bg-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-400">
            Help Center
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-2">How can we help?</h1>
          <p className="text-gray-300 mt-2 max-w-3xl">
            Welcome to the Mzansi Shop Help Center. Here you can find answers to common questions
            about orders, payments, shipping, and returns.
          </p>
          <p className="text-gray-300 mt-4 max-w-3xl">
            We are committed to helping our customers have a smooth shopping experience on Mzansi
            Shop. If you need assistance, our support team is ready to help.
          </p>
          <div className="mt-6 text-sm text-gray-200">
            <span className="block">
              Customer Support:{' '}
              <a href={`tel:${SUPPORT_PHONE_LINK}`} className="text-yellow-400 font-semibold">
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </span>
            <span className="block mt-2">
              Support Hours: Monday - Friday, 9:00 AM - 5:00 PM
            </span>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900">1. Track Your Order</h2>
          <p className="text-gray-600 mt-2">
            You can track your order using the tracking number sent to your email after purchase.
            If you cannot find your tracking details, please contact support.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900">2. Returns &amp; Refunds</h2>
          <p className="text-gray-600 mt-2">
            If you receive a damaged or incorrect item, you can request a return or refund.
          </p>
          <ol className="list-decimal list-inside text-gray-600 mt-3 space-y-1">
            <li>Submit a return request.</li>
            <li>Our team reviews the request.</li>
            <li>The seller processes the refund or replacement.</li>
          </ol>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900">3. Shipping &amp; Delivery</h2>
          <p className="text-gray-600 mt-2">
            Delivery times may vary depending on your location and the seller.
          </p>
          <p className="text-gray-600 mt-2">
            Typical delivery time: 2-5 business days within South Africa.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900">4. Payment Methods</h2>
          <p className="text-gray-600 mt-2">
            Orders that use direct EFT stay pending until payment is verified manually. After
            verification, the order is marked as paid and the confirmation email is sent.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900">5. Contact Support</h2>
          <p className="text-gray-600 mt-2">
            If you cannot find the answer you are looking for, contact us directly.
          </p>
          <div className="text-gray-700 mt-3">
            <p>Phone / WhatsApp: {SUPPORT_PHONE_DISPLAY}</p>
            <p className="mt-1">Support Hours: Monday - Friday, 9:00 AM - 5:00 PM</p>
          </div>
        </div>
      </section>

      <ShopFooter />
    </div>
  );
}
