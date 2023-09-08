import { create } from "kubo-rpc-client";
import { fileTypeFromBuffer } from "file-type";
import { toString as uint8ArrayToAsciiString } from "uint8arrays/to-string";
//     urlOpts: '/ip4/127.0.0.1/tcp/5001',

const node = create("/ip4/127.0.0.1/tcp/5001");

export const PinTypeEnum = {
  indirect: -1,
  direct: 0,
  recursive: 1,
};

export const getMimeFromUint8Array = async (raw) => {
  if (!raw) {
    return undefined;
  }
  const fileType = await fileTypeFromBuffer(raw);
  const items = fileType?.mime.split(" ");
  if (items && items.length > 1) {
    console.log("----getMimeFromUint8Array----", items);
  }

  return fileType?.mime.split(" ")[0] || "text/plain";
};

export const testCID = async (cid) => {
  const path = `/ipfs/${cid}`;
  //   const pinInfo = await node.pin.cat(path, {})
  const info = await node.files.stat(path, {
    withLocal: true,
    size: true,
  });

  const { value: firstChunk } = await node
    .cat(path, { length: 2048, offset: 0 })
    [Symbol.asyncIterator]()
    .next();

  const mime = await getMimeFromUint8Array(firstChunk);
  const text =
    mime.indexOf("text/plain") !== -1
      ? uint8ArrayToAsciiString(firstChunk)
      : "";

  console.log("----testCID----", info, mime, text);
};

export const listPins = async () => {
  const pinsIterable = node.pin.ls();

  // return pins.map((pin) => {
  const result = [];
  let count = 0;

  for await (const pin of pinsIterable) {
    count++;
    if (count % 100 === 0) {
      console.log("pin ls", count);
    }
    // if (count > 10) {
    //   break;
    // }
    // console.log("----PIN1", pin);
    const { cid, type } = pin;
    result.push({ cid: cid.toString(), type: PinTypeEnum[type] });
  }
  return result;
};

export const listFiles = async () => {
  const pinsIterable = node.pin.ls({ type: "recursive" });

  // return pins.map((pin) => {
  const result = [];
  let count = 0;

  for await (const pin of pinsIterable) {
    count++;
    if (count % 100 === 0) {
      console.log("pin ls", count);
    }
    const { cid } = pin;
    result.push(fileStat(cid.toString()));
  }

  return result;

  // await node.files.stat(path, {
  //     signal,
  //     withLocal: true,
  //     size: true,
  //   });
};

export const addMimeAndText = async (path, info) => {
  const { cid, type, size, local, blocks, sizeLocal } = info;

  let text = "";
  let mime = "";
  if (type !== "directory") {
    const { value: firstChunk } = await node
      .cat(path, { length: 512, offset: 0 })
      [Symbol.asyncIterator]()
      .next();

    console.log("----fileStat----", firstChunk, info);

    mime = await getMimeFromUint8Array(firstChunk);
    if (!mime) {
      mime = "unknown";
      text = "";
      console.log("----no mime", info);
    } else {
      text =
        mime.indexOf("text/plain") !== -1
          ? uint8ArrayToAsciiString(firstChunk)
          : "";
    }
  } else {
    mime = "";
  }
  return {
    cid: cid.toString(),
    type,
    size,
    local,
    sizeLocal,
    blocks,
    mime,
    text,
  };
};

export const fileStat = async (cid) => {
  const path = `/ipfs/${cid}`;
  const info = await node.files.stat(path, {
    withLocal: true,
    size: true,
  });

  return info;
};

export const catByInfo = async (info) => {
  const { cid, type } = info;
  const path = `/ipfs/${cid}`;

  let text = "";
  let mime = "";
  if (type !== "directory") {
    const { value: firstChunk } = await node
      .cat(path, { length: 256, offset: 0 })
      [Symbol.asyncIterator]()
      .next();

    mime = await getMimeFromUint8Array(firstChunk);
    if (!mime) {
      mime = "unknown";
      text = "";
    } else {
      text =
        mime.indexOf("text/plain") !== -1
          ? uint8ArrayToAsciiString(firstChunk)
          : "";
      // text = text.replace(/"/g, '\\"');
      text = text.replace(/"/g, "%20");
    }
  } else {
    mime = "";
  }

  return { ...info, mime, text };
};

export const processByBatches = async (items, processFn, batchSize = 10) => {
  const result = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResult = await Promise.all(batch.map((item) => processFn(item)));
    result.push(...batchResult);
  }

  return result;
};

export const listRefs = async (cid) => {
  const path = `/ipfs/${cid}`;
  const refsIterable = node.refs(path, { recursive: true });
  const refs = [];
  for await (const refItem of refsIterable) {
    refs.push(refItem.ref);
  }
  return refs;
};
