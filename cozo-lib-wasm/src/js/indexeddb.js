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

let writeCounter = 0; // TODO: use a queue instead of a counter

// Hack, should be called to wait for pending writes before add new ones
export async function waitForPendingWrites(timeoutDuration = 60000) {
  const waitPromise = new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      console.log("Transaction wait", writeCounter);
      if (writeCounter < 1) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("waitForPendingWrites timed out!"));
    }, timeoutDuration);
  });

  return Promise.race([waitPromise, timeoutPromise]);
}

export async function writeToIndexedDb(key, value) {
  //   console.log("saveToIndexedDb", key, value);

  return new Promise((resolve, reject) => {
    writeCounter++;
    // console.log("Transaction started", writeCounter);
    const transaction = db.transaction(cozoDbStore, "readwrite");
    const store = transaction.objectStore(cozoDbStore);
    if (!value) {
      store.delete(key);
    } else {
      store.put(value, key);
    }

    requestToPromise(value ? store.put(value, key) : store.delete(key));

    transaction.oncomplete = function () {
      writeCounter--;
      resolve();
    };
    transaction.onerror = function (event) {
      writeCounter--;
      console.log("Transaction err", writeCounter);
      reject(event.error);
    };
  });
}
