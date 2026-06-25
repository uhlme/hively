// offlineAI.js - IndexedDB wrapper to store offline voice memos & receipt images

const DB_NAME = 'hively_offline_ai_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_memos';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Convert Blob/File to Base64 String for reliable IndexedDB storage
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Save voice/receipt offline memo
export async function saveOfflineMemo(type, mediaBase64, mediaType, additionalData = {}) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const memo = {
      id: 'memo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type, // 'voice' | 'receipt'
      mediaData: mediaBase64,
      mediaType,
      additionalData,
      timestamp: Date.now()
    };
    
    const request = store.add(memo);
    request.onsuccess = () => {
      console.log(`[Offline AI] Saved ${type} memo successfully to IndexedDB.`);
      resolve(memo);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

// Get all offline memos
export async function getOfflineMemos() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Delete offline memo
export async function deleteOfflineMemo(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => {
      console.log(`[Offline AI] Deleted memo ${id} from IndexedDB.`);
      resolve(true);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}
