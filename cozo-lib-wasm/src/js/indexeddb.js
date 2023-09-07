let db = null;
let cozoDbStore = null;

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function openDatabase(dbName, storeName) {
  cozoDbStore = storeName;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };

    // return requestToPromise(request).then((db_) => {
    //   db = event.target.result;
    //   resolve(db);
    // });
    request.onsuccess = function (event) {
      db = event.target.result;
      resolve(db);
    };
    request.onerror = function (event) {
      reject(event.error);
    };
  });
}

export async function readStore() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(cozoDbStore, "readonly");
    const store = transaction.objectStore(cozoDbStore);

    const itemsPromise = requestToPromise(store.getAll());
    const keysPromise = requestToPromise(store.getAllKeys());

    Promise.all([keysPromise, itemsPromise])
      .then((results) => {
        const keys = results[0].map((item) => new Uint8Array(item));
        const items = results[1];
        resolve([keys, items]);
      })
      .catch(reject);
  });
}

export async function loadAllFromIndexedDb(dbName, storeName) {
  await openDatabase(dbName, storeName);
  return await readStore();
}

export async function saveToIndexedDb(key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(cozoDbStore, "readwrite");
    const store = transaction.objectStore(cozoDbStore);

    if (!value) {
      store.delete(key);
    } else {
      store.put(value, key);
    }

    requestToPromise(value ? store.put(value, key) : store.delete(key));

    transaction.oncomplete = function () {
      resolve();
    };
    transaction.onerror = function (event) {
      reject(event.error);
    };
  });
}
