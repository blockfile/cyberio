const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getParsedTransactionWithRetry,
  verifyPassPaymentTransaction,
} = require("../util/passPayment");

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const expected = {
  wallet: "buyer-wallet",
  memo: "CYBERIO_PASS|buyer-wallet|7|5000000|escrow-id",
  treasuryAta: "treasury-token-account",
  mint: "cyberio-mint",
  tokenProgramId: TOKEN_2022_PROGRAM_ID,
  amountRaw: "5000000",
};

function transaction({ err = null, programId = TOKEN_2022_PROGRAM_ID } = {}) {
  return {
    meta: { err, innerInstructions: [] },
    transaction: {
      message: {
        instructions: [
          {
            programId,
            parsed: {
              type: "transferChecked",
              info: {
                authority: expected.wallet,
                destination: expected.treasuryAta,
                mint: expected.mint,
                tokenAmount: { amount: expected.amountRaw, decimals: 6 },
              },
            },
          },
          { programId: MEMO_PROGRAM_ID, parsed: expected.memo },
        ],
      },
    },
  };
}

test("accepts a successful exact Token-2022 treasury payment", () => {
  assert.equal(verifyPassPaymentTransaction(transaction(), expected), true);
});

test("rejects attempted instructions from a failed transaction", () => {
  assert.throws(
    () =>
      verifyPassPaymentTransaction(
        transaction({ err: { InstructionError: [2, "IncorrectProgramId"] } }),
        expected
      ),
    /Transaction failed on-chain/
  );
});

test("rejects the legacy token program for the Token-2022 intent", () => {
  assert.throws(
    () =>
      verifyPassPaymentTransaction(
        transaction({ programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }),
        expected
      ),
    /successful exact Token-2022 payment/
  );
});

test("rejects a payment with the wrong authority, amount, destination, or memo", () => {
  for (const mutate of [
    (tx) => (tx.transaction.message.instructions[0].parsed.info.authority = "other-wallet"),
    (tx) => (tx.transaction.message.instructions[0].parsed.info.tokenAmount.amount = "1"),
    (tx) => (tx.transaction.message.instructions[0].parsed.info.destination = "other-account"),
    (tx) => (tx.transaction.message.instructions[1].parsed = "wrong-memo"),
  ]) {
    const tx = transaction();
    mutate(tx);
    assert.throws(() => verifyPassPaymentTransaction(tx, expected));
  }
});

test("retries a temporarily unavailable parsed transaction", async () => {
  let calls = 0;
  const tx = transaction();
  const result = await getParsedTransactionWithRetry(
    async () => {
      calls += 1;
      return calls < 3 ? null : tx;
    },
    { attempts: 4, delayMs: 0 }
  );

  assert.equal(result, tx);
  assert.equal(calls, 3);
});

test("returns null after transaction lookup retries are exhausted", async () => {
  let calls = 0;
  const result = await getParsedTransactionWithRetry(
    async () => {
      calls += 1;
      return null;
    },
    { attempts: 3, delayMs: 0 }
  );

  assert.equal(result, null);
  assert.equal(calls, 3);
});
