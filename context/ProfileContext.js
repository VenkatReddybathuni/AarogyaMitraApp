import React, { createContext, useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';

export const ProfileContext = createContext();

export const ProfileProvider = ({ children }) => {
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [activeProfileName, setActiveProfileName] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      try {
        setUser(currentUser);
        if (currentUser) {
          // Default to own profile (user's own UID)
          setActiveProfileId(currentUser.uid);
          setActiveProfileName('');
        } else {
          setActiveProfileId(null);
          setActiveProfileName(null);
        }
      } catch (error) {
        console.error('Error in onAuthStateChanged:', error);
        setUser(currentUser || null);
      } finally {
        setLoading(false);
      }
    });
    
    return unsubscribe;
  }, []);

  const switchProfile = (profileId, profileName) => {
    setActiveProfileId(profileId);
    setActiveProfileName(profileName);
  };

  const clearPhoneSession = async () => {
    // Placeholder for compatibility - no longer needed
    return Promise.resolve();
  };

  // effectiveProfileId is used for queries - it's either switched profile or own profile
  const effectiveProfileId = activeProfileId || user?.uid || null;

  const value = {
    activeProfileId,
    activeProfileName,
    user,
    switchProfile,
    clearPhoneSession,
    effectiveProfileId,
    isOwnProfile: effectiveProfileId === user?.uid,
    loading,
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
};
