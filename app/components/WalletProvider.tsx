"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type EthereumProvider = {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
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

type WalletContextValue = {
  address: string;
  status: "idle" | "connecting" | "error";
  connect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function metaMaskProvider() {
  const injected = window.ethereum;
  if (!injected) return undefined;
  if (injected.providers?.length) {
    return injected.providers.find((provider) => provider.isMetaMask);
  }
  return injected.isMetaMask ? injected : undefined;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<WalletContextValue["status"]>("idle");

  useEffect(() => {
    const provider = metaMaskProvider();
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
      setStatus("idle");
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", onAccountsChanged);
  }, []);

  async function connect() {
    const provider = metaMaskProvider();
    if (!provider) {
      setStatus("error");
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return;
    }

    setStatus("connecting");
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const account = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof account !== "string") throw new Error("No MetaMask account returned");

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ROBINHOOD_CHAIN.chainId }],
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 4902) throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [ROBINHOOD_CHAIN],
        });
      }

      setAddress(account);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  const value = useMemo(() => ({ address, status, connect }), [address, status]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
