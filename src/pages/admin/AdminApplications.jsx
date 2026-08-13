import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Check, X, MapPin, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
export default function AdminApplications() {
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'applications'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const apps = [];
      for (const docSnap of snapshot.docs) {
        const appData = docSnap.data();
        const tenantDoc = await getDoc(doc(db, 'tenants', appData.tenantId));
        apps.push({
          id: docSnap.id,
          ...appData,
          tenant: tenantDoc.exists() ? tenantDoc.data() : null
        });
      }
      setApplications(apps);
    });

    return unsubscribe;
  }, []);

  const approveApplication = async (app) => {
    try {
      await updateDoc(doc(db, 'tenants', app.tenantId), {
        status: 'active',
        isActive: true,
        approvedAt: new Date(),
        approvedBy: 'admin@mzansishop.com'
      });

      await updateDoc(doc(db, 'applications', app.id), {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: 'admin@mzansishop.com'
      });

      await setDoc(doc(db, 'subscriptions', app.tenantId), {
        tenantId: app.tenantId,
        amount: 100,
        status: 'active',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      });

      toast.success('Application approved');
      setSelectedApp(null);
    } catch (error) {
      toast.error(`Approval failed: ${error.message}`);
    }
  };

  const rejectApplication = async (app, reason) => {
    try {
      await updateDoc(doc(db, 'applications', app.id), {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: 'admin@mzansishop.com',
        rejectionReason: reason
      });

      await updateDoc(doc(db, 'tenants', app.tenantId), {
        status: 'rejected',
        rejectionReason: reason
      });

      toast.success('Application rejected');
      setSelectedApp(null);
    } catch (error) {
      toast.error('Rejection failed');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Pending Applications ({applications.length})</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {applications.map((app) => (
            <div
              key={app.id}
              onClick={() => setSelectedApp(app)}
              className={`p-4 border rounded-lg cursor-pointer hover:shadow-md ${
                selectedApp?.id === app.id ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{app.tenant?.name || 'Unknown Business'}</h3>
                  <p className="text-sm text-gray-500">{app.tenant?.email}</p>
                  <p className="text-sm text-blue-600 mt-1">
                    /store/{app.tenant?.subdomain}
                  </p>
                </div>
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Pending</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Applied {app.submittedAt?.toDate?.().toLocaleDateString() || ''}
              </p>
            </div>
          ))}
        </div>

        {selectedApp && (
          <div className="bg-white border rounded-lg p-6 sticky top-6">
            <h3 className="text-xl font-bold mb-4">Application Details</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500">Business Name</label>
                <p className="font-medium">{selectedApp.tenant?.name}</p>
              </div>

              <div>
                <label className="text-sm text-gray-500">Category</label>
                <p className="font-medium capitalize">{selectedApp.tenant?.category}</p>
              </div>

              <div>
                <label className="text-sm text-gray-500">Description</label>
                <p className="text-sm">{selectedApp.tenant?.description}</p>
              </div>

              <div className="flex items-start gap-2">
                <MapPin size={16} className="text-gray-400 mt-1" />
                <div className="text-sm">
                  {selectedApp.tenant?.address?.street}
                  <br />
                  {selectedApp.tenant?.address?.suburb}, {selectedApp.tenant?.address?.city}
                  <br />
                  {selectedApp.tenant?.address?.postalCode}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Phone size={16} className="text-gray-400" />
                <span className="text-sm">{selectedApp.tenant?.phone}</span>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm text-gray-500">Banking Details</label>
                <div className="text-sm mt-1">
                  <p>{selectedApp.tenant?.bankDetails?.bankName}</p>
                  <p>
                    Account: ****{selectedApp.tenant?.bankDetails?.accountNumber?.slice(-4)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => approveApplication(selectedApp)}
                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Check size={20} /> Approve
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Rejection reason:');
                  if (reason) rejectApplication(selectedApp, reason);
                }}
                className="flex-1 bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 flex items-center justify-center gap-2"
              >
                <X size={20} /> Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
