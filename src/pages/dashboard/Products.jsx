import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import { 
  Plus, Search, Filter, MoreVertical, Edit2, Trash2, 
  Copy, Eye, Star, Package, AlertCircle, Loader
} from 'lucide-react';
import toast from 'react-hot-toast';

const PRODUCT_TYPES = [
  { id: 'simple', name: 'Simple Product', desc: 'A standalone product' },
  { id: 'variable', name: 'Variable Product', desc: 'Product with variations like size, color' },
  { id: 'grouped', name: 'Grouped Product', desc: 'A collection of related products' },
  { id: 'external', name: 'External/Affiliate', desc: 'Link to external product' },
  { id: 'downloadable', name: 'Downloadable', desc: 'Digital products, software, ebooks' },
  { id: 'virtual', name: 'Virtual', desc: 'Services, bookings, appointments' }
];

const STOCK_STATUSES = [
  { value: 'instock', label: 'In stock', color: 'green' },
  { value: 'outofstock', label: 'Out of stock', color: 'red' },
  { value: 'onbackorder', label: 'On backorder', color: 'yellow' }
];

export default function VendorProducts() {
  const { tenant } = useAuth();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    stock: 'all',
    category: 'all',
    status: 'all'
  });
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // grid or list

  useEffect(() => {
    if (!tenant) return;

    const q = query(collection(db, 'tenants', tenant.id, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(productsData);
      setFilteredProducts(productsData);
      setLoading(false);
    });

    return unsubscribe;
  }, [tenant]);

  useEffect(() => {
    let result = products;

    if (filters.search) {
      result = result.filter(p => 
        p.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    if (filters.type !== 'all') {
      result = result.filter(p => p.type === filters.type);
    }

    if (filters.stock !== 'all') {
      result = result.filter(p => p.stockStatus === filters.stock);
    }

    if (filters.status !== 'all') {
      result = result.filter(p => p.status === filters.status);
    }

    setFilteredProducts(result);
  }, [filters, products]);

  const handleBulkAction = async (action) => {
    if (selectedProducts.length === 0) {
      toast.error('Select products first');
      return;
    }

    try {
      switch(action) {
        case 'delete':
          for (const id of selectedProducts) {
            await deleteDoc(doc(db, 'tenants', tenant.id, 'products', id));
          }
          toast.success(`${selectedProducts.length} products deleted`);
          break;
        case 'publish':
          for (const id of selectedProducts) {
            await updateDoc(doc(db, 'tenants', tenant.id, 'products', id), {
              status: 'published'
            });
          }
          toast.success(`${selectedProducts.length} products published`);
          break;
        case 'draft':
          for (const id of selectedProducts) {
            await updateDoc(doc(db, 'tenants', tenant.id, 'products', id), {
              status: 'draft'
            });
          }
          toast.success(`${selectedProducts.length} products drafted`);
          break;
      }
      setSelectedProducts([]);
    } catch (error) {
      toast.error('Action failed');
    }
  };

  const duplicateProduct = async (product) => {
    try {
      const newProduct = {
        ...product,
        name: `${product.name} (Copy)`,
        sku: `${product.sku}-copy`,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      delete newProduct.id;
      
      await addDoc(collection(db, 'tenants', tenant.id, 'products'), newProduct);
      toast.success('Product duplicated');
    } catch (error) {
      toast.error('Duplication failed');
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader className="animate-spin" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Products</h2>
          <p className="text-gray-500">Manage your store inventory</p>
        </div>
        <Link
          to="/sell/dashboard/products/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add New Product
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
          <p className="text-sm text-gray-500">Total Products</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-green-600">
            {products.filter(p => p.stockStatus === 'instock').length}
          </p>
          <p className="text-sm text-gray-500">In Stock</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-red-600">
            {products.filter(p => p.stockStatus === 'outofstock').length}
          </p>
          <p className="text-sm text-gray-500">Out of Stock</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-yellow-600">
            {products.filter(p => p.stockQuantity < 5 && p.manageStock).length}
          </p>
          <p className="text-sm text-gray-500">Low Stock</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters({...filters, type: e.target.value})}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Types</option>
            {PRODUCT_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            value={filters.stock}
            onChange={(e) => setFilters({...filters, stock: e.target.value})}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Stock</option>
            {STOCK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
            >
              List
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedProducts.length > 0 && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-sm text-gray-600">{selectedProducts.length} selected</span>
            <button onClick={() => handleBulkAction('publish')} className="text-sm text-green-600 hover:underline">
              Publish
            </button>
            <button onClick={() => handleBulkAction('draft')} className="text-sm text-yellow-600 hover:underline">
              Move to Draft
            </button>
            <button onClick={() => handleBulkAction('delete')} className="text-sm text-red-600 hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Products Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(product => (
            <ProductCard 
              key={product.id} 
              product={product} 
              selected={selectedProducts.includes(product.id)}
              onSelect={() => {
                if (selectedProducts.includes(product.id)) {
                  setSelectedProducts(selectedProducts.filter(id => id !== product.id));
                } else {
                  setSelectedProducts([...selectedProducts, product.id]);
                }
              }}
              onDuplicate={() => duplicateProduct(product)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-4 p-4">
                  <input 
                    type="checkbox" 
                    checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProducts(filteredProducts.map(p => p.id));
                      } else {
                        setSelectedProducts([]);
                      }
                    }}
                  />
                </th>
                <th className="text-left p-4">Product</th>
                <th className="text-left p-4">SKU</th>
                <th className="text-left p-4">Price</th>
                <th className="text-left p-4">Stock</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.map(product => (
                <ProductRow 
                  key={product.id} 
                  product={product}
                  selected={selectedProducts.includes(product.id)}
                  onSelect={() => {
                    if (selectedProducts.includes(product.id)) {
                      setSelectedProducts(selectedProducts.filter(id => id !== product.id));
                    } else {
                      setSelectedProducts([...selectedProducts, product.id]);
                    }
                  }}
                  onDuplicate={() => duplicateProduct(product)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, selected, onSelect, onDuplicate }) {
  const stockStatus = STOCK_STATUSES.find(s => s.value === product.stockStatus);
  
  return (
    <div className={`bg-white rounded-lg shadow-sm border overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="relative">
        <img 
          src={product.mainImage || '/placeholder.svg'} 
          alt={product.name}
          className="w-full h-48 object-cover"
        />
        <div className="absolute top-2 left-2">
          <input 
            type="checkbox" 
            checked={selected}
            onChange={onSelect}
            className="w-5 h-5 rounded"
          />
        </div>
        {product.type === 'variable' && (
          <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">
            Variable
          </span>
        )}
        {product.onSale && (
          <span className="absolute bottom-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
            Sale
          </span>
        )}
      </div>
      
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
        <p className="text-sm text-gray-500 mb-2">{product.sku}</p>
        
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-lg font-bold">R{product.price || product.regularPrice}</span>
          {product.regularPrice > product.price && (
            <span className="text-sm text-gray-400 line-through">R{product.regularPrice}</span>
          )}
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className={`text-xs px-2 py-1 rounded-full bg-${stockStatus?.color}-100 text-${stockStatus?.color}-800`}>
            {stockStatus?.label}
          </span>
          <span className="text-xs text-gray-500">
            {product.stockQuantity} in stock
          </span>
        </div>

        <div className="flex gap-2">
          <Link 
            to={`/sell/dashboard/products/${product.id}`}
            className="flex-1 bg-blue-50 text-blue-600 py-2 rounded text-center text-sm font-medium hover:bg-blue-100"
          >
            Edit
          </Link>
          <button 
            onClick={onDuplicate}
            className="p-2 text-gray-400 hover:text-gray-600"
            title="Duplicate"
          >
            <Copy size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ product, selected, onSelect, onDuplicate }) {
  const stockStatus = STOCK_STATUSES.find(s => s.value === product.stockStatus);
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
        await deleteDoc(doc(db, 'tenants', tenant.id, 'products', product.id));
        toast.success('Product deleted');
    } catch (error) {
        toast.error('Error deleting product');
    }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="p-4">
        <input 
          type="checkbox" 
          checked={selected}
          onChange={onSelect}
        />
      </td>
      <td className="p-4">
        <div className="flex items-center gap-3">
          <img src={product.mainImage || '/placeholder.svg'} alt="" className="w-12 h-12 rounded object-cover" />
          <div>
            <p className="font-medium text-gray-900">{product.name}</p>
            <p className="text-xs text-gray-500 capitalize">{product.type}</p>
          </div>
        </div>
      </td>
      <td className="p-4 text-sm text-gray-600">{product.sku}</td>
      <td className="p-4">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">R{product.price || product.regularPrice}</span>
          {product.regularPrice > product.price && (
            <span className="text-sm text-gray-400 line-through">R{product.regularPrice}</span>
          )}
        </div>
      </td>
      <td className="p-4">
        <span className={`text-xs px-2 py-1 rounded-full bg-${stockStatus?.color}-100 text-${stockStatus?.color}-800`}>
          {product.stockQuantity}
        </span>
      </td>
      <td className="p-4">
        <span className={`text-xs px-2 py-1 rounded-full ${
          product.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {product.status}
        </span>
      </td>
      <td className="p-4">
        <div className="flex gap-2">
          <Link to={`/sell/dashboard/products/${product.id}`} className="text-blue-600 hover:text-blue-800">
            <Edit2 size={18} />
          </Link>
          <button onClick={onDuplicate} className="text-gray-600 hover:text-gray-800">
            <Copy size={18} />
          </button>
          <button onClick={handleDelete} className="text-red-600 hover:text-red-800">
            <Trash2 size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}
