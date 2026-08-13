import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { savePromoterReferralCode } from '../../utils/promoterReferral';

export default function PromoterReferralTracker() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('ref') || params.get('promoter');
    if (!code) return;
    savePromoterReferralCode(code);
  }, [location.search]);

  return null;
}
