import { useParams } from 'react-router-dom';

export default function MarketplacePlaceholder({ title }) {
  const params = useParams();
  const subtitle = params?.id ? `Category: ${params.id}` : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
          <p className="text-gray-600">
            This page is coming soon. Marketplace browsing will be expanded in the next release.
          </p>
        </div>
      </div>
    </div>
  );
}
