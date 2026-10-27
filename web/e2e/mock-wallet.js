// TEST TOOLING ONLY. A stand-in for an injected browser wallet (EIP-1193) that forwards every request
// to a local Hardhat node. The node holds the test accounts and signs, so no key appears in this file.
// Never point it at a real network.
export function installMockWallet(rpcUrl, accountIndex = 1) {
  let id = 0;
  const rpc = async (method, params = []) => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = await res.json();
    if (body.error) {
      const err = new Error(body.error.message);
      err.code = body.error.code;
      err.data = body.error.data;
      throw err;
    }
    return body.result;
  };
  const listeners = {};
  window.ethereum = {
    isMockWallet: true,
    async request({ method, params }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        const accounts = await rpc("eth_accounts");
        return [accounts[accountIndex]];
      }
      if (method === "eth_sendTransaction" && window.__rejectNext) {
        window.__rejectNext = false;
        const err = new Error("User rejected the request.");
        err.code = 4001;
        throw err;
      }
      return rpc(method, params);
    },
    on(ev, fn) { (listeners[ev] ??= []).push(fn); },
    removeListener() {},
  };
}
