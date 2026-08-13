import VendorTermsText from '../components/vendor/VendorTermsText';

export default function VendorTerms() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">Vendor Terms & Conditions</h1>
          <p className="text-sm text-gray-600">Mzansi Shop marketplace seller agreement</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <VendorTermsText />
        </div>
      </main>
    </div>
  );
}
