import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load the stored theme preference when the app starts
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem('@theme_mode');
        if (storedTheme !== null) {
          setIsDarkMode(storedTheme === 'dark');
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, []);

  // Toggle and save the preference
  const toggleTheme = async () => {
    try {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      await AsyncStorage.setItem('@theme_mode', newMode ? 'dark' : 'light');
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  // Generic color palettes mapped to dark/light state
  const colors = {
    background: isDarkMode ? '#111827' : '#f5f7fa',
    surface: isDarkMode ? '#1f2937' : '#ffffff',
    text: isDarkMode ? '#f8fafc' : '#333333',
    subtext: isDarkMode ? '#9ca3af' : '#666666',
    primary: isDarkMode ? '#3b82f6' : '#1a73e8',
    border: isDarkMode ? '#374151' : '#e0e0e0',
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, colors, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
