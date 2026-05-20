import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (this.firebaseInitialized) return;

    try {
      if (admin.apps.length === 0) {
        const serviceAccount = {
          type: process.env.FIREBASE_TYPE,
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/
/g, '
'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: process.env.FIREBASE_AUTH_URI,
          token_uri: process.env.FIREBASE_TOKEN_URI,
          auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
          client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
          universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as any),
        });
        this.logger.log('✅ Firebase Admin SDK initialized');
      }
      this.firebaseInitialized = true;
    } catch (error) {
      this.logger.error('❌ Failed to initialize Firebase Admin SDK:', error);
      throw error;
    }
  }

  async sendPushNotification(fcmToken: string, title: string, body: string, data?: any) {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: { title, body },
        data: data || {},
      };
      await admin.messaging().send(message);
      this.logger.log(`✅ Push notification sent to ${fcmToken}`);
    } catch (error) {
      this.logger.error('❌ Error sending push notification:', error);
      throw error;
    }
  }
}
