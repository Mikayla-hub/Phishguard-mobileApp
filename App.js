import { StyleSheet } from 'react-native';
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';


// screens imports

import WelcomeScreen from "./myscreens/WelcomeScreen";
import LoginScreen from "./myscreens/LoginScreen";
import SignUpScreen from "./myscreens/SignupScreen";
import Homescreen from "./myscreens/Homescreen";
import PhishingAnalyzerScreen from "./myscreens/PhishingAnalyzerScreen";
import ReportPhishingScreen from "./myscreens/ReportPhishingScreen";
import IncidentResponseScreen from "./myscreens/IncidentResponseScreen";
import LearningModuleScreen from "./myscreens/LearningModuleScreen";
import SettingsScreen from "./myscreens/SettingsScreen";
import ForgotPasswordScreen from "./myscreens/ForgotPasswordScreen";
import ResetPasswordScreen from "./myscreens/ResetPasswordScreen";
import { ThemeProvider } from "./contexts/ThemeContext";

const Stack = createNativeStackNavigator();



export default function App() {
  return (
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="WelcomeScreen"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />
          <Stack.Screen name="LoginScreen" component={LoginScreen} />
          <Stack.Screen name="SignUpScreen" component={SignUpScreen} />
          <Stack.Screen name="Homescreen" component={Homescreen} />
          <Stack.Screen
            name="PhishingAnalyzerScreen"
            component={PhishingAnalyzerScreen}
          />
          <Stack.Screen
            name="ReportPhishingScreen"
            component={ReportPhishingScreen}
          />
          <Stack.Screen
            name="IncidentResponseScreen"
            component={IncidentResponseScreen}
          />
          <Stack.Screen
            name="LearningModuleScreen"
            component={LearningModuleScreen}
          />
          <Stack.Screen
            name="SettingsScreen"
            component={SettingsScreen}
          />
          <Stack.Screen
            name="ForgotPasswordScreen"
            component={ForgotPasswordScreen}
          />
          <Stack.Screen
            name="ResetPasswordScreen"
            component={ResetPasswordScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
