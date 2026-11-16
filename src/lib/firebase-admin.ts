import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

let cachedAuthPromise: Promise<import('firebase-admin/auth').Auth> | null = null;

async function getFirebaseAdminAuth() {
  if (!cachedAuthPromise) {
    cachedAuthPromise = (async () => {
      const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
      ]);
      if (!getApps().length) {
        initializeApp({
          projectId: firebaseConfig.projectId,
        });
      }
      return getAuth();
    })().catch((err) => {
      cachedAuthPromise = null;
      throw err;
    });
  }
  return cachedAuthPromise;
}

export async function verifyFirebaseIdToken(token: string) {
  const auth = await getFirebaseAdminAuth();
  return auth.verifyIdToken(token);
}
