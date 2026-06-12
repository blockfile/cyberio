const https = require("https");
const axios = require("axios");

const DAS_TIMEOUT_MS = Number(process.env.DAS_TIMEOUT_MS || 20000);

function createDasHttpOptions() {
  return {
    timeout: DAS_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "cyberio-dapp/1.0",
    },
    httpsAgent: new https.Agent({
      keepAlive: false,
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.2",
      family: 4,
    }),
  };
}

function getDasErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    String(error)
  );
}

async function postDas(endpoint, body) {
  const { data } = await axios.post(endpoint, body, createDasHttpOptions());
  if (data?.error) {
    const err = new Error(
      typeof data.error === "string" ? data.error : data.error.message || "DAS RPC error"
    );
    err.response = { data };
    throw err;
  }
  return data;
}

module.exports = {
  createDasHttpOptions,
  getDasErrorMessage,
  postDas,
};
