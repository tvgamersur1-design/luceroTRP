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
  if (!app) {
    logger.warn('[Push] Firebase app no inicializada — skip push');
    return false;
  }

  try {
    const messaging = getMessaging(app);
    const result = await messaging.send({
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
    logger.info(`[Push] Enviado OK a token ${fcmToken.substring(0, 20)}... msgId=${result}`);
    return true;
  } catch (error: any) {
    if (error.code === 'messaging/registration-token-not-registered') {
      logger.warn(`[Push] Token FCM inválido, removiendo: ${fcmToken.substring(0, 20)}...`);
      await DeviceToken.findOneAndDelete({ fcmToken });
    } else {
      logger.error('[Push] Error enviando push notification:', error.message || error);
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
  logger.info(`[Push] Buscando tokens para userId=${userId}`);
  const tokens = await DeviceToken.find({ userId, active: true }).select('fcmToken');
  logger.info(`[Push] Encontrados ${tokens.length} tokens activos para userId=${userId}`);

  if (tokens.length === 0) {
    logger.warn(`[Push] NO hay tokens registrados para userId=${userId} — push no enviado`);
    return 0;
  }

  let sent = 0;
  for (const doc of tokens) {
    const ok = await sendPushToToken(doc.fcmToken, title, body, data);
    if (ok) sent++;
  }
  logger.info(`[Push] Enviados ${sent}/${tokens.length} pushes para userId=${userId}`);
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
