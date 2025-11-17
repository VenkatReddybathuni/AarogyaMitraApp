const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.resolve(__dirname, '../serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`\n❌ Service account key not found at: ${serviceAccountPath}`);
  console.error('Please download a Firebase Admin SDK private key JSON and set the');
  console.error('GOOGLE_APPLICATION_CREDENTIALS env variable or place the file at scripts/../serviceAccountKey.json.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const timestamp = admin.firestore.FieldValue.serverTimestamp();

const doctors = [
  {
    id: 'aditi-rao',
    name: 'Dr. Aditi Rao',
    specialization: 'Cardiology',
    hospital: 'Sunshine Multispeciality Hospital',
    experienceYears: 12,
    languages: ['English', 'Hindi', 'Kannada'],
    acceptingNewPatients: true,
  },
  {
    id: 'manish-patel',
    name: 'Dr. Manish Patel',
    specialization: 'Cardiology',
    hospital: 'City Heart Center',
    experienceYears: 15,
    languages: ['English', 'Hindi', 'Gujarati'],
    acceptingNewPatients: true,
  },
  {
    id: 'lavanya-menon',
    name: 'Dr. Lavanya Menon',
    specialization: 'Cardiology',
    hospital: 'Apollo Heart Institute',
    experienceYears: 10,
    languages: ['English', 'Malayalam', 'Hindi'],
    acceptingNewPatients: false,
  },
  {
    id: 'neha-sharma',
    name: 'Dr. Neha Sharma',
    specialization: 'Dermatology',
    hospital: 'SkinGlow Clinic',
    experienceYears: 9,
    languages: ['English', 'Hindi'],
    acceptingNewPatients: true,
  },
  {
    id: 'farah-khan',
    name: 'Dr. Farah Khan',
    specialization: 'Dermatology',
    hospital: 'ClearSkin Institute',
    experienceYears: 14,
    languages: ['English', 'Urdu'],
    acceptingNewPatients: true,
  },
  {
    id: 'vivek-menon',
    name: 'Dr. Vivek Menon',
    specialization: 'Neurology',
    hospital: 'NeuroCare Hospital',
    experienceYears: 16,
    languages: ['English', 'Hindi', 'Tamil'],
    acceptingNewPatients: true,
  },
  {
    id: 'priya-kulkarni',
    name: 'Dr. Priya Kulkarni',
    specialization: 'Neurology',
    hospital: 'Brain & Spine Center',
    experienceYears: 11,
    languages: ['English', 'Marathi'],
    acceptingNewPatients: false,
  },
  {
    id: 'rohan-iyer',
    name: 'Dr. Rohan Iyer',
    specialization: 'General Medicine',
    hospital: 'Community Health Clinic',
    experienceYears: 8,
    languages: ['English', 'Hindi'],
    acceptingNewPatients: true,
  },
  {
    id: 'seema-parikh',
    name: 'Dr. Seema Parikh',
    specialization: 'General Medicine',
    hospital: 'Green Cross Hospital',
    experienceYears: 13,
    languages: ['English', 'Gujarati'],
    acceptingNewPatients: true,
  },
  {
    id: 'ashok-pillai',
    name: 'Dr. Ashok Pillai',
    specialization: 'General Medicine',
    hospital: 'CityCare Family Hospital',
    experienceYears: 18,
    languages: ['English', 'Malayalam', 'Hindi'],
    acceptingNewPatients: false,
  },
];

async function seedDoctors() {
  console.log(`\nSeeding ${doctors.length} doctors into Firestore...`);
  const batch = db.batch();

  doctors.forEach((doctor) => {
    const docRef = db.collection('doctors').doc(doctor.id);
    batch.set(docRef, {
      ...doctor,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  await batch.commit();
  console.log('✅ Doctors seeded successfully.');
}

seedDoctors()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed to seed doctors:', error);
    process.exit(1);
  });
