import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Check, X, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function VendorApprovals() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPendingTenants = () => {
    setLoading(true);
    try {
      // Fetch all tenants with pending_approval status
      const tenantsQuery = query(
        collection(db, 'tenants'),
        where('status', '==', 'pending_approval')
      );

      const unsubscribe = onSnapshot(tenantsQuery, (snapshot) => {
        const pendingTenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('✅ Pending tenants found:', pendingTenants.length, pendingTenants);
        setTenants(pendingTenants);
        setLoading(false);
      }, (error) => {
        console.error('❌ Firestore Error Code:', error.code);
        console.error('❌ Firestore Error Message:', error.message);
        console.error('❌ Full Error:', error);
        
        if (error.code === 'permission-denied') {
          toast.error('Permission denied. You need to be logged in.');
        } else if (error.code === 'unavailable') {
          toast.error('Firebase unavailable. Check your internet connection.');
        } else {
          toast.error(`Error: ${error.message}`);
        }
        setLoading(false);
      });

      return unsubscribe;
    } catch (e) {
      console.error('❌ Setup Error:', e);
      toast.error(`Setup error: ${e.message}`);
      setLoading(false);
      return () => {};
    }
  };

  useEffect(() => {
    const unsubscribe = fetchPendingTenants();
    return unsubscribe;
  }, []);

  const handleApprove = async (tenantId, tenantName) => {
    setLoading(true);
    try {
      // Update tenant to active
      await updateDoc(doc(db, 'tenants', tenantId), {
        status: 'active',
        isActive: true,
        approvedAt: new Date()
      });

      // Also update application if it exists
      try {
        await updateDoc(doc(db, 'applications', tenantId), {
          status: 'approved',
          reviewedAt: new Date(),
          reviewedBy: 'admin'
        });
      } catch (e) {
        // Applications doc might not exist, that's okay
      }

      toast.success(`✅ ${tenantName} approved!`);
    } catch (error) {
      console.error('Error approving vendor:', error);
      toast.error('Failed to approve vendor');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (tenantId, tenantName, reason) => {
    setLoading(true);
    try {
      // Update tenant to rejected
      await updateDoc(doc(db, 'tenants', tenantId), {
        status: 'rejected',
        isActive: false,
        rejectionReason: reason,
        rejectedAt: new Date()
      });

      // Also update application if it exists
      try {
        await updateDoc(doc(db, 'applications', tenantId), {
          status: 'rejected',
          reviewedAt: new Date(),
          reviewedBy: 'admin',
          notes: reason
        });
      } catch (e) {
        // Applications doc might not exist, that's okay
      }

      toast.success(`❌ ${tenantName} rejected`);
    } catch (error) {
      console.error('Error rejecting vendor:', error);
      toast.error('Failed to reject vendor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Vendor Approvals</h1>
          <p className="text-gray-600 mt-1">Review and approve vendor applications</p>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Business Name</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Email</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Category</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Applied</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tenants.length > 0 ? (
                  tenants.map((tenant) => {
                    const appliedDate = tenant.appliedAt?.toDate?.();
                    const daysAgo = appliedDate ? Math.floor((Date.now() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

                    return (
                      <tr key={tenant.id} className="hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-semibold text-gray-900">{tenant.name}</p>
                            <p className="text-sm text-gray-600">{tenant.subdomain}</p>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-gray-600">{tenant.email}</td>
                        <td className="py-4 px-6">
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            {tenant.category}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Clock size={16} />
                            {daysAgo === 0 ? 'Today' : `${daysAgo} days ago`}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(tenant.id, tenant.name)}
                              disabled={loading}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              <Check size={16} /> Approve
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('Rejection reason:');
                                if (reason) handleReject(tenant.id, tenant.name, reason);
                              }}
                              disabled={loading}
                              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              <X size={16} /> Reject
                            </button>
                            <button
                              onClick={() => alert(`
Business: ${tenant.name}
Email: ${tenant.email}
Phone: ${tenant.phone}
ID: ${tenant.idNumber}

Description: ${tenant.description}

Address: ${tenant.address?.street}, ${tenant.address?.suburb}, ${tenant.address?.city}

Bank: ${tenant.bankDetails?.bankName}
Account: ${tenant.bankDetails?.accountNumber}
                              `)}
                              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <AlertCircle size={48} className="text-gray-400 mb-3" />
                        <p className="text-gray-500 font-medium">No pending applications</p>
                        <button
                          onClick={fetchPendingTenants}
                          className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <RefreshCw size={16} /> Refresh
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock size={24} className="text-yellow-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Pending Applications</p>
                <p className="text-2xl font-bold text-gray-900">{tenants.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
