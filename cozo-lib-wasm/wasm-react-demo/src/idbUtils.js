import { openDB } from "idb";
import { toString as uint8ArrayToAsciiString } from "uint8arrays/to-string";

const dbName = "cozo-idb";
const storeName = "cozodoy";
let db = null;

export async function openDatabase() {
  console.log("----Open Database----");
  try {
    db = await openDB(dbName, 1, {
      upgrade(db) {
        console.log("---- Database create store----", db);

        db.createObjectStore(storeName);
      },
    });
    console.log("---- Database----", db);
    return db;
  } catch (error) {
    console.log("Error opening database", error);
    // return null;
  }
}

openDatabase().then((db1) => {
  db = db1;
});

export async function getAllItems() {
  const items = await db.getAll(storeName);
  const keys = (await db.getAllKeys(storeName)).map(
    (item) => new Uint8Array(item)
  );
  const dbg = keys.map((key, index) => {
    return {
      key: uint8ArrayToAsciiString(key),
      value: uint8ArrayToAsciiString(items[index]),
    };
  });
  console.log("----getAllItems----", keys, items, dbg);

  return [keys, items];
}

export async function setItemsBatch(items) {
  console.log("----setItemsBatch----", items, db);
  //   const tx = db.transaction(storeName, "readwrite");
  //   items.forEach(([key, value]) => {
  //     tx.store.put(value, key);
  //   });
  //   await tx.done;
}

export async function setItem(key, value) {
  const tx = db.transaction(storeName, "readwrite");
  tx.store.put(value, key);
  const result = await tx.done;
  console.log(
    "----setItem----key",
    uint8ArrayToAsciiString(key),
    "--val--",
    uint8ArrayToAsciiString(value),
    result
  );
}
