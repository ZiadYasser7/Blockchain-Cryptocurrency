"use strict";

const blindSignatures = require('blind-signatures');
const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Bank keypair
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n.toString();
const E = BANK_KEY.keyPair.e.toString();

function signCoin(blindedCoinHash) {
  return blindSignatures.sign({
    blinded: blindedCoinHash,
    key: BANK_KEY,
  });
}

function parseCoin(s) {
  let [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
  if (cnst !== BANK_STR) {
    throw new Error(`Invalid identity string: ${cnst} received, but ${BANK_STR} expected`);
  }
  let lh = leftHashes.split(',');
  let rh = rightHashes.split(',');
  return [lh, rh];
}

// ✅ ACCEPT COIN
function acceptCoin(coin) {
  // 1. Verify signature
  let valid = blindSignatures.verify({
    unblinded: coin.signature,
    message: coin.toString(),
    N: coin.n,
    E: coin.e
  });

  if (!valid) throw new Error("Invalid coin signature!");

  // 2. Select random RIS side (left/right)
  let isLeft = utils.randInt(2) === 0;

  // 3. Parse original hashes to compare
  let [leftHashes, rightHashes] = parseCoin(coin.toString());

  let ris = [];

  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    let ident = coin.getRis(isLeft, i);
    let h = utils.hash(ident);
    let expectedHash = isLeft ? leftHashes[i] : rightHashes[i];

    if (h !== expectedHash) {
      throw new Error(`RIS element ${i} has invalid hash`);
    }

    ris.push(ident.toString('hex'));
  }

  return ris;
}

// ✅ DETERMINE CHEATER
function determineCheater(guid, ris1, ris2) {
  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    if (ris1[i] === ris2[i]) continue;

    let buf1 = Buffer.from(ris1[i], 'hex');
    let buf2 = Buffer.from(ris2[i], 'hex');
    let xor = Buffer.alloc(buf1.length);

    for (let j = 0; j < buf1.length; j++) {
      xor[j] = buf1[j] ^ buf2[j];
    }

    let decoded = xor.toString();

    if (decoded.startsWith(IDENT_STR)) {
      console.log(`[ALERT] Double spender detected! Identity: ${decoded}`);
      return;
    } else {
      console.log(`[WARNING] RIS mismatch but not purchaser! Possibly merchant cheating.`);
      return;
    }
  }

  console.log(`[INFO] RIS strings are identical. Merchant is likely the cheater.`);
}

// =====================
// TESTING THE SYSTEM
// =====================
let coin = new Coin('alice', 20, N, E);

coin.signature = signCoin(coin.blinded);

coin.unblind();

let ris1 = acceptCoin(coin);
let ris2 = acceptCoin(coin);

console.log(">> Detecting double spending:");
determineCheater(coin.guid, ris1, ris2);

console.log("\n>> Testing merchant fraud:");
determineCheater(coin.guid, ris1, ris1);
