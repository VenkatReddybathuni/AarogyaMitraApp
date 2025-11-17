import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import the screens for this flow
import RemindersListScreen from './RemindersListScreen';
import AddReminderScreen from './AddReminderScreen';

const RemindersStack = createNativeStackNavigator();

// This component is a nested navigator for the Reminders flow
// It replaces the old placeholder
const RemindersFlow = () => {
  return (
    <RemindersStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="RemindersList"
    >
      <RemindersStack.Screen
        name="RemindersList"
        component={RemindersListScreen}
      />
      <RemindersStack.Screen
        name="AddReminder"
        component={AddReminderScreen}
      />
    </RemindersStack.Navigator>
  );
};

export default RemindersFlow;