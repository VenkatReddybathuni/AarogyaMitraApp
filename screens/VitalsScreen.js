import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import the screens for this flow
import RecordVitalsScreen from './RecordVitalsScreen';
import VitalsSelectScreen from './VitalsSelectScreen';
import VitalsInputScreen from './VitalsInputScreen';
import VitalsConfirmScreen from './VitalsConfirmScreen';
import VitalsHistoryScreen from './VitalsHistoryScreen';

const VitalsStack = createNativeStackNavigator();

// This component is a nested navigator for the Vitals flow
// It now uses RecordVitalsScreen as the main entry point
const VitalsFlow = () => {
  return (
    <VitalsStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="RecordVitals"
    >
      <VitalsStack.Screen
        name="RecordVitals"
        component={RecordVitalsScreen}
      />
      <VitalsStack.Screen
        name="VitalsSelect"
        component={VitalsSelectScreen}
      />
      <VitalsStack.Screen
        name="VitalsInput"
        component={VitalsInputScreen}
      />
      <VitalsStack.Screen
        name="VitalsConfirm"
        component={VitalsConfirmScreen}
      />
      <VitalsStack.Screen
        name="VitalsHistory"
        component={VitalsHistoryScreen}
      />
    </VitalsStack.Navigator>
  );
};

export default VitalsFlow;