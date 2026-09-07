"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import {
  clearKeystore,
  decryptKeystore,
  encryptKeystore,
  loadKeystore,
  saveKeystore,
  type Keystore,
} from "./keystore";
import { createConnection, loadNetwork, saveNetwork, type Network } from "./solana";

const AUTO_LOCK_MS = 15 * 60 * 1000;

type WalletState = {
  ready: boolean;
  keystore: Keystore | null;
  keypair: Keypair | null;
  publicKey: string | null;
  balanceSol: number | null;
  network: Network;
  connection: Connection;
  setNetwork: (network: Network) => void;
  createWallet: (passphrase: string) => Promise<string>;
  importWallet: (secret: string, passphrase: string) => Promise<string>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  removeWallet: () => void;
  revealSecretKey: (passphrase: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

function parseSecret(secret: string): Keypair {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    const bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
    return Keypair.fromSecretKey(bytes);
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [keystore, setKeystore] = useState<Keystore | null>(null);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [network, setNetworkState] = useState<Network>("devnet");
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connection = useMemo(() => createConnection(network), [network]);

  useEffect(() => {
    setKeystore(loadKeystore());
    setNetworkState(loadNetwork());
    setReady(true);
  }, []);

  const lock = useCallback(() => {
    setKeypair(null);
    setBalanceSol(null);
  }, []);

  // Auto-lock on inactivity so an unlocked wallet doesn't sit open on a shared screen.
  useEffect(() => {
    if (!keypair) return;
    const reset = () => {
      if (lockTimer.current) clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(lock, AUTO_LOCK_MS);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((event) => window.removeEventListener(event, reset));
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [keypair, lock]);

  const refreshBalance = useCallback(async () => {
    const owner = keypair?.publicKey ?? null;
    if (!owner) return;
    try {
      const lamports = await connection.getBalance(owner);
      setBalanceSol(lamports / LAMPORTS_PER_SOL);
    } catch {
      setBalanceSol(null);
    }
  }, [connection, keypair]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const setNetwork = useCallback((next: Network) => {
    saveNetwork(next);
    setNetworkState(next);
  }, []);

  const persist = useCallback(async (kp: Keypair, passphrase: string) => {
    const store = await encryptKeystore(kp.secretKey, kp.publicKey.toBase58(), passphrase);
    saveKeystore(store);
    setKeystore(store);
    setKeypair(kp);
    return kp.publicKey.toBase58();
  }, []);

  const createWallet = useCallback(
    async (passphrase: string) => persist(Keypair.generate(), passphrase),
    [persist],
  );

  const importWallet = useCallback(
    async (secret: string, passphrase: string) => {
      let kp: Keypair;
      try {
        kp = parseSecret(secret);
      } catch {
        throw new Error("That doesn't look like a valid Solana secret key.");
      }
      return persist(kp, passphrase);
    },
    [persist],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      const store = keystore ?? loadKeystore();
      if (!store) throw new Error("No wallet on this device yet.");
      const secretKey = await decryptKeystore(store, passphrase);
      setKeypair(Keypair.fromSecretKey(secretKey));
    },
    [keystore],
  );

  const revealSecretKey = useCallback(
    async (passphrase: string) => {
      const store = keystore ?? loadKeystore();
      if (!store) throw new Error("No wallet on this device yet.");
      const secretKey = await decryptKeystore(store, passphrase);
      return bs58.encode(secretKey);
    },
    [keystore],
  );

  const removeWallet = useCallback(() => {
    clearKeystore();
    setKeystore(null);
    setKeypair(null);
    setBalanceSol(null);
  }, []);

  const value: WalletState = {
    ready,
    keystore,
    keypair,
    publicKey: keypair?.publicKey.toBase58() ?? keystore?.publicKey ?? null,
    balanceSol,
    network,
    connection,
    setNetwork,
    createWallet,
    importWallet,
    unlock,
    lock,
    removeWallet,
    revealSecretKey,
    refreshBalance,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
