import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { fallbackDoctors } from '../constants/doctorDirectory';

const mapDoctorsById = (doctors = []) => {
  return doctors.reduce((acc, doctor) => {
    if (!doctor?.id) {
      return acc;
    }

    // Prefer Firestore entries over fallback doctors when ids clash
    if (!acc[doctor.id] || doctor.source === 'firestore') {
      acc[doctor.id] = doctor;
    }
    return acc;
  }, {});
};

const useDoctorDirectory = () => {
  const [doctorMap, setDoctorMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchDoctors = async () => {
      try {
        const doctorsRef = collection(db, 'doctors');
        const snapshot = await getDocs(doctorsRef);
        if (!isMounted) {
          return;
        }

        const remoteDoctors = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          source: 'firestore',
        }));

        const map = mapDoctorsById([...remoteDoctors, ...fallbackDoctors]);
        setDoctorMap(map);
      } catch (error) {
        console.error('Failed to load doctor directory:', error);
        if (isMounted) {
          setDoctorMap(mapDoctorsById(fallbackDoctors));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDoctors();

    return () => {
      isMounted = false;
    };
  }, []);

  return { doctorMap, isLoading };
};

export const getDoctorFromDirectory = (doctorMap, doctorId) => {
  if (!doctorId) {
    return null;
  }
  return doctorMap[doctorId] || null;
};

export const mapDoctorListToDirectory = mapDoctorsById;

export default useDoctorDirectory;
