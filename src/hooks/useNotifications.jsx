import { useEffect } from 'react';
import { getMessaging, isSupported, getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { app, db } from '../firebase';
import toast from 'react-hot-toast';

export function useNotifications(userId) {
  useEffect(() => {
    let unsubscribe = null;
    let isMounted = true;

    const setupNotifications = async () => {
      if (!userId) return;
      if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

      const supported = await isSupported();
      if (!supported) return;

      let permission = 'default';
      try {
        permission = await Notification.requestPermission();
      } catch (error) {
        console.error('Notification permission failed:', error);
      }
      if (permission !== 'granted') return;

      const messaging = getMessaging(app);
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      const hasValidVapidKey =
        typeof vapidKey === 'string' &&
        vapidKey.length > 0 &&
        vapidKey !== 'your_vapid_key_for_notifications';

      if (hasValidVapidKey) {
        try {
          const token = await getToken(messaging, { vapidKey });
          if (token && isMounted) {
            await setDoc(
              doc(db, 'users', userId),
              { fcmToken: token, fcmUpdatedAt: new Date() },
              { merge: true }
            );
          }
        } catch (error) {
          console.error('Failed to get FCM token:', error);
        }
      }

      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || 'New notification';
        const body = payload.notification?.body || 'You have a new update.';
        const image = payload.notification?.image || '/logo.png';

        toast.custom((t) => (
          <div
            className={`${
              t.visible ? 'animate-enter' : 'animate-leave'
            } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
          >
            <div className="flex-1 w-0 p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 pt-0.5">
                  <img className="h-10 w-10 rounded-full" src={image} alt="" />
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">{title}</p>
                  <p className="mt-1 text-sm text-gray-500">{body}</p>
                </div>
              </div>
            </div>
          </div>
        ));
      });
    };

    setupNotifications();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);
}
