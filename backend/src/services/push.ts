import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from '../utils/logger';
import { DeviceToken } from '../models/DeviceToken';

let firebaseApp: ReturnType<typeof initializeApp> | null = null;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;

  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }

  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccount) {
      logger.warn('FIREBASE_SERVICE_ACCOUNT no configurada — push notifications deshabilitadas');
      return null;
    }

    const serviceAccountParsed = JSON.parse(serviceAccount);
    firebaseApp = initializeApp({
      credential: cert(serviceAccountParsed),
    });

    logger.info('Firebase Admin inicializado correctamente');
    return firebaseApp;
  } catch (error) {
    logger.error('Error inicializando Firebase:', error);
    return null;
  }
}

export async function sendPushToToken(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) return false;

  try {
    const messaging = getMessaging(app);
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'lucero-trp',
          priority: 'max',
        },
      },
    });
    return true;
  } catch (error: any) {
    if (error.code === 'messaging/registration-token-not-registered') {
      logger.warn(`Token FCM inválido, removiendo: ${fcmToken.substring(0, 20)}...`);
      await DeviceToken.findOneAndDelete({ fcmToken });
    } else {
      logger.error('Error enviando push notification:', error);
    }
    return false;
  }
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  const tokens = await DeviceToken.find({ userId, active: true }).select('fcmToken');
  if (tokens.length === 0) return 0;

  let sent = 0;
  for (const doc of tokens) {
    const ok = await sendPushToToken(doc.fcmToken, title, body, data);
    if (ok) sent++;
  }
  return sent;
}

export async function sendPushToDriver(
  driverUserId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  return sendPushToUser(driverUserId, title, body, data);
}
