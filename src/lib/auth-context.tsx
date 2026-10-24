import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db, cleanFirestoreData } from './firebase';
import { UserProfile, Garage, UserRole } from '../types';
import { seedInitialData } from './db-service';

export interface PersonaOption {
  id: string;
  name: string;
  role: UserRole;
  garageId?: string;
  garageName?: string;
  email: string;
}

export const TEST_PERSONAS: PersonaOption[] = [
  {
    id: 'uid_admin_demo',
    name: 'Charan Bhogavalli (Admin)',
    role: 'admin',
    email: 'charanbhogavalli04116@gmail.com',
  },
  {
    id: 'uid_garage_1',
    name: 'Precision Motors (Garage)',
    role: 'garage',
    garageId: 'garage_precision',
    garageName: 'Precision Motors & Service Hub',
    email: 'service@precisionmotors.in',
  },
  {
    id: 'uid_garage_2',
    name: 'AutoCare Workshop (Garage)',
    role: 'garage',
    garageId: 'garage_autocare',
    garageName: 'AutoCare Garage & Workshop',
    email: 'procurement@autocareblr.com',
  },
  {
    id: 'uid_garage_3',
    name: 'Torque Point Auto (Garage)',
    role: 'garage',
    garageId: 'garage_torquepoint',
    garageName: 'Torque Point Auto Works',
    email: 'orders@torquepoint.in',
  },
];

interface AuthContextType {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  activeGarage: Garage | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  switchPersona: (personaId: string) => void;
  activePersonaId: string;
  seedDatabase: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeGarage, setActiveGarage] = useState<Garage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activePersonaId, setActivePersonaId] = useState<string>('uid_garage_1');

  // Initialize and listen to Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          // Check if admin
          const isAdminEmail = fbUser.email === 'charanbhogavalli04116@gmail.com';
          const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid));
          const isAdmin = isAdminEmail || adminDoc.exists();

          const userDocRef = doc(db, 'users', fbUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          let profile: UserProfile;

          if (userDocSnap.exists()) {
            profile = userDocSnap.data() as UserProfile;
            if (isAdmin && profile.role !== 'admin') {
              profile.role = 'admin';
              await setDoc(userDocRef, cleanFirestoreData(profile), { merge: true });
            }
          } else {
            const newProfilePayload: Record<string, any> = {
              uid: fbUser.uid,
              name: fbUser.displayName || 'Authorized User',
              email: fbUser.email || '',
              role: isAdmin ? 'admin' : 'garage',
              createdAt: new Date().toISOString(),
            };
            if (!isAdmin) {
              newProfilePayload.garageId = 'garage_precision';
            }
            await setDoc(userDocRef, cleanFirestoreData(newProfilePayload));
            profile = newProfilePayload as UserProfile;
          }

          setCurrentUser(profile);

          if (profile.garageId) {
            const garSnap = await getDoc(doc(db, 'garages', profile.garageId));
            if (garSnap.exists()) {
              setActiveGarage(garSnap.data() as Garage);
            }
          }
        } catch (err) {
          console.error('Failed to sync auth user profile:', err);
        }
      } else {
        // Fallback to active dev persona for seamless local simulation and evaluation
        applyPersona(activePersonaId);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const applyPersona = async (personaId: string) => {
    const persona = TEST_PERSONAS.find((p) => p.id === personaId) || TEST_PERSONAS[1];
    setActivePersonaId(persona.id);

    const profile: UserProfile = {
      uid: persona.id,
      name: persona.name,
      email: persona.email,
      role: persona.role,
      garageId: persona.garageId,
      createdAt: new Date().toISOString(),
    };
    setCurrentUser(profile);

    if (persona.garageId) {
      try {
        const garSnap = await getDoc(doc(db, 'garages', persona.garageId));
        if (garSnap.exists()) {
          setActiveGarage(garSnap.data() as Garage);
        } else {
          setActiveGarage({
            id: persona.garageId,
            name: persona.garageName || 'Registered Garage',
            ownerUid: persona.id,
            phone: '+91 98450 11223',
            address: '100ft Road, Indiranagar',
            city: 'Bengaluru',
            status: 'active',
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        // Fallback local garage
        setActiveGarage({
          id: persona.garageId,
          name: persona.garageName || 'Registered Garage',
          ownerUid: persona.id,
          phone: '+91 98450 11223',
          address: '100ft Road, Indiranagar',
          city: 'Bengaluru',
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      setActiveGarage(null);
    }
  };

  const switchPersona = (personaId: string) => {
    applyPersona(personaId);
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google sign-in error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      if (firebaseUser) {
        await fbSignOut(auth);
      }
      applyPersona('uid_garage_1');
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const seedDatabase = async () => {
    await seedInitialData(currentUser?.email, currentUser?.uid);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        activeGarage,
        loading,
        isAdmin: currentUser?.role === 'admin',
        signInWithGoogle,
        signOut,
        switchPersona,
        activePersonaId,
        seedDatabase,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
