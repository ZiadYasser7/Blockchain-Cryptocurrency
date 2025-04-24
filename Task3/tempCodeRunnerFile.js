"use strict";

// required: npm install blind-signatures
const blindSignatures = require('blind-signatures');
const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Details about the bank's key.
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n;
const E = BANK_KEY.keyPair.e;

/**
 * Function signing the coin on behalf of the bank.
 * 
 * @param blindedCoinHash - the blinded hash of the coin.
 * @returns the signature of the bank for this coin.
 */
function signCoin(blindedCoinHash) {
  return blindSignatures.sign({
    blinded: blindedCoinHash,
    key: BANK_KEY,
  });
}

/**
 * Parses a string representing a coin, and returns the left/right identity string hashes.
 *
 * @param {string} s - string representation of a coin.
 * 
 * @returns {[[string]]} - two arrays of strings of hashes, committing the owner's identity.
 */
function parseCoin(s) {
  let [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
  if (cnst !== BANK_STR) {
    throw new Error(Invalid identity string: ${cnst} received, but ${BANK_STR} expected);
  }
  let lh = leftHashes.split(',');
  let rh = rightHashes.split(',');
  return [lh, rh];
}

/**
 * Procedure for a merchant accepting a token.
 * 
 * @param {Coin} coin - the coin that a purchaser wants to use.
 * @returns {[String]} - an array of strings, each holding half of the user's identity.
 */
function acceptCoin(coin) {
  // 1) Verify that the signature is valid.
  const valid = blindSignatures.verify({
    unblinded: coin.signature,
    message: coin.toString(),
    N: coin.n,
    E: coin.e,
  });

  if (!valid) {
    throw new Error("Invalid signature!");
  }

  // 2) Gather RIS
  const [leftHashes, rightHashes] = parseCoin(coin.toString());
  let ris = [];

  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    const isLeft = Math.random() < 0.5;
    const value = coin.getRis(isLeft, i);
    const hashed = utils.hash(value);
    const expected = isLeft ? leftHashes[i] : rightHashes[i];

    if (hashed !== expected) {
      throw new Error("RIS hash mismatch – Coin may be forged!");
    }

    ris.push(value);
  }

  return ris;
}

/**
 * If a token has been double-spent, determine who is the cheater.
 * 
 * @param guid - Unique coin ID.
 * @param ris1 - Identity string from first merchant.
 * @param ris2 - Identity string from second merchant.
 */
function determineCheater(guid, ris1, ris2) {
  console.log(Analyzing coin ${guid} for double-spending...);

  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    if (ris1[i] !== ris2[i]) {
      const id1 = Buffer.from(ris1[i], 'hex');
      const id2 = Buffer.from(ris2[i], 'hex');
      const xor = utils.xorBuffers(id1, id2).toString();

      if (xor.startsWith(IDENT_STR)) {
        const trueId = xor.split(':')[1];
        console.log(Double-spending detected! The cheater is the buyer: ${trueId});
        return;
      } else {
        console.log("Double-spending detected! One of the merchants is cheating.");
        return;
      }
    }
  }

  console.log("Both RIS strings are identical. The merchant is trying to cheat.");
}

// === Main Execution ===

let coin = new Coin('alice', 20, N, E);

coin.signature = signCoin(coin.blinded);
coin.unblind();

// Merchant 1 accepts the coin.
let ris1 = acceptCoin(coin);

// Merchant 2 accepts the same coin.
let ris2 = acceptCoin(coin);

// Bank detects cheating
determineCheater(coin.guid, ris1, ris2);

// Check for cheating with same RIS (simulate merchant cheating)
determineCheater(coin.guid, ris1, ris1);