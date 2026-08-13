const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const ensureAdminAccess = async (context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  const email = String(context.auth.token?.email || '').toLowerCase();
  if (email === 'admin@mzansishop.com' || email === 'bonginkosiconsider@gmail.com') {
    return;
  }

  const adminSnap = await admin.firestore().collection('admins').doc(context.auth.uid).get();
  if (!adminSnap.exists || adminSnap.data()?.active === false) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
};

const normalizeBankDetails = (bankDetails = {}) => ({
  accountHolder: String(bankDetails.accountHolder || '').trim(),
  bankName: String(bankDetails.bankName || '').trim(),
  accountNumber: String(bankDetails.accountNumber || '').trim(),
  branchCode: String(bankDetails.branchCode || '').trim()
});

const validateBankDetails = (bankDetails) =>
  Boolean(
    bankDetails.accountHolder
    && bankDetails.bankName
    && bankDetails.accountNumber
    && bankDetails.branchCode
  );

exports.requestPromoterCashout = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const amount = round2(data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Enter a valid cashout amount');
    }

    const promoterRef = admin.firestore().collection('promoters').doc(context.auth.uid);
    const requestRef = admin.firestore().collection('promoterCashoutRequests').doc();
    const transactionRef = admin.firestore().collection('promoterTransactions').doc();

    await admin.firestore().runTransaction(async (transaction) => {
      const promoterSnap = await transaction.get(promoterRef);
      if (!promoterSnap.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'Promoter profile not found');
      }

      const promoter = promoterSnap.data() || {};
      const availableBalance = round2(promoter.availableBalance);
      const bankDetails = normalizeBankDetails(promoter.bankDetails);

      if (!validateBankDetails(bankDetails)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Complete your bank details before requesting a cashout'
        );
      }

      if (amount > availableBalance) {
        throw new functions.https.HttpsError('failed-precondition', 'Cashout amount exceeds available balance');
      }

      transaction.set(
        promoterRef,
        {
          availableBalance: admin.firestore.FieldValue.increment(-amount),
          pendingCashoutBalance: admin.firestore.FieldValue.increment(amount),
          lastCashoutRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      transaction.set(requestRef, {
        id: requestRef.id,
        promoterId: context.auth.uid,
        promoterName: promoter.name || context.auth.token?.name || 'Promoter',
        promoterEmail: promoter.email || context.auth.token?.email || '',
        amount,
        status: 'pending',
        bankDetails,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        requestedBy: context.auth.token?.email || context.auth.uid
      });

      transaction.set(transactionRef, {
        promoterId: context.auth.uid,
        promoterEmail: promoter.email || context.auth.token?.email || '',
        amount: -amount,
        type: 'cashout_request',
        reason: 'Cashout requested',
        cashoutRequestId: requestRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.token?.email || context.auth.uid
      });
    });

    return {
      success: true,
      requestId: requestRef.id
    };
  } catch (error) {
    console.error('requestPromoterCashout failed', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to request cashout');
  }
});

exports.reviewPromoterCashoutRequest = functions.https.onCall(async (data, context) => {
  try {
    await ensureAdminAccess(context);

    const requestId = String(data?.requestId || '').trim();
    const action = String(data?.action || '').trim().toLowerCase();
    const adminNote = String(data?.adminNote || '').trim() || null;

    if (!requestId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing cashout request id');
    }

    if (!['paid', 'rejected'].includes(action)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid cashout action');
    }

    const requestRef = admin.firestore().collection('promoterCashoutRequests').doc(requestId);
    const reversalTransactionRef = admin.firestore().collection('promoterTransactions').doc();

    await admin.firestore().runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Cashout request not found');
      }

      const request = requestSnap.data() || {};
      if (request.status !== 'pending') {
        throw new functions.https.HttpsError('failed-precondition', 'Cashout request already processed');
      }

      const amount = round2(request.amount);
      const promoterId = request.promoterId;
      if (!promoterId || amount <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Invalid cashout request data');
      }

      const promoterRef = admin.firestore().collection('promoters').doc(promoterId);

      if (action === 'paid') {
        transaction.set(
          promoterRef,
          {
            pendingCashoutBalance: admin.firestore.FieldValue.increment(-amount),
            lifetimeCashedOut: admin.firestore.FieldValue.increment(amount),
            lastCashoutPaidAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      } else {
        transaction.set(
          promoterRef,
          {
            pendingCashoutBalance: admin.firestore.FieldValue.increment(-amount),
            availableBalance: admin.firestore.FieldValue.increment(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        transaction.set(reversalTransactionRef, {
          promoterId,
          promoterEmail: request.promoterEmail || null,
          amount,
          type: 'cashout_reversal',
          reason: 'Cashout request rejected',
          cashoutRequestId: requestId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: context.auth.token?.email || context.auth.uid
        });
      }

      transaction.set(
        requestRef,
        {
          status: action,
          adminNote,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedBy: context.auth.token?.email || context.auth.uid,
          paidAt: action === 'paid' ? admin.firestore.FieldValue.serverTimestamp() : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });

    return { success: true };
  } catch (error) {
    console.error('reviewPromoterCashoutRequest failed', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to review cashout request');
  }
});

exports.adjustPromoterBalance = functions.https.onCall(async (data, context) => {
  try {
    await ensureAdminAccess(context);

    const promoterId = String(data?.promoterId || '').trim();
    const amount = round2(data?.amount);
    const reason = String(data?.reason || '').trim() || null;

    if (!promoterId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing promoter id');
    }

    if (!Number.isFinite(amount) || amount === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Enter a valid amount');
    }

    const promoterRef = admin.firestore().collection('promoters').doc(promoterId);
    const transactionRef = admin.firestore().collection('promoterTransactions').doc();

    await admin.firestore().runTransaction(async (transaction) => {
      const promoterSnap = await transaction.get(promoterRef);
      if (!promoterSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Promoter profile not found');
      }

      const promoter = promoterSnap.data() || {};
      const availableBalance = round2(promoter.availableBalance);
      const debitAmount = Math.abs(amount);

      if (amount < 0 && debitAmount > availableBalance) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Deduction exceeds the promoter available balance'
        );
      }

      const promoterUpdate = {
        availableBalance: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (amount > 0) {
        promoterUpdate.lifetimeCredited = admin.firestore.FieldValue.increment(amount);
        promoterUpdate.lastCreditedAt = admin.firestore.FieldValue.serverTimestamp();
      } else {
        promoterUpdate.lifetimeDebited = admin.firestore.FieldValue.increment(debitAmount);
        promoterUpdate.lastDebitedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      transaction.set(promoterRef, promoterUpdate, { merge: true });
      transaction.set(transactionRef, {
        promoterId,
        promoterEmail: promoter.email || null,
        amount,
        reason: reason || (amount > 0 ? 'Manual admin credit' : 'Manual admin deduction'),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.token?.email || context.auth.uid,
        type: amount > 0 ? 'manual_credit' : 'manual_debit'
      });
    });

    return { success: true, transactionId: transactionRef.id };
  } catch (error) {
    console.error('adjustPromoterBalance failed', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to adjust promoter balance');
  }
});
