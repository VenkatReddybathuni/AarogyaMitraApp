export const SUPPORTED_SPECIALTIES = [
  'Cardiology',
  'Dermatology',
  'Neurology',
  'General Medicine',
];

export const fallbackDoctors = [
  {
    id: 'aditi-rao',
    name: 'Dr. Aditi Rao',
    nameTranslations: {
      en: 'Dr. Aditi Rao',
      hi: 'डॉ. अदिति राव',
    },
    specialization: 'Cardiology',
    hospital: 'Sunshine Multispeciality Hospital',
    experienceYears: 12,
    languages: ['English', 'Hindi', 'Kannada'],
    acceptingNewPatients: true,
  },
  {
    id: 'manish-patel',
    name: 'Dr. Manish Patel',
    nameTranslations: {
      en: 'Dr. Manish Patel',
      hi: 'डॉ. मनीष पटेल',
    },
    specialization: 'Cardiology',
    hospital: 'City Heart Center',
    experienceYears: 15,
    languages: ['English', 'Hindi', 'Gujarati'],
    acceptingNewPatients: true,
  },
  {
    id: 'lavanya-menon',
    name: 'Dr. Lavanya Menon',
    nameTranslations: {
      en: 'Dr. Lavanya Menon',
      hi: 'डॉ. लावण्य मेनन',
    },
    specialization: 'Cardiology',
    hospital: 'Apollo Heart Institute',
    experienceYears: 10,
    languages: ['English', 'Malayalam', 'Hindi'],
    acceptingNewPatients: false,
  },
  {
    id: 'neha-sharma',
    name: 'Dr. Neha Sharma',
    nameTranslations: {
      en: 'Dr. Neha Sharma',
      hi: 'डॉ. नेहा शर्मा',
    },
    specialization: 'Dermatology',
    hospital: 'SkinGlow Clinic',
    experienceYears: 9,
    languages: ['English', 'Hindi'],
    acceptingNewPatients: true,
  },
  {
    id: 'farah-khan',
    name: 'Dr. Farah Khan',
    nameTranslations: {
      en: 'Dr. Farah Khan',
      hi: 'डॉ. फराह खान',
    },
    specialization: 'Dermatology',
    hospital: 'ClearSkin Institute',
    experienceYears: 14,
    languages: ['English', 'Urdu'],
    acceptingNewPatients: true,
  },
  {
    id: 'vivek-menon',
    name: 'Dr. Vivek Menon',
    nameTranslations: {
      en: 'Dr. Vivek Menon',
      hi: 'डॉ. विवेक मेनन',
    },
    specialization: 'Neurology',
    hospital: 'NeuroCare Hospital',
    experienceYears: 16,
    languages: ['English', 'Hindi', 'Tamil'],
    acceptingNewPatients: true,
  },
  {
    id: 'priya-kulkarni',
    name: 'Dr. Priya Kulkarni',
    nameTranslations: {
      en: 'Dr. Priya Kulkarni',
      hi: 'डॉ. प्रिया कुलकर्णी',
    },
    specialization: 'Neurology',
    hospital: 'Brain & Spine Center',
    experienceYears: 11,
    languages: ['English', 'Marathi'],
    acceptingNewPatients: false,
  },
  {
    id: 'rohan-iyer',
    name: 'Dr. Rohan Iyer',
    nameTranslations: {
      en: 'Dr. Rohan Iyer',
      hi: 'डॉ. रोहन अय्यर',
    },
    specialization: 'General Medicine',
    hospital: 'Community Health Clinic',
    experienceYears: 8,
    languages: ['English', 'Hindi'],
    acceptingNewPatients: true,
  },
  {
    id: 'seema-parikh',
    name: 'Dr. Seema Parikh',
    nameTranslations: {
      en: 'Dr. Seema Parikh',
      hi: 'डॉ. सीमा पारिख',
    },
    specialization: 'General Medicine',
    hospital: 'Green Cross Hospital',
    experienceYears: 13,
    languages: ['English', 'Gujarati'],
    acceptingNewPatients: true,
  },
  {
    id: 'ashok-pillai',
    name: 'Dr. Ashok Pillai',
    nameTranslations: {
      en: 'Dr. Ashok Pillai',
      hi: 'डॉ. अशोक पिल्लै',
    },
    specialization: 'General Medicine',
    hospital: 'CityCare Family Hospital',
    experienceYears: 18,
    languages: ['English', 'Malayalam', 'Hindi'],
    acceptingNewPatients: false,
  },
];

export const getFallbackDoctorsBySpecialty = (specialty) => {
  if (!specialty) {
    return [];
  }
  return fallbackDoctors.filter(
    (doctor) => doctor.specialization.toLowerCase() === specialty.toLowerCase()
  );
};

export const normalizeSpecialtyLabel = (label) => {
  if (!label) {
    return '';
  }

  const trimmed = label.trim().toLowerCase();
  if (trimmed === 'general' || trimmed === 'general physician' || trimmed === 'physician') {
    return 'General Medicine';
  }

  const match = SUPPORTED_SPECIALTIES.find(
    (specialty) => specialty.toLowerCase() === trimmed
  );

  return match || label.trim();
};

export const getLocalizedDoctorName = (doctor, language = 'en') => {
  if (!doctor) {
    return '';
  }

  if (typeof doctor === 'string') {
    return doctor;
  }

  const translations =
    doctor.nameTranslations ||
    doctor.localizedNames ||
    doctor.translations?.name;

  if (translations && typeof translations === 'object') {
    return translations[language] || translations.en || doctor.name || '';
  }

  return doctor.name || '';
};
