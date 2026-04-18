const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Handle Signup
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const database = db.getDb();
    
    // Check if user already exists in Firebase Realtime Database
    const usersRef = database.ref('users');
    const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
    if (snapshot.exists()) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const userId = uuidv4();
    const newUser = {
      id: userId,
      name,
      email,
      password, // In a production app, use bcrypt to hash this!
      role: 'user',
      createdAt: new Date().toISOString()
    };

    // Save to Firebase Realtime Database
    await usersRef.child(userId).set(newUser);

    const token = jwt.sign({ id: userId, email, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ message: 'User created', token, user: { id: userId, name, email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Handle Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const database = db.getDb();

    // Fetch user from Firebase Realtime Database
    const usersRef = database.ref('users');
    const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

    if (!snapshot.exists()) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const usersData = snapshot.val();
    const userId = Object.keys(usersData)[0];
    const user = usersData[userId];

    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
