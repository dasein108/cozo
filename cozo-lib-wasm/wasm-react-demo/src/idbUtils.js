import { openDB } from "idb";
import { toString as uint8ArrayToAsciiString } from "uint8arrays/to-string";

const dbName = "cozo-idb";
const storeName = "cyb-cozo";
let db = null;
let isInitialized = true;
const decoder = new TextDecoder("utf-8");

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
      key: decoder.decode(key),
      value: decoder.decode(items[index]),
      items: items[index],
    };
  });
  console.log("----getAllItems----", keys, items, dbg);

  return [keys, items];
}
const uint8arrayToNumber = (arr) => arr.reduce((acc, v) => (acc << 8) + v, 0);

export async function setItem(key, value) {
  const tx = db.transaction(storeName, "readwrite");
  const prefix = key.slice(0, 9);
  const postfix = key.slice(-2);
  const k_fix = key.slice(9, -2);

  if (
    key.length === 9 &&
    key[key.length - 1] === 1 &&
    uint8arrayToNumber(key) === 1
  ) {
    const store = tx.objectStore(storeName);
    const currentVersion = await store.get(key);
    if (currentVersion) {
      const currentVersionNum = uint8arrayToNumber(currentVersion);
      const newVersionNum = uint8arrayToNumber(value);

      value = currentVersionNum > newVersionNum ? currentVersion : value;
      console.log(
        "---xxx-mutate value!!!!",
        currentVersionNum,
        newVersionNum,
        value
      );
      // if (currentVersionNum > newVersionNum) {
      //   console.log(
      //     "---xxx-BLOCK VERSION CHANGE!!!!",
      //     currentVersionNum,
      //     newVersionNum
      //   );
      //   return;
      // } else {
      //   console.log(`---xxx-Change version to ${newVersionNum}`);
      // }
    }
  }

  // if key == new Uint8Array()
  if (!value) {
    const store = tx.objectStore(storeName);

    const res = store.delete(key);
    console.log(
      `deleteItem prefix: ${prefix.toString()} postfix: ${postfix.toString()} `,
      "key:",
      uint8ArrayToAsciiString(k_fix),
      "raw",
      key,
      res
    );
  } else {
    console.log(
      `setItem prefix: ${prefix.toString()} postfix: ${postfix.toString()} `,
      "key:",
      uint8ArrayToAsciiString(k_fix),
      "val:",
      uint8ArrayToAsciiString(value),
      "raw",
      key,
      value
    );

    tx.store.put(value, key);
  }
  const result = await tx.done;

  return result;
}
