import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import the screens for this flow
import DocumentsListScreen from './DocumentsListScreen';
import DocumentUploadOptionsScreen from './DocumentUploadOptionsScreen';
import DocumentPreviewScreen from './DocumentPreviewScreen';

const DocumentsStack = createNativeStackNavigator();

// This component is a nested navigator for the Documents flow
// It replaces the old placeholder
// Accepts optional 'fromChat' route parameter to track if user came from chat
const DocumentsFlow = ({ route }) => {
  // Check if we came from chat via route params
  const fromChat = route?.params?.fromChat ?? false;
  const initialRouteName = fromChat ? 'DocumentUploadOptions' : 'DocumentsList';

  return (
    <DocumentsStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName={initialRouteName}
    >
      <DocumentsStack.Screen
        name="DocumentsList"
        component={DocumentsListScreen}
        initialParams={{ fromChat }}
      />
      <DocumentsStack.Screen
        name="DocumentUploadOptions"
        component={DocumentUploadOptionsScreen}
        initialParams={{ fromChat }}
      />
      <DocumentsStack.Screen
        name="DocumentPreview"
        component={DocumentPreviewScreen}
        initialParams={{ fromChat }}
      />
    </DocumentsStack.Navigator>
  );
};

export default DocumentsFlow;