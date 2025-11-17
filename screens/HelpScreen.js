import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import the screens for this flow
import HelpCenterScreen from './HelpCenterScreen';
import AISupportScreen from './AISupportScreen';

const HelpStack = createNativeStackNavigator();

// This component is a nested navigator for the Help & Support flow
// It replaces the old placeholder
const HelpFlow = () => {
  return (
    <HelpStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="HelpCenter"
    >
      <HelpStack.Screen name="HelpCenter" component={HelpCenterScreen} />
      <HelpStack.Screen name="AISupport" component={AISupportScreen} />
    </HelpStack.Navigator>
  );
};

export default HelpFlow;