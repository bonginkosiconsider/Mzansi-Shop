import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';

export default function AdminClaim() {
  const { user, isAdmin } = useAuth();
  const [status, setStatus] = useState('idle');
  const [exists, setExists] = useState(false);

  useEffect(() => {
    const checkDoc = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'admins', user.uid));
        setExists(snap.exists());
      } catch (error) {
        console.error('Failed to check admin doc:', error);
      }
    };
    checkDoc();
  }, [user]);

  const handleClaim = async () => {
    if (!user) return;
    setStatus('saving');
    try {
      await setDoc(
        doc(db, 'admins', user.uid),
        {
          active: true,
          email: user.email || '',
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      setStatus('done');
    } catch (error) {
      console.error('Failed to claim admin:', error);
      setStatus('error');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <h1 className="text-2xl font-bold mb-2">Admin Access</h1>
          <p className="text-gray-600 mb-6">Please sign in to claim admin access.</p>
          <Link to="/login" className="inline-block bg-blue-600 text-white px-4 py-2 rounded">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <h1 className="text-2xl font-bold mb-2">Admin Access Ready</h1>
          <p className="text-gray-600 mb-6">You already have admin access.</p>
          <Link to="/admin" className="inline-block bg-blue-600 text-white px-4 py-2 rounded">
            Go to Admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Claim Admin Access</h1>
        <p className="text-gray-600 mb-4">
          Signed in as <span className="font-semibold">{user.email}</span>
        </p>
        {exists && (
          <p className="text-sm text-gray-500 mb-4">
            Admin record exists but is not active yet.
          </p>
        )}
        <button
          type="button"
          onClick={handleClaim}
          disabled={status === 'saving'}
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {status === 'saving' ? 'Claiming...' : 'Make Me Admin'}
        </button>
        {status === 'done' && (
          <p className="text-green-600 mt-4">
            Admin access granted. Go to{' '}
            <Link to="/admin" className="underline">
              /admin
            </Link>
            .
          </p>
        )}
        {status === 'error' && (
          <p className="text-red-600 mt-4">Failed to claim admin access.</p>
        )}
      </div>
    </div>
  );
}
