import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, getDoc, doc } from 'firebase/firestore';

export default function FirebaseTest() {
  const [status, setStatus] = useState('Testing...');
  const [error, setError] = useState('');

  useEffect(() => {
    testFirebase();
  }, []);

  const testFirebase = async () => {
    try {
      // Test basic Firebase connection
      setStatus('Testing Firebase connection...');

      // Try to get a document that should exist
      const testDoc = await getDoc(doc(db, 'admin', 'config'));
      setStatus('Firebase connected successfully!');

      if (testDoc.exists()) {
        setStatus('Firebase connected and data accessible!');
      } else {
        setStatus('Firebase connected but no test data found (this is normal)');
      }

    } catch (err) {
      setError(`Firebase Error: ${err.message}`);
      setStatus('Firebase connection failed');

      // Try to provide helpful error messages
      if (err.message.includes('permission-denied')) {
        setError('Permission denied - check Firestore security rules');
      } else if (err.message.includes('unavailable')) {
        setError('Firebase service unavailable - check internet connection or Firebase configuration');
      } else if (err.message.includes('invalid-api-key')) {
        setError('Invalid API key - check your Firebase configuration in .env file');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-4">Firebase Connection Test</h1>

        <div className="space-y-4">
          <div className="text-center">
            <div className={`text-lg font-medium ${error ? 'text-red-600' : 'text-green-600'}`}>
              {status}
            </div>
            {error && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="text-sm text-gray-600">
            <p className="mb-2"><strong>Firebase Config Status:</strong></p>
            <ul className="space-y-1">
              <li>API Key: {import.meta.env.VITE_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing'}</li>
              <li>Project ID: {import.meta.env.VITE_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing'}</li>
              <li>Auth Domain: {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? '✅ Set' : '❌ Missing'}</li>
            </ul>
          </div>

          <button
            onClick={testFirebase}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          >
            Test Again
          </button>
        </div>
      </div>
    </div>
  );
}