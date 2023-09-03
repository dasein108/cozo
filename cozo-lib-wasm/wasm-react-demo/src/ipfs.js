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
    result.push({ cid: cid.toString(), type });
  }
  return result;
};

export const listFiles = async () => {
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
    const { cid } = pin;
    // if (pin.type === "recursive") {
    //   console.log("----PIN recursive", pin.cid.toString());
    // }
    // if (pin.type === "indirect") {
    //   console.log("----PIN indirect", pin.cid.toString());
    // }
    // if (
    //   [
    //     "QmcbHtxXUnRnsmSBwLfUFbyRAekZjgdpYtgaGdZCEr3fdF",
    //     "QmThdPXV25SBNKFfpgzg4H2itn3azUaPNiYTfmr1GaxrNv",
    //     "QmauXpjVLmLHefuD2A5MK3KKAK5r1bmCd8rWTwtYGuEp5j",
    //     "QmWzV6ek81vECxEVAAuPDjh2BeypYHPjEHSham8LfxkFs5",
    //     "QmcbHtxXUnRnsmSBwLfUFbyRAekZjgdpYtgaGdZCEr3fdF",
    //   ].indexOf(cid.toString()) !== -1
    // ) {
    //   console.log("----PIN", pin);
    //   debugger;
    // }
    const path = `/ipfs/${cid}`;
    const info = await node.files.stat(path, {
      withLocal: true,
      size: true,
    });

    const { type, size, local, blocks, cumulativeSize } = info;

    let text = "";
    let mime = "";
    if (type !== "directory") {
      const { value: firstChunk } = await node
        .cat(path, { length: 512, offset: 0 })
        [Symbol.asyncIterator]()
        .next();

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
      mime = "directory";
    }

    // console.log(
    //   `Pinned ${cid}: ${path} ${type} ${size}/${cumulativeSize} ${local} ${blocks} ${mime} ${text}`
    // );
    result.push({
      cid: cid.toString(),
      type,
      size,
      local,
      blocks,
      mime,
      text,
    });
  }

  return result;

  // await node.files.stat(path, {
  //     signal,
  //     withLocal: true,
  //     size: true,
  //   });
};
