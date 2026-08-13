import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();
const ADMIN_EMAILS = ['admin@mzansishop.com'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    let adminUnsubscribe = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (adminUnsubscribe) {
        adminUnsubscribe();
        adminUnsubscribe = null;
      }
      setAdminLoading(true);

      if (firebaseUser) {
        // Check if user is a vendor (has tenant)
        try {
          const tenantDoc = await getDoc(doc(db, 'tenants', firebaseUser.uid));
          if (tenantDoc.exists()) {
            setTenant({ id: tenantDoc.id, ...tenantDoc.data() });
          }
        } catch (error) {
          console.error('Error loading tenant data:', error.message);
        }

        // Check if user is an admin (email list or admins collection)
        const emailAdmin = ADMIN_EMAILS.includes(firebaseUser.email || '');
        setIsAdmin(emailAdmin);

        if (emailAdmin) {
          setAdminLoading(false);
        } else {
          adminUnsubscribe = onSnapshot(
            doc(db, 'admins', firebaseUser.uid),
            (snap) => {
              const active = snap.exists() && snap.data()?.active !== false;
              setIsAdmin(emailAdmin || active);
              setAdminLoading(false);
            },
            (error) => {
              console.error('Error loading admin data:', error.message);
              setIsAdmin(emailAdmin);
              setAdminLoading(false);
            }
          );
        }

        setUser(firebaseUser);
      } else {
        setUser(null);
        setTenant(null);
        setIsAdmin(false);
        setAdminLoading(false);
      }
      setLoading(false);
    });

    return () => {
      if (adminUnsubscribe) adminUnsubscribe();
      unsubscribe();
    };
  }, []);

  // Register as vendor (creates tenant)
  const registerVendor = async (email, password, storeData) => {
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await sendEmailVerification(newUser);
    } catch (error) {
      console.error('Failed to send verification email:', error.message);
    }
    
    // Create tenant document
    await setDoc(doc(db, 'tenants', newUser.uid), {
      ...storeData,
      ownerId: newUser.uid,
      status: 'pending_approval',
      isActive: false,
      createdAt: new Date(),
      subdomain: storeData.subdomain.toLowerCase().replace(/\s+/g, '-'),
      totalSales: 0,
      pendingPayout: 0
    });

    await setDoc(doc(db, 'applications', newUser.uid), {
      tenantId: newUser.uid,
      status: 'pending',
      submittedAt: new Date(),
      reviewedBy: null,
      reviewedAt: null,
      notes: ''
    });

    await updateProfile(newUser, { displayName: storeData.name });
    return newUser;
  };

  const ensureCustomerProfile = async (firebaseUser) => {
    if (!firebaseUser) return;
    try {
      const customerRef = doc(db, 'customers', firebaseUser.uid);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) return;
      const fallbackName = firebaseUser.displayName
        || firebaseUser.email?.split('@')?.[0]
        || 'Customer';
      await setDoc(customerRef, {
        name: fallbackName,
        email: firebaseUser.email || '',
        addresses: [],
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Failed to create customer profile:', error.message);
    }
  };

  // Register as customer
  const registerCustomer = async (email, password, name) => {
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(newUser, { displayName: name });
    try {
      await sendEmailVerification(newUser);
    } catch (error) {
      console.error('Failed to send verification email:', error.message);
    }
    
    // Create customer doc
    await setDoc(doc(db, 'customers', newUser.uid), {
      name,
      email,
      addresses: [],
      createdAt: new Date()
    });
    return newUser;
  };

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const { user: signedInUser } = await signInWithPopup(auth, provider);
    await ensureCustomerProfile(signedInUser);
    return signedInUser;
  };
  const logout = () => signOut(auth);
  const resetPassword = async (email) => {
    if (!email) throw new Error('Email is required');
    await sendPasswordResetEmail(auth, email);
  };
  const sendVerificationEmail = async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  };
  const refreshUser = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setUser(auth.currentUser);
  };

  const value = {
    user,
    tenant,
    loading,
    adminLoading,
    isVendor: !!tenant,
    isAdmin,
    setTenant,
    registerVendor,
    registerCustomer,
    login,
    loginWithGoogle,
    resetPassword,
    logout,
    sendVerificationEmail,
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
