/**
 * NotificationService.js
 * Fetches today's AI security tip from the backend and schedules
 * a local notification to fire every day at 09:00.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { BASE_URL } from './api';

// ── How the notification is presented when the app is foregrounded ─────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NOTIF_ENABLED_KEY   = '@notifications_enabled';
const NOTIF_CHANNEL_ID    = 'daily-security-tips';
const SCHEDULE_HOUR       = 9;  // 9 AM
const SCHEDULE_MINUTE     = 0;

// ── Request permission ──────────────────────────────────────────────────────
export async function requestNotificationPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Create Android notification channel ────────────────────────────────────
async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
      name: '🛡️ Daily Security Tips',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a73e8',
      sound: 'default',
    });
  }
}

// ── Fetch today's AI tip from backend ──────────────────────────────────────
async function fetchDailyTip() {
  try {
    const response = await fetch(`${BASE_URL}/api/notifications/daily-tip`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    return data.tip || null;
  } catch (e) {
    console.warn('[Notifications] Could not fetch daily tip:', e.message);
    return {
      title: '🛡️ Stay Vigilant Today',
      body: 'Think before you click. Verify every link and sender before taking action.',
    };
  }
}

// ── Cancel all existing daily tip notifications ────────────────────────────
async function cancelDailyTipNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content?.data?.type === 'daily-security-tip') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ── Schedule the notification for next 9am ─────────────────────────────────
async function scheduleAt9am(title, body) {
  await ensureChannel();
  await cancelDailyTipNotifications();

  // Build the next 9:00 AM trigger
  const now   = new Date();
  const next9 = new Date();
  next9.setHours(SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);
  if (next9 <= now) {
    // Already past 9am today — schedule for tomorrow
    next9.setDate(next9.getDate() + 1);
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: { type: 'daily-security-tip' },
    },
    trigger: {
      date: next9,
      repeats: false,   // We re-schedule each day on app open
    },
  });

  console.log(`[Notifications] Tip scheduled for ${next9.toLocaleTimeString()}`);
}

// ── Main entry point — call this from App.js on startup ───────────────────
export async function initDailySecurityTip() {
  try {
    // Check user preference
    const enabled = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    if (enabled === 'false') {
      console.log('[Notifications] Disabled by user.');
      return false;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      console.log('[Notifications] Permission denied.');
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    const lastFetched = await AsyncStorage.getItem('@tip_last_fetched');

    let tip;
    if (lastFetched === today) {
      // Already fetched today — read from cache
      const cached = await AsyncStorage.getItem('@tip_cached');
      tip = cached ? JSON.parse(cached) : await fetchDailyTip();
    } else {
      tip = await fetchDailyTip();
      await AsyncStorage.setItem('@tip_cached', JSON.stringify(tip));
      await AsyncStorage.setItem('@tip_last_fetched', today);
    }

    if (tip) {
      await scheduleAt9am(tip.title, tip.body);
    }

    return true;
  } catch (e) {
    console.error('[Notifications] initDailySecurityTip failed:', e);
    return false;
  }
}

// ── Enable / disable notifications ─────────────────────────────────────────
export async function setNotificationsEnabled(enabled) {
  await AsyncStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    await initDailySecurityTip();
  } else {
    await cancelDailyTipNotifications();
  }
}

export async function getNotificationsEnabled() {
  const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
  return val !== 'false'; // default ON
}
