import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageVisit } from '../../utils/analyticsClient';

export default function RouteAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageVisit({ path: location.pathname, source: 'marketplace' });
  }, [location.pathname]);

  return null;
}
