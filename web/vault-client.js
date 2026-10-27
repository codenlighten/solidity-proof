// Front-end data layer for the vault dApp. Pure ethers v6, no DOM, so it is unit-testable
// and reusable from any framework. web/index.html wires it to a browser wallet.
import { BrowserProvider, Contract, Interface, formatEther, parseEther } from "ethers";

export const VAULT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function version() view returns (uint256)",
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "error InsufficientBalance()",
  "error TransferFailed()",
];

const iface = new Interface(VAULT_ABI);

/** An error whose message is already written for the user (wrong network, no contract). */
export class ClientError extends Error {}
const MESSAGES = {
  InsufficientBalance: "Amount is more than your vault balance.",
  TransferFailed: "The ETH transfer failed.",
};

/** Walks an error and its nested causes, which wallets and ethers wrap in different ways. */
function* chain(err, depth = 0) {
  if (!err || typeof err !== "object" || depth > 4) return;
  yield err;
  yield* chain(err.info?.error, depth + 1);
  yield* chain(err.error, depth + 1);
  yield* chain(err.cause, depth + 1);
}

function revertName(err) {
  for (const e of chain(err)) {
    if (typeof e.data === "string") {
      try {
        const name = iface.parseError(e.data)?.name;
        if (name) return name;
      } catch { /* not one of our errors, keep looking */ }
    }
    const named = e.revert?.name ?? e.errorName ?? /custom error '(\w+)\(/.exec(e.message ?? "")?.[1];
    if (named) return named;
  }
}

/** Maps wallet rejections and the vault's custom errors to messages a user can read. */
export function friendlyError(err) {
  for (const e of chain(err)) {
    if (e.code === "ACTION_REJECTED" || e.code === 4001) return "Transaction rejected in wallet.";
  }
  if (err instanceof ClientError) return err.message;
  const name = revertName(err);
  if (name && MESSAGES[name]) return MESSAGES[name];
  return "The transaction failed. Check the amount and try again.";
}

export class VaultClient {
  /** The client is bound to one account and chain; the UI must rebuild it on accountsChanged/chainChanged. */
  constructor(contract, account) {
    this.contract = contract;
    this.account = account;
  }

  static async connect(ethereum, vaultAddress, expectedChainId) {
    const provider = new BrowserProvider(ethereum);
    const { chainId } = await provider.getNetwork();
    if (chainId !== BigInt(expectedChainId)) {
      throw new ClientError(`Wrong network: connected to chain ${chainId}, expected ${expectedChainId}.`);
    }
    if ((await provider.getCode(vaultAddress)) === "0x") throw new ClientError("No contract at that address on this chain.");
    const signer = await provider.getSigner();
    return new VaultClient(new Contract(vaultAddress, VAULT_ABI, signer), await signer.getAddress());
  }

  async balance() { return formatEther(await this.contract.balanceOf(this.account)); }
  async deposit(eth) { return (await this.contract.deposit({ value: parseEther(eth) })).wait(); }
  async withdraw(eth) { return (await this.contract.withdraw(parseEther(eth))).wait(); }
}
