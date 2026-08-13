import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';

export default function About() {
  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <section className="bg-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-400">
            About Us
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-2">Mzansi Shop</h1>
          <p className="text-gray-300 mt-2 max-w-3xl">
            Built in South Africa, for South Africans.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-10">
        <div className="bg-white rounded-lg shadow p-6 sm:p-8 text-gray-700 leading-relaxed space-y-4">
          <p>
            Mzansi Shop was built with a simple but powerful vision: to create a platform that
            supports local businesses and makes online shopping more accessible for everyone in
            South Africa.
          </p>
          <p>
            This platform was created by a student from the University of Johannesburg (UJ) - a
            young entrepreneur who believes that innovation can come from anywhere, even from a
            student&apos;s laptop. What started as an idea to solve everyday problems has grown into a
            marketplace designed to empower local sellers and connect them with customers across
            the country.
          </p>
          <p>
            Mzansi Shop is more than just an online store. It is a multi-vendor marketplace, which
            means different businesses and entrepreneurs can open their own shops on the platform
            and sell their products to customers nationwide. Our goal is to help local businesses
            grow, especially small and emerging businesses that deserve more visibility in the
            digital economy.
          </p>
          <p>
            Every time you shop on this platform, you are helping support South African
            entrepreneurs, creators, and independent stores. Instead of relying only on products
            from outside the country, we believe in strengthening our own economy by giving local
            businesses a place to thrive online.
          </p>
          <p>
            This project represents the spirit of entrepreneurship, innovation, and community.
            It&apos;s proof that with determination, learning, and the right tools, anyone can build
            something meaningful.
          </p>
          <p className="font-medium text-gray-900">
            Welcome to Mzansi Shop - a platform built in South Africa, for South Africans.
          </p>
        </div>
      </section>

      <ShopFooter />
    </div>
  );
}
