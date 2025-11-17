import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BottomNavBar = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bottomNav, { paddingBottom: insets.bottom }]}>
      <TouchableOpacity
        style={styles.bottomNavIcon}
        onPress={() => navigation.navigate('Help')}
      >
        <MaterialCommunityIcons
          name="help-circle-outline"
          size={30}
          color="#000"
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bottomNavIcon}
        onPress={() => navigation.navigate('Home')}
      >
        <MaterialCommunityIcons name="home-outline" size={30} color="#000" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bottomNavIcon}
        onPress={() => navigation.navigate('Settings')}
      >
        <MaterialCommunityIcons
          name="account-outline"
          size={30}
          color="#000"
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  bottomNavIcon: {
    padding: 5,
  },
});

export default BottomNavBar;
