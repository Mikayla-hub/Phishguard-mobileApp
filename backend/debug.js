const admin = require('firebase-admin');
const serviceAccount = require('./config/firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://phishguard-c93a8-default-rtdb.europe-west1.firebasedatabase.app/'
});
admin.database().ref('learning_modules').orderByChild('createdAt').limitToLast(1).once('value', s => {
  s.forEach(c => console.log(JSON.stringify(c.val(), null, 2)));
  process.exit(0);
});
