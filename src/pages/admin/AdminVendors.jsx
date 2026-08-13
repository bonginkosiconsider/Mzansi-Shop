import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  deleteDoc,
  deleteField,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, Ban, CheckCircle, ExternalLink, Settings, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminVendors() {
  const [vendors, setVendors] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [deletingVendorId, setDeletingVendorId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'tenants'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVendors(data);
      setFiltered(data);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let result = vendors;
    if (search) {
      result = result.filter(
        (v) =>
          v.name?.toLowerCase().includes(search.toLowerCase()) ||
          v.email?.toLowerCase().includes(search.toLowerCase()) ||
          v.subdomain?.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (filter !== 'all') {
      result = result.filter((v) => (filter === 'active' ? v.isActive : !v.isActive));
    }
    setFiltered(result);
  }, [search, filter, vendors]);

  const toggleStatus = async (vendor) => {
    try {
      const newStatus = !vendor.isActive;

      // Update vendor status
      await updateDoc(doc(db, 'tenants', vendor.id), {
        isActive: newStatus,
        suspendedAt: newStatus ? null : new Date(),
        suspensionReason: newStatus ? null : 'Manual by admin'
      });

      const productsQuery = query(
        collection(db, 'tenants', vendor.id, 'products')
      );
      const productsSnapshot = await getDocs(productsQuery);

      if (!newStatus) {
        // If deactivating, hide all their products and remember previous publish state
        const productUpdates = productsSnapshot.docs.map((productDoc) => {
          const productData = productDoc.data() || {};
          return updateDoc(productDoc.ref, {
            isPublished: false,
            isPublishedBeforeSuspend: productData.isPublished === true,
            suspendedAt: new Date(),
            suspensionReason: 'Vendor suspended by admin'
          });
        });

        await Promise.all(productUpdates);
      } else {
        // If reactivating, restore publish state to what it was before suspension
        const productUpdates = productsSnapshot.docs.map((productDoc) => {
          const productData = productDoc.data() || {};
          const status = String(productData.status || '').toLowerCase();
          const restorePublished = productData.isPublishedBeforeSuspend === true
            ? true
            : productData.isPublishedBeforeSuspend === false
              ? false
              : status === 'published'
                ? true
                : productData.isPublished === true;

          return updateDoc(productDoc.ref, {
            isPublished: restorePublished,
            isPublishedBeforeSuspend: deleteField(),
            suspendedAt: deleteField(),
            suspensionReason: deleteField()
          });
        });

        await Promise.all(productUpdates);
      }

      toast.success(`Vendor ${newStatus ? 'activated' : 'suspended'}`);
    } catch (error) {
      console.error('Error updating vendor status:', error);
      toast.error('Action failed');
    }
  };

  const accessVendorDashboard = (vendor) => {
    // Store admin context and switch to vendor mode
    localStorage.setItem('adminAccessingVendor', JSON.stringify({
      adminId: 'admin', // You might want to get actual admin ID
      vendorId: vendor.id,
      vendorName: vendor.name,
      timestamp: new Date().toISOString()
    }));

    // Redirect to vendor dashboard
    window.location.href = `/sell/dashboard?adminAccess=true&vendorId=${vendor.id}`;
  };

  const openVendorDetails = async (vendor) => {
    setSelectedVendor(vendor);
    setSelectedApplication(null);
    try {
      const appSnap = await getDoc(doc(db, 'applications', vendor.id));
      if (appSnap.exists()) {
        setSelectedApplication(appSnap.data());
      }
    } catch (error) {
      console.error('Failed to load application details', error);
    }
  };

  const deleteCollection = async (colRef) => {
    const snap = await getDocs(colRef);
    if (snap.empty) return 0;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      docs.slice(i, i + 450).forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
    }
    return docs.length;
  };

  const deleteVendor = async (vendor) => {
    const confirmed = window.confirm(
      `Delete vendor "${vendor.name || vendor.id}"?\n\nThis will remove the vendor record, application, and vendor subcollections (products, shipping, payments).\nOrders will remain for history. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingVendorId(vendor.id);
    try {
      await deleteCollection(collection(db, 'tenants', vendor.id, 'products'));
      await deleteCollection(collection(db, 'tenants', vendor.id, 'shippingMethods'));
      await deleteCollection(collection(db, 'tenants', vendor.id, 'shippingZones'));
      await deleteCollection(collection(db, 'tenants', vendor.id, 'paymentMethods'));

      // remove application if it exists
      await deleteDoc(doc(db, 'applications', vendor.id)).catch(() => null);

      // remove tenant record
      await deleteDoc(doc(db, 'tenants', vendor.id));

      toast.success('Vendor deleted');
      if (selectedVendor?.id === vendor.id) {
        setSelectedVendor(null);
        setSelectedApplication(null);
      }
    } catch (error) {
      console.error('Failed to delete vendor', error);
      toast.error('Failed to delete vendor');
    } finally {
      setDeletingVendorId(null);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Vendor Management</h2>

      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="p-4 border-b flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Vendor</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Subdomain</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Sales</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((vendor) => (
              <tr key={vendor.id} className="hover:bg-gray-50">
                <td className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    {vendor.logo && (
                      <img
                        src={vendor.logo}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 rounded object-cover"
                      />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{vendor.name}</p>
                      <p className="text-xs text-gray-500">{vendor.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <a
                    href={`/store/${vendor.subdomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    /store/{vendor.subdomain}
                    <ExternalLink size={12} />
                  </a>
                </td>
                <td className="py-4 px-4">
                  <p className="font-medium">R{Number(vendor.totalSales || 0).toFixed(2)}</p>
                  <p className="text-xs text-gray-500">
                    Pending: R{Number(vendor.pendingPayout || 0).toFixed(2)}
                  </p>
                </td>
                <td className="py-4 px-4">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      vendor.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {vendor.isActive ? <CheckCircle size={12} /> : <Ban size={12} />}
                    {vendor.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => openVendorDetails(vendor)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded text-sm flex items-center gap-1"
                      title="View vendor details"
                    >
                      <Eye size={14} />
                      View
                    </button>
                    <a
                      href={`/store/${vendor.subdomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded text-sm flex items-center gap-1"
                      title="Open vendor store"
                    >
                      <ExternalLink size={14} />
                      Store
                    </a>
                    <button
                      onClick={() => accessVendorDashboard(vendor)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-sm flex items-center gap-1"
                      title="Access vendor dashboard"
                    >
                      <Settings size={14} />
                      Dashboard
                    </button>
                    <button
                      onClick={() => toggleStatus(vendor)}
                      className={`px-3 py-1 rounded text-sm ${
                        vendor.isActive
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {vendor.isActive ? 'Suspend' : 'Activate'}
                    </button>
                    <button
                      onClick={() => deleteVendor(vendor)}
                      disabled={deletingVendorId === vendor.id}
                      className="px-3 py-1 rounded text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {deletingVendorId === vendor.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-gray-500">
                  No vendors found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">{selectedVendor.name}</h3>
                <p className="text-sm text-gray-500">{selectedVendor.email}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedVendor(null);
                  setSelectedApplication(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                X
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Business Details</h4>
                <div className="space-y-1 text-sm text-gray-700">
                  <p>Subdomain: {selectedVendor.subdomain}</p>
                  <p>Category: {selectedVendor.category || 'N/A'}</p>
                  <p>Status: {selectedVendor.status || (selectedVendor.isActive ? 'active' : 'suspended')}</p>
                  <p>Phone: {selectedVendor.phone || 'N/A'}</p>
                  <p>ID Number: {selectedVendor.idNumber || 'N/A'}</p>
                  {selectedVendor.appliedAt?.toDate?.() && (
                    <p>Applied: {selectedVendor.appliedAt.toDate().toLocaleDateString('en-ZA')}</p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Address</h4>
                <div className="text-sm text-gray-700">
                  {selectedVendor.address?.street || 'No address'}
                  {selectedVendor.address?.suburb ? `, ${selectedVendor.address.suburb}` : ''}
                  {selectedVendor.address?.city ? `, ${selectedVendor.address.city}` : ''}
                  {selectedVendor.address?.postalCode ? ` ${selectedVendor.address.postalCode}` : ''}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Banking Details</h4>
                <div className="space-y-1 text-sm text-gray-700">
                  <p>Account Holder: {selectedVendor.bankDetails?.accountHolder || 'N/A'}</p>
                  <p>Bank: {selectedVendor.bankDetails?.bankName || 'N/A'}</p>
                  <p>Account Number: {selectedVendor.bankDetails?.accountNumber || 'N/A'}</p>
                  <p>Branch Code: {selectedVendor.bankDetails?.branchCode || 'N/A'}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Application Status</h4>
                {selectedApplication ? (
                  <div className="space-y-1 text-sm text-gray-700">
                    <p>Status: {selectedApplication.status}</p>
                    {selectedApplication.submittedAt?.toDate?.() && (
                      <p>Submitted: {selectedApplication.submittedAt.toDate().toLocaleDateString('en-ZA')}</p>
                    )}
                    {selectedApplication.reviewedAt?.toDate?.() && (
                      <p>Reviewed: {selectedApplication.reviewedAt.toDate().toLocaleDateString('en-ZA')}</p>
                    )}
                    {selectedApplication.notes && <p>Notes: {selectedApplication.notes}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No application record found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
