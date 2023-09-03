import { openDB } from "idb";
import { toString as uint8ArrayToAsciiString } from "uint8arrays/to-string";

const dbName = "cozo-idb";
const storeName = "cozodoy";
let db = null;

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

export async function setItem(key, value) {
  const tx = db.transaction(storeName, "readwrite");
  // console.log(
  //   "----setItem key:\r\n",
  //   uint8ArrayToAsciiString(key),
  //   "\r\nval:",
  //   uint8ArrayToAsciiString(value),
  //   "\r\nraw key:",
  //   key,
  //   "\r\nraw val:",
  //   value
  // );
  tx.store.put(value, key);
  const result = await tx.done;

  return result;
}
