# AarogyaMitra – Offline-Aware Telehealth Companion

Video Demo: <https://drive.google.com/file/d/18S_FkYHKQ4Nf5k5iWR_768JB4M72wQI-/view?usp=sharing>

AarogyaMitra is an Expo React Native application built for rural healthcare access. The product deliberately supports two complementary interaction styles:

- **Conversation-first users** can work entirely inside an AI-guided chat experience powered by Google Gemini to describe symptoms, ask questions, and receive next steps in plain language.
- **Task-oriented users** can move quickly through structured UI workflows for logging vitals, booking appointments, managing reminders, and uploading medical documents.

Both entry points share a common offline-first backbone so families and community health workers can keep recording data even when the network is unreliable. Once the device reconnects, all queued actions synchronize safely with Firebase.

---

## Table of Contents
1. [Personas and Usage Modes](#personas-and-usage-modes)
2. [Core Feature Matrix](#core-feature-matrix)
3. [Conversational AI Companion](#conversational-ai-companion)
4. [Guided UI Workflows](#guided-ui-workflows)
  - [Home Dashboard](#home-dashboard)
  - [Family Profiles](#family-profiles)
  - [Symptom Checker](#symptom-checker)
  - [Vital Recording](#vital-recording)
  - [Reminders](#reminders)
  - [Appointments](#appointments)
  - [Medical Documents Vault](#medical-documents-vault)
  - [Settings and Language Selection](#settings-and-language-selection)
5. [Offline-First Architecture](#offline-first-architecture)
6. [Notifications and Follow-ups](#notifications-and-follow-ups)
7. [Internationalization and Accessibility](#internationalization-and-accessibility)
8. [Technical Architecture](#technical-architecture)
9. [Project Structure](#project-structure)
10. [Environment Setup](#environment-setup)
11. [Development and Testing Tips](#development-and-testing-tips)
12. [Troubleshooting](#troubleshooting)
13. [Roadmap and Future Enhancements](#roadmap-and-future-enhancements)

---
## Personas and Usage Modes

| Persona | Preferred Mode | Pain Points Addressed | Feature Highlights |
|---------|----------------|------------------------|--------------------|
| Caregiver who trusts conversation | AI chat | Needs guidance in natural language, prefers verbal confirmations | Conversational symptom checker, explainers, follow-up prompts, speech synthesis |
| Community health worker | UI shortcuts | Wants fast logging for multiple patients, often has partial connectivity | Quick-action tiles, offline queues, reminder batching, document scanner |
| Tech-savvy family member | Hybrid | Switches between chat and forms, needs reliable history | Home dashboard summaries, cross-feature navigation, Firebase sync |

---

## Core Feature Matrix

| Area | User-Facing Feature | Backend Capability |
|------|---------------------|--------------------|
| Symptom support | AI symptom checker, conversation jumps to UI flows | Google Gemini API, prompt templating |
| Vital tracking | Log BP, sugar, temperature, heart rate, weight, SpO2 | Firestore storage, queued writes, optimistic UI |
| Appointments | Book, edit, cancel, join tele-consults | Appointment queue, meeting link generator |
| Reminders | Medicine and appointment reminders with statuses | Reminder queue, badge indicators, push integration |
| Documents | Upload prescriptions, lab reports, discharge summaries | Document upload queue, Firebase Storage |
| Notifications | Reminder notifications, templated payloads | Expo Notifications, Firebase Cloud Messaging |
| Family support | Manage linked family profiles with delegated access | ProfileContext, synced profile metadata, queue-aware filters |
| Language | English and Hindi runtime toggle | Context-driven i18n, persisted preference |
| Offline | Deferred writes for documents, reminders, appointments, vitals | AsyncStorage queues, NetInfo-aware flush |

---

## Conversational AI Companion

The AIChatScreen delivers a conversation-first experience for users who would rather explain their situation than tap through menus.

- Symptom narratives are routed through the Google Gemini API with safety prompts to ensure responsible guidance.
- Responses include clarifying questions, self-care suggestions, and escalation cues with links back into structured flows (book appointment, record vitals).
- Voice playback works everywhere; speech input is available in native builds via `expo-speech-recognition`.
- Conversation history survives screen swaps, making it easy to cross-reference instructions while completing forms.

---

## Guided UI Workflows

### Home Dashboard
- Quick actions for symptom check, vitals, reminders, documents, and appointments.
- Recent activity cards merge live Firestore data with locally queued entries so pending uploads are visible.
- Profile switching (via `ProfileContext`) supports caregivers managing family members.

### Family Profiles
- A primary account holder can add parents or dependents and switch between profiles without logging out.
- Each profile keeps its own vitals, reminders, appointments, and documents so records never mix across family members.
- Caregivers—such as an adult son supporting aging parents—can review progress, add medications, or log vitals on their behalf even when the elders are offline.
- Offline capture works during clinic visits or home check-ins; queues sync each profile's updates once connectivity returns.
- Profile selection drives the AI assistant context, ensuring chat advice and quick actions stay relevant to the chosen family member.

### Symptom Checker
- Mirrors AI suggestions inside a structured questionnaire for users who prefer forms.
- Shares logic with the chat assistant so both interfaces remain in sync.

### Vital Recording
- Tracks blood pressure, blood sugar, temperature, heart rate, weight, and SpO2.
- Entries are staged through the offline queue, tagged with timestamps, and synced to Firestore.
- History views surface the latest reading per vital type for quick reference.

### Reminders
- Create, edit, and delete medicine or appointment reminders.
- Offline queue adds a queued badge in `RemindersListScreen` and prevents duplicate edits while syncing.
- Reminder payloads feed into the notification layer to schedule local or push alerts.

### Appointments
- Book tele-consultations with doctor search and specialty filters.
- Appointment edits and cancellations honor the same queue mechanics and merge-with-remote logic as reminders.
- Meeting URLs are generated and stored with each appointment for quick join access once online.

### Medical Documents Vault
- Upload prescriptions, lab reports, and other records from camera or gallery.
- Document metadata and previews are created immediately; binary uploads retry automatically when bandwidth returns.
- `DocumentPreviewScreen` distinguishes between queued and synced files to avoid confusion.

### Settings and Language Selection
- Users can edit basic profile information, switch languages, and log out.
- English and Hindi translations live in `localization/en.js` and `localization/hi.js` and load at runtime through `LanguageContext`.
- Notification debug buttons were removed from the production UI to keep settings simple for end users.

---

## Offline-First Architecture

- Queue services (`reminderQueue.js`, `appointmentQueue.js`, and the document upload helper) wrap every create/update/delete call so writes never disappear.
- AsyncStorage persists queue entries across app restarts; NetInfo decides when the app should attempt a flush.
- Flush routines run behind a mutex-style lock to prevent double uploads when connectivity flaps.
- Screens merge queued entries with live Firestore collections to deliver optimistic UI while clearly labeling unsynced items.
- Error callbacks surface modal feedback so users know when an item needs attention after a failed flush attempt.

---

## Notifications and Follow-ups

- Reminder creation/sharing hooks connect to `notificationService.js`, which orchestrates Expo push tokens and Firebase Cloud Messaging.
- While test hooks were removed from Settings, the service layer still supports manual testing through development scripts.
- Each reminder payload carries localized copy so notifications match the current language preference.

---

## Internationalization and Accessibility

- English and Hindi cover all strings, badges, and error messages.
- The language selector writes to AsyncStorage and updates UI components immediately.
- Large touch targets, clear iconography, and optional speech playback improve accessibility for elders and low-literacy users.

---

## Technical Architecture

| Layer | Technology | Notes |
|-------|------------|-------|
| UI | React Native with Expo | Stack and tab navigators, custom components |
| State | React Context and local state | `ProfileContext` and `LanguageContext` for global state |
| Backend | Firebase Authentication, Firestore, Storage | Multi-tenant data scoped per user |
| AI | Google Gemini Generative Language API | Prompt templating with guardrails |
| Offline | AsyncStorage, NetInfo | Queue services and flush controllers |
| Notifications | Expo Notifications, Firebase Cloud Messaging | Ready for scheduled reminders |
| Voice | `expo-speech`, `expo-speech-recognition` | Speech input requires native build |

---

## Project Structure

```
AarogyaMitraApp/
├── assets/                Static images and icons
├── components/            Shared UI components (CustomModal, BottomNavBar)
├── constants/             Doctor directory, specialties, utility constants
├── context/               Language and profile providers
├── localization/          i18n resource files (en.js, hi.js)
├── screens/               Navigation destinations
│   ├── AIChatScreen.js
│   ├── HomeScreen.js
│   ├── RecordVitalsScreen.js
│   ├── RemindersListScreen.js
│   ├── AppointmentsListScreen.js
│   ├── DocumentPreviewScreen.js
│   └── ...
├── services/              Backend-facing helpers and queues
│   ├── reminderQueue.js
│   ├── appointmentQueue.js
│   ├── documentUpload.js
│   ├── notificationService.js
│   └── voiceService.js
├── hooks/                 Reusable hooks
├── App.js                 Entry point wiring contexts and navigation
├── app.json               Expo and EAS configuration
├── firebaseConfig.js      Firebase bootstrap
└── README.md              Project documentation
```

---

## Environment Setup

### Prerequisites
- Node.js 16+
- npm or yarn
- Expo CLI (available through `npx expo`)
- Git
- Firebase project (Firestore, Auth, Storage enabled)
- Google Gemini API key

### Installation Steps
1. Clone the repository
   ```bash
   git clone <repository-url>
   cd AarogyaMitraApp
   ```
2. Install dependencies
   ```bash
   npm install
   ```
   or
   ```bash
   yarn install
   ```
3. Install Expo-managed native modules
   ```bash
   npx expo install expo-speech expo-speech-recognition expo-notifications expo-image-picker
   ```
4. Configure API keys in `app.json`
   ```json
   {
     "expo": {
       "extra": {
         "geminiApiKey": "YOUR_GEMINI_KEY",
         "eas": {
           "projectId": "YOUR_EAS_PROJECT_ID"
         }
       }
     }
   }
   ```
5. Add Firebase credentials in `firebaseConfig.js`
   ```javascript
   const firebaseConfig = {
     apiKey: 'YOUR_KEY',
     authDomain: 'YOUR_DOMAIN',
     projectId: 'YOUR_PROJECT_ID',
     storageBucket: 'YOUR_BUCKET',
     messagingSenderId: 'YOUR_SENDER_ID',
     appId: 'YOUR_APP_ID'
   };
   ```

---

## Development and Testing Tips

- Start the dev server with `npm start`. Press `i` or `a` to open simulators, or scan the QR code with Expo Go.
- Test offline behavior by enabling airplane mode, creating reminders or appointments, then reconnecting to confirm queued badges disappear after sync.
- Use `npx expo start --clear` if Metro bundler caches stale assets.
- Build with EAS (`npx eas build --platform ios --profile development`) to validate native-only features like speech recognition.
- Lint and format before committing; configure ESLint/Prettier to your workflow if not already active.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| AI chat silent | Verify `geminiApiKey`, check Metro logs for API errors, confirm network connectivity |
| Firebase writes failing | Confirm `firebaseConfig.js`, review Firestore security rules, ensure device time is accurate |
| Duplicate reminders after reconnect | Upgrade to latest build; flush locks now prevent replays. Clear app data if legacy queues remain |
| Voice input unavailable | Speech recognition requires a native build; Expo Go cannot access the microphone APIs |
| Language change not sticking | Toggle language in Settings and restart if using an older cached build |

---

## Roadmap and Future Enhancements

- Video visits with real-time doctor chat
- Pharmacy and lab integrations for e-prescriptions and diagnostics
- Health analytics dashboards for longitudinal tracking
- Wearable device synchronization
- Bulk entry mode for community health workers
- Expanded language catalog beyond Hindi and English

---

AarogyaMitra is built to support families and frontline health workers wherever they are. By blending conversational guidance, fast task workflows, and resilient offline queues, the app keeps care records trustworthy even when connectivity is limited. Contributions and feedback are always welcome.
