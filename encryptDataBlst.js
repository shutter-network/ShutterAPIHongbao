import { hexToBytes, keccak256, bytesToBigInt, bytesToHex, numberToBytes } from 'https://esm.sh/viem';
import pkg from 'https://esm.sh/lodash';
import { Buffer } from 'https://esm.sh/buffer';

const { zip } = pkg;
const blsSubgroupOrderBytes = [
    0x73, 0xed, 0xa7, 0x53, 0x29, 0x9d, 0x7d, 0x48, 0x33, 0x39, 0xd8, 0x08, 0x09, 0xa1, 0xd8, 0x05,
    0x53, 0xbd, 0xa4, 0x02, 0xff, 0xfe, 0x5b, 0xfe, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01,
];
const blsSubgroupOrder = bytesToBigInt(Uint8Array.from(blsSubgroupOrderBytes));
export async function encryptData(msgHex, identityPreimageHex, eonKeyHex, sigmaHex) {
    const identity = await computeIdentityP1(identityPreimageHex);
    const eonKey = await computeEonKeyP2(eonKeyHex);
    const encryptedMessage = await encrypt(msgHex, identity, eonKey, sigmaHex);
    const encodedTx = encodeEncryptedMessage(encryptedMessage);
    return encodedTx;
}
export async function computeIdentityP1(preimage) {
    const preimageBytes = hexToBytes(('0x1' + preimage.slice(2)));
    const blst = window.blst;
    const identity = new blst.P1().hash_to(preimageBytes, 'SHUTTER_V01_BLS12381G1_XMD:SHA-256_SSWU_RO_', null);
    return identity;
}
async function computeEonKeyP2(eonKeyHex) {
    const blst = window.blst;
    const eonKey = new blst.P2(hexToBytes(eonKeyHex));
    return eonKey;
}
async function encrypt(msgHex, identity, eonKey, sigmaHex) {
    const r = computeR(sigmaHex.slice(2), msgHex.slice(2));
    const c1 = computeC1(r);
    const c2 = await computeC2(sigmaHex, r, identity, eonKey);
    const c3 = computeC3(padAndSplit(hexToBytes(msgHex)), hexToBytes(sigmaHex));
    return {
        VersionId: 0x3,
        c1: c1,
        c2: c2,
        c3: c3,
    };
}
export function encodeEncryptedMessage(encryptedMessage) {
    const c1Length = 96;
    const c2Length = 32;
    const c3Length = encryptedMessage.c3.length * 32;
    const totalLength = 1 + c1Length + c2Length + c3Length;
    const bytes = new Uint8Array(totalLength);
    bytes[0] = encryptedMessage.VersionId;
    bytes.set(encryptedMessage.c1, 1);
    bytes.set(encryptedMessage.c2, 1 + c1Length);
    encryptedMessage.c3.forEach((block, i) => {
        const offset = 1 + c1Length + c2Length + 32 * i;
        bytes.set(block, offset);
    });
    return bytesToHex(bytes);
}
export function decodeEncryptedMessage(encryptedMessage) {
    const blst = window.blst;
    const bytes = hexToBytes(encryptedMessage);
    if (bytes[0] !== 0x3) {
        throw "Invalid version";
    }
    const c1 = new blst.P2_Affine(bytes.slice(1, 96 + 1));
    const c2 = bytes.slice(96 + 1, 96 + 1 + 32);
    const c3 = bytes.slice(96 + 1 + 32);
    return {
        VersionId: 0x3,
        c1: c1,
        c2: c2,
        c3: c3,
    };
}
export async function decrypt(encryptedMessageHex, epochSecretKeyHex) {
    const blst = window.blst;
    const decodedMessage = decodeEncryptedMessage(encryptedMessageHex);
    const p = new blst.PT(decodedMessage.c1, new blst.P1_Affine(hexToBytes(epochSecretKeyHex)));
    const key = hash2(p);
    const sigma = xorBlocks(decodedMessage.c2, key);
    const blockCount = decodedMessage.c3.length / 32;
    const decryptedBlocks = new Uint8Array(decodedMessage.c3.length);
    const keys = computeBlockKeys(sigma, blockCount);
    for (let i = 0; i < blockCount; i++) {
        const block = decodedMessage.c3.slice(i * 32, (i + 1) * 32);
        const decryptedBlock = xorBlocks(block, keys[i]);
        decryptedBlocks.set(decryptedBlock, i * 32);
    }
    return bytesToHex(unpad(decryptedBlocks));
}
//======================================
function computeR(sigmaHex, msgHex) {
    const preimage = sigmaHex + msgHex;
    return hash3(preimage);
}
function computeC1(r) {
    const blst = window.blst;
    const scalar = new blst.Scalar().from_bendian(numberToBytes(r)).to_lendian();
    const c1 = blst.P2.generator().mult(scalar).compress();
    return c1;
}
async function computeC2(sigmaHex, r, identity, eonKey) {
    const blst = window.blst;
    const p = new blst.PT(identity, eonKey);
    const preimage = await GTExp(p, r);
    const key = hash2(preimage);
    const result = xorBlocks(hexToBytes(sigmaHex), key);
    return result;
}
function computeC3(messageBlocks, sigma) {
    const keys = computeBlockKeys(sigma, messageBlocks.length);
    return zip(keys, messageBlocks).map(([key, block]) => {
        if (key === undefined || block === undefined) {
            throw new Error('Key or block is undefined');
        }
        return xorBlocks(key, block);
    });
}
//======================================
function hash2(p) {
    const finalExp = p.final_exp().to_bendian();
    const result = new Uint8Array(finalExp.length + 1);
    result[0] = 0x2;
    result.set(finalExp, 1);
    return keccak256(result, 'bytes');
}
function hash3(bytesHex) {
    const preimage = hexToBytes(('0x3' + bytesHex));
    const hash = keccak256(preimage, 'bytes');
    const bigIntHash = bytesToBigInt(hash);
    const result = bigIntHash % blsSubgroupOrder;
    return result;
}
function hash4(bytes) {
    const preimage = new Uint8Array(bytes.length + 1);
    preimage[0] = 0x4;
    preimage.set(bytes, 1);
    const hash = keccak256(preimage, 'bytes');
    return hash;
}
//======================================
function xorBlocks(x, y) {
    if (x.length !== y.length) {
        throw new Error('Both byte arrays must be of the same length.');
    }
    const result = new Uint8Array(x.length);
    for (let i = 0; i < x.length; i++) {
        result[i] = x[i] ^ y[i];
    }
    return result;
}
function computeBlockKeys(sigma, n) {
    return Array.from({ length: n }, (_, x) => {
        const suffix = Buffer.alloc(4);
        suffix.writeUInt32BE(x, 0);
        let suffixLength = 4;
        for (let i = 0; i < 3; i++) {
            if (suffix[i] !== 0)
                break;
            suffixLength--;
        }
        const effectiveSuffix = Buffer.from(suffix.slice(4 - suffixLength));
        const preimage = Buffer.concat([sigma, effectiveSuffix]);
        return hash4(preimage);
    });
}
function padAndSplit(bytes) {
    const blockSize = 32;
    const paddingLength = blockSize - (bytes.length % blockSize);
    const padded = new Uint8Array(bytes.length + paddingLength);
    padded.set(bytes);
    padded.fill(paddingLength, bytes.length);
    const result = [];
    for (let i = 0; i < padded.length; i += blockSize) {
        result.push(padded.slice(i, i + blockSize));
    }
    return result;
}
function unpad(bytes) {
    const paddingLength = bytes.at(-1);
    if (paddingLength == undefined || paddingLength == 0 || paddingLength > 31) {
        throw `Invalid padding length (probably): ${paddingLength}`;
    }
    return bytes.slice(0, bytes.length - paddingLength);
}
async function GTExp(x, exp) {
    const blst = window.blst;
    const a = x;
    const acc = blst.PT.one();
    while (exp > BigInt(0)) {
        if (exp & BigInt(1)) {
            acc.mul(a);
        }
        a.sqr();
        exp >>= BigInt(1);
    }
    return acc;
}
