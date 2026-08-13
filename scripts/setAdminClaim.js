// run this script with `node scripts/setAdminClaim.js <uid>`
// it uses firebase-admin to add the `admin` custom claim to a user.
// you must have a service account key in GOOGLE_APPLICATION_CREDENTIALS
// environment variable or the CLI is already authenticated.

const admin = require('firebase-admin');

if (!process.argv[2]) {
  console.log('Usage: node scripts/setAdminClaim.js <uid>');
  process.exit(1);
}

admin.initializeApp();

const uid = process.argv[2];

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`Successfully granted admin claim to user ${uid}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error setting custom claim:', err);
    process.exit(1);
  });
