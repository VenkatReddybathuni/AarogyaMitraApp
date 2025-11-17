import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import the screens for this flow
import AppointmentsListScreen from './AppointmentsListScreen';
import BookAppointmentScreen from './BookAppointmentScreen';
import BookingConfirmedScreen from './BookingConfirmedScreen';

const ApptStack = createNativeStackNavigator();

// This component is a nested navigator for the Appointments flow
// It replaces the old placeholder
const AppointmentsFlow = () => {
  return (
    <ApptStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="AppointmentsList"
    >
      <ApptStack.Screen
        name="AppointmentsList"
        component={AppointmentsListScreen}
      />
      <ApptStack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
      />
      <ApptStack.Screen
        name="BookingConfirmed"
        component={BookingConfirmedScreen}
      />
    </ApptStack.Navigator>
  );
};

export default AppointmentsFlow;