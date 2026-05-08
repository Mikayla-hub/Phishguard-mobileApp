import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem('@theme_mode');
        if (storedTheme !== null) setIsDarkMode(storedTheme === 'dark');
      } catch (error) {
        console.error('Failed to load theme:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    try {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      await AsyncStorage.setItem('@theme_mode', newMode ? 'dark' : 'light');
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const colors = {
    background: isDarkMode ? '#111827' : '#f5f7fa',
    card: isDarkMode ? '#1f2937' : '#ffffff',
    surface: isDarkMode ? '#1f2937' : '#ffffff',
    text: isDarkMode ? '#f8fafc' : '#1a1a1a',   // near-black for max readability
    subtext: isDarkMode ? '#cbd5e1' : '#444444',   // dark grey, not washed-out
    muted: isDarkMode ? '#94a3b8' : '#666666',   // for hints/placeholders
    primary: isDarkMode ? '#3b82f6' : '#1a73e8',
    border: isDarkMode ? '#374151' : '#e0e0e0',
  };

  // ── Global typography scale ──────────────────────────────────────────────
  // Import this in any screen via const { typography } = useTheme()
  const typography = {
    h1: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
    h2: { fontSize: 20, fontWeight: '800', color: colors.text },
    h3: { fontSize: 17, fontWeight: '700', color: colors.text },
    h4: { fontSize: 15, fontWeight: '700', color: colors.text },
    body: { fontSize: 14, fontWeight: '600', color: colors.subtext, lineHeight: 22 },
    small: { fontSize: 12, fontWeight: '600', color: colors.muted, lineHeight: 18 },
    label: { fontSize: 13, fontWeight: '700', color: colors.text },
    chip: { fontSize: 11, fontWeight: '700', color: colors.muted },
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, colors, typography, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
