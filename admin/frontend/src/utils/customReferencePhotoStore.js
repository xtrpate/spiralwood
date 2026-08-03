const DB_NAME = "wisdom_custom_reference_photos";
const DB_VERSION = 1;
const STORE_NAME = "reference_photo_sets";

const openDatabase = () =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "cart_key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Failed to open photo storage."));
  });

const runWriteTransaction = async (operation) => {
  const db = await openDatabase();

  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      try {
        operation(store);
      } catch (error) {
        reject(error);
        return;
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Reference photo storage failed."));
      tx.onabort = () =>
        reject(tx.error || new Error("Reference photo storage was aborted."));
    });
  } finally {
    db.close();
  }
};

const dataUrlToBlob = (dataUrl) => {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("A selected reference photo is invalid.");
  }

  const mimeType = String(match[1] || "").toLowerCase();
  const binary = window.atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

export const saveCustomReferencePhotos = async (cartKey, photos = []) => {
  const cleanKey = String(cartKey || "").trim();
  if (!cleanKey) throw new Error("Missing custom cart key.");

  const normalized = (Array.isArray(photos) ? photos : []).map((photo) => {
    const blob =
      photo?.blob instanceof Blob
        ? photo.blob
        : dataUrlToBlob(photo?.data_url || photo?.dataUrl);

    return {
      id:
        String(photo?.id || "").trim() ||
        `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      name:
        String(photo?.name || "reference-photo").trim() || "reference-photo",
      type: String(photo?.type || blob.type || "").trim().toLowerCase(),
      size: Number(photo?.size || blob.size || 0) || blob.size,
      blob,
    };
  });

  if (!normalized.length) {
    await deleteCustomReferencePhotos([cleanKey]);
    return [];
  }

  await runWriteTransaction((store) => {
    store.put({
      cart_key: cleanKey,
      photos: normalized,
      updated_at: Date.now(),
    });
  });

  return normalized.map(({ blob, ...metadata }) => metadata);
};

export const getCustomReferencePhotos = async (cartKey) => {
  const cleanKey = String(cartKey || "").trim();
  if (!cleanKey) return [];

  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(cleanKey);

      request.onsuccess = () => {
        resolve(
          Array.isArray(request.result?.photos) ? request.result.photos : [],
        );
      };
      request.onerror = () =>
        reject(request.error || new Error("Failed to load reference photos."));
    });
  } finally {
    db.close();
  }
};

export const deleteCustomReferencePhotos = async (cartKeys = []) => {
  const keys = (Array.isArray(cartKeys) ? cartKeys : [cartKeys])
    .map((key) => String(key || "").trim())
    .filter(Boolean);

  if (!keys.length) return;

  await runWriteTransaction((store) => {
    keys.forEach((key) => store.delete(key));
  });
};
