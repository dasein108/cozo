import { expose } from "comlink";
import dbService from "./cozoDb";

const PENDING_WRITES_TIMEOUT_DEFAULT = 60000;

const api = {
  writesCount: 0,

  // Promise should be awaited to prevent long pool of pending IndexedDB writes
  async flushPendingWrites(timeoutDuration = PENDING_WRITES_TIMEOUT_DEFAULT) {
    const waitPromise = new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.writesCount < 1) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("flushPendingWrites timed out!"));
      }, timeoutDuration);
    });

    return Promise.race([waitPromise, timeoutPromise]);
  },

  async init() {
    // callback to sync writes count between main and worker threads
    const onWriteCallback = (writesCount) => {
      this.writesCount = writesCount;
      postMessage({
        type: "writesCountUpdate",
        value: writesCount,
      });
    };

    await dbService.init(onWriteCallback);
  },

  async runCommand(command) {
    return dbService.runCommand(command);
  },

  async executePutCommand(tableName, array) {
    return dbService.executePutCommand(tableName, array);
  },

  async executeBatchPutCommand(tableName, array, batchSize, onProgress) {
    const { getCommandFactory, runCommand } = dbService;
    const commandFactory = getCommandFactory();
    const putCommand = commandFactory.generatePutCommand(tableName);
    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      const atomCommand = commandFactory.generateAtomCommand(tableName, batch);
      await runCommand([atomCommand, putCommand].join("\r\n"));

      onProgress && onProgress(i + batch.length);
    }
  },

  async executeGetCommand(tableName, conditionArr, keys) {
    return dbService.executeGetCommand(tableName, conditionArr, keys);
  },
};

// Expose the API to the main thread
expose(api);
