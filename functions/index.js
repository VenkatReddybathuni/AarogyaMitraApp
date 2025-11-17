const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const auth = admin.auth();
const db = admin.firestore();

/**
 * Cloud Function to create a custom token for phone-based login
 * Called after OTP verification on the client
 */
exports.createCustomToken = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { uid, phone } = req.body;

      if (!uid || !phone) {
        return res.status(400).json({ error: 'Missing uid or phone' });
      }

      // Verify the phone number exists in our users collection
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userDoc.data();
      if (userData.phone !== phone) {
        return res.status(403).json({ error: 'Phone number mismatch' });
      }

      // Create a custom token for this user
      const customToken = await auth.createCustomToken(uid, {
        phone: phone,
        loginMethod: 'phone-otp',
        timestamp: new Date().toISOString(),
      });

      res.json({ token: customToken });
    } catch (error) {
      console.error('Error creating custom token:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Cloud Function to store OTP verification records
 * (Alternative: This could be done from client if you add Firestore security rules)
 */
exports.generateAndStoreOtp = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: 'Missing phone' });
      }

      // Find user with this phone
      const usersSnapshot = await db
        .collection('users')
        .where('phone', '==', phone)
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        return res.status(404).json({ error: 'No account found with this phone' });
      }

      const userId = usersSnapshot.docs[0].id;
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP record
      await db.collection('otpVerifications').doc(userId).set({
        otp,
        phone,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        attempts: 0,
        createdAt: admin.firestore.Timestamp.now(),
      });

      res.json({ 
        message: 'OTP sent successfully',
        userId,
        // Don't return OTP in production!
        // otp is only for demo/development
      });
    } catch (error) {
      console.error('Error generating OTP:', error);
      res.status(500).json({ error: error.message });
    }
  });
});
