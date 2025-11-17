const SYMPTOM_CATEGORIES = [
  {
    key: 'fever',
    name: 'Fever & Chills',
    icon: '🌡️',
    keywords: ['fever', 'temperature', 'hot body', 'high temp', 'chills', 'shivering'],
    followUps: [
      'When did the fever start?',
      'Do you also have chills, body pain, or headache?',
      'Have you measured your temperature?',
      'Are you taking any medicines currently?',
      'Have you noticed rash, cough, or sore throat?'
    ],
    selfCareIntro: 'Mild fever usually improves with rest and fluids. Monitor your temperature twice a day.',
    selfCareTips: [
      'Drink plenty of water, homemade ORS, or coconut water every 2 hours.',
      'Take enough rest, avoid heavy physical activity, and try to sleep well.',
      'Wipe the body with a lukewarm wet cloth if temperature is above 101°F.',
      'Have light meals like khichdi, soups, or fruits. Avoid spicy and oily food.',
      'Paracetamol (if not allergic) can help reduce fever. Follow dosage on label.',
      'Seek urgent care if the fever crosses 103°F or lasts more than 3 days.'
    ],
    escalateAfterDays: 3,
  },
  {
    key: 'cold',
    name: 'Cold & Sore Throat',
    icon: '🤧',
    keywords: ['cold', 'runny nose', 'blocked nose', 'sneeze', 'sore throat', 'throat pain'],
    followUps: [
      'Do you have throat pain or just a blocked nose?',
      'Is there any fever or body ache with this?',
      'How is your cough? Dry or with phlegm?',
      'Are you having any breathing difficulty?',
      'Any known allergies or recent weather change?'
    ],
    selfCareIntro: 'Common cold gets better in 5-7 days. Hydration and steam help a lot.',
    selfCareTips: [
      'Sip warm water with honey and ginger to soothe the throat.',
      'Do steam inhalation 2-3 times a day to open nasal passages.',
      'Gargle with warm salt water morning and night.',
      'Use saline nasal drops or spray to ease blockage.',
      'Avoid cold drinks, ice cream, and dusty areas.',
      'Sleep with head slightly raised to ease breathing.'
    ],
    escalateAfterDays: 5,
  },
  {
    key: 'cough',
    name: 'Cough & Chest Congestion',
    icon: '😷',
    keywords: ['cough', 'chest pain', 'phlegm', 'breathless', 'wheezing'],
    followUps: [
      'Is your cough dry or do you bring out phlegm?',
      'Do you feel chest tightness or face breathing trouble?',
      'Any fever, sore throat, or nasal discharge along with cough?',
      'Do you smoke or have asthma?',
      'How is your sleep? Does coughing worsen at night?'
    ],
    selfCareIntro: 'For mild cough, warm liquids and steam can provide relief.',
    selfCareTips: [
      'Take steam inhalation with a pinch of turmeric or ajwain.',
      'Drink warm water with tulsi, pepper, and honey.',
      'Avoid cold drinks, smoking, and dusty environments.',
      'Sleep on your side with extra pillows to reduce cough at night.',
      'If you have phlegm, do gentle chest tapping to loosen it.',
      'Seek medical help if there is blood in cough or severe breathlessness.'
    ],
    escalateAfterDays: 5,
  },
  {
    key: 'stomach',
    name: 'Stomach Pain & Indigestion',
    icon: '🤒',
    keywords: ['stomach pain', 'gastric', 'indigestion', 'loose motion', 'vomit', 'acidity'],
    followUps: [
      'Where exactly do you feel the pain?',
      'Do you have vomiting, loose motions, or constipation?',
      'Did you eat anything unusual outside?',
      'Are you passing gas or burping more than usual?',
      'Any burning sensation in the chest or throat?'
    ],
    selfCareIntro: 'Most stomach upsets improve in 1-2 days with light food and hydration.',
    selfCareTips: [
      'Take light meals like dal-rice, curd rice, or bananas.',
      'Sip coconut water, rice kanji, or ORS to stay hydrated.',
      'Avoid spicy, fried, or oily foods until stomach settles.',
      'Have a pinch of ajwain with warm water to reduce gas.',
      'Rest your stomach by eating small portions every few hours.',
      'See a doctor urgently if there is blood in vomit or stool.'
    ],
    escalateAfterDays: 2,
  },
  {
    key: 'headache',
    name: 'Headache & Migraine',
    icon: '🤕',
    keywords: ['headache', 'migraine', 'head pain', 'forehead pain', 'temple pain'],
    followUps: [
      'Where exactly is the pain located?',
      'Do you also feel nausea, vomiting, or light sensitivity?',
      'Did you sleep well and drink enough water?',
      'Any stress, vision issues, or long screen time?',
      'Have you had similar headaches before?'
    ],
    selfCareIntro: 'Mild headaches often settle with hydration, rest, and reduced screen time.',
    selfCareTips: [
      'Drink 2-3 glasses of water or a rehydrating drink.',
      'Rest in a quiet, dark room for 20 minutes.',
      'Do gentle neck and shoulder stretches.',
      'Have light meals; skipping meals can worsen headaches.',
      'Apply a cold or warm compress on the forehead.',
      'Consult a doctor if the pain is sudden and severe.'
    ],
    escalateAfterDays: 4,
  },
];

const DEFAULT_FOLLOW_UPS = [
  'Can you describe where you feel the problem?',
  'When did these symptoms start?',
  'Do you have fever, pain, or weakness along with it?',
  'Are you taking any medicines currently?',
];

const DEFAULT_PLAN = {
  title: 'Your health concern',
  summary: 'Let me share a basic care routine you can follow at home.',
  tips: [
    'Drink enough water (8-10 glasses) unless a doctor advised otherwise.',
    'Sleep for at least 7 hours and keep stress low.',
    'Eat simple, home-cooked meals in small portions.',
    'Avoid self-medication beyond basic pain relievers.',
    'Visit a doctor if symptoms worsen or do not improve in 2 days.'
  ],
  escalateAfterDays: 3,
};

const findCategory = (key) => SYMPTOM_CATEGORIES.find(cat => cat.key === key);

export const analyzeSymptoms = (rawText = '') => {
  const text = rawText.toLowerCase();
  if (!text.trim()) {
    return { category: null, confidence: 0, details: null };
  }

  let bestMatch = { category: null, confidence: 0, details: null };

  SYMPTOM_CATEGORIES.forEach(category => {
    let matches = 0;
    category.keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        matches += 1;
      }
    });

    if (matches > 0) {
      const confidence = matches / category.keywords.length;
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          category: category.key,
          confidence,
          details: {
            name: category.name,
            icon: category.icon,
          },
        };
      }
    }
  });

  return bestMatch;
};

export const getFollowUpQuestions = (categoryKey) => {
  const category = findCategory(categoryKey);
  return category?.followUps || DEFAULT_FOLLOW_UPS;
};

export const getSelfCarePlan = (categoryKey) => {
  const category = findCategory(categoryKey);
  if (!category) {
    return DEFAULT_PLAN;
  }

  return {
    title: category.name,
    summary: category.selfCareIntro,
    tips: category.selfCareTips,
    escalateAfterDays: category.escalateAfterDays ?? DEFAULT_PLAN.escalateAfterDays,
    icon: category.icon,
  };
};

export const shouldEscalate = (categoryKey, severity = 1, durationDays = 0) => {
  const plan = getSelfCarePlan(categoryKey);
  if (severity >= 8) return true;
  if (durationDays >= plan.escalateAfterDays) return true;
  return false;
};
