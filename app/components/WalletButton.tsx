"use client";

import { useEffect, useState } from "react";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (value: unknown) => void) => void;
  removeListener?: (event: string, listener: (value: unknown) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const ROBINHOOD_CHAIN = {
  chainId: "0x1237",
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
};

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const account = Array.isArray(accounts) ? accounts[0] : undefined;
        if (typeof account === "string") setAddress(account);
      })
      .catch(() => undefined);

    const onAccountsChanged = (value: unknown) => {
      const account = Array.isArray(value) ? value[0] : undefined;
      setAddress(typeof account === "string" ? account : "");
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", onAccountsChanged);
  }, []);

  async function connect() {
    const provider = window.ethereum;
    if (!provider) {
      setStatus("error");
      window.open("https://ethereum.org/wallets/", "_blank", "noopener,noreferrer");
      return;
    }

    setStatus("connecting");
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ROBINHOOD_CHAIN.chainId }],
        });
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code !== 4902) throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [ROBINHOOD_CHAIN],
        });
      }

      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const account = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof account !== "string") throw new Error("No wallet account returned");
      setAddress(account);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      className="wallet-button"
      onClick={connect}
      type="button"
      aria-label={address ? `Connected wallet ${address}` : "Connect wallet"}
    >
      <span className={`wallet-dot ${address ? "is-live" : ""}`} />
      {address
        ? shorten(address)
        : status === "connecting"
          ? "Connecting…"
          : status === "error"
            ? "Try wallet"
            : "Connect wallet"}
    </button>
  );
}

