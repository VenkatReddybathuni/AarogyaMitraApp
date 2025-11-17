import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import the screens for this flow
import ProfilesListScreen from './ProfilesListScreen';
import AddFamilyMemberScreen from './AddFamilyMemberScreen';

const FamilyStack = createNativeStackNavigator();

// This component is a nested navigator for the Family Profiles flow
// It replaces the old placeholder
const FamilyProfilesFlow = () => {
  return (
    <FamilyStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="ProfilesList"
    >
      <FamilyStack.Screen
        name="ProfilesList"
        component={ProfilesListScreen}
      />
      <FamilyStack.Screen
        name="AddFamilyMember"
        component={AddFamilyMemberScreen}
      />
    </FamilyStack.Navigator>
  );
};

export default FamilyProfilesFlow;