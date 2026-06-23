const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

function publicKeyString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.toBase58 === "function") return value.toBase58();
  return String(value);
}

function allParsedInstructions(tx) {
  const topLevel = tx?.transaction?.message?.instructions || [];
  const inner = (tx?.meta?.innerInstructions || []).flatMap(
    (group) => group.instructions || []
  );
  return [...topLevel, ...inner];
}

function memoText(ix) {
  if (publicKeyString(ix?.programId) !== MEMO_PROGRAM_ID) return null;
  if (typeof ix.parsed === "string") return ix.parsed;
  if (ix.parsed?.type === "memo") return ix.parsed?.info?.memo || null;
  return null;
}

function verifyPassPaymentTransaction(tx, expected) {
  if (!tx?.transaction?.message || !tx?.meta) {
    throw new Error("Transaction data or execution metadata is unavailable.");
  }

  // Parsed instructions describe what a transaction attempted. They are still
  // present when execution failed, so status must be checked before inspecting
  // the memo or transfer.
  if (!Object.prototype.hasOwnProperty.call(tx.meta, "err")) {
    throw new Error("Transaction execution status is unavailable.");
  }
  if (tx.meta.err !== null) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);
  }

  const instructions = allParsedInstructions(tx);
  if (!instructions.some((ix) => memoText(ix) === expected.memo)) {
    throw new Error("Memo check failed. Tx does not include the correct purchase memo.");
  }

  const amountRaw = String(expected.amountRaw);
  const transferOk = instructions.some((ix) => {
    if (publicKeyString(ix?.programId) !== expected.tokenProgramId) return false;

    const parsed = ix?.parsed;
    if (parsed?.type !== "transferChecked") return false;

    const info = parsed.info || {};
    const raw = info.tokenAmount?.amount;
    return (
      info.authority === expected.wallet &&
      info.destination === expected.treasuryAta &&
      info.mint === expected.mint &&
      raw != null &&
      String(raw) === amountRaw
    );
  });

  if (!transferOk) {
    throw new Error(
      "Transfer check failed. A successful exact Token-2022 payment to the treasury was not found."
    );
  }

  return true;
}

async function getParsedTransactionWithRetry(fetchTransaction, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 8);
  const configuredDelay = Number(options.delayMs);
  const delayMs = Number.isFinite(configuredDelay) ? Math.max(0, configuredDelay) : 1000;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const tx = await fetchTransaction();
      if (tx) return tx;
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError) throw lastError;
  return null;
}

module.exports = { getParsedTransactionWithRetry, verifyPassPaymentTransaction };
