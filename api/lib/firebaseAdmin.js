import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_DATABASE_ID = '(default)';
const APP_NAME = 'hsc-portal-server';

function readServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be configured for the shared paper metadata cache.');
  }

  try {
    const serviceAccount = JSON.parse(raw);
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('The service-account JSON is missing required fields.');
    }
    return serviceAccount;
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${error.message}`);
  }
}

export function getFirebaseAdminApp() {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  return initializeApp({ credential: cert(readServiceAccount()) }, APP_NAME);
}

export function getAdminFirestore() {
  const databaseId = String(process.env.FIREBASE_FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID).trim();
  return getFirestore(getFirebaseAdminApp(), databaseId);
}

export function getAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export async function requireAuthenticatedUser(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Sign in is required to analyse a new paper.');

  try {
    return await getAdminAuth().verifyIdToken(match[1]);
  } catch (error) {
    throw new Error('Your sign-in session could not be verified. Please sign in again.');
  }
}
