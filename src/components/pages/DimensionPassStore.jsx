/* eslint-env browser, es2021 */
import React, { useContext, useEffect, useMemo, useState } from "react";
import { WalletContext } from "../../context/WalletConnect";
import { API_BASE_URL } from "../../config/endpoints";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferCheckedInstruction,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Ticket, Lock } from "lucide-react";

// ✅ Off-chain tier images (UI only)
import TIER1 from "../assets/images/dimentsionalpass/TIER1.png";
import TIER2 from "../assets/images/dimentsionalpass/TIER2.png";
import TIER3 from "../assets/images/dimentsionalpass/TIER3.png";

const API_BASE = API_BASE_URL;

// RPC for wallet recentBlockhash
const SOLANA_RPC =
    (process.env.REACT_APP_SOLANA_RPC || "").trim() ||
    (process.env.REACT_APP_QUICKNODE_RPC_URL || "").trim() ||
    "https://api.mainnet-beta.solana.com";

/**
 * OFF-CHAIN STORE ITEMS (UI CARDS)
 * - These are not on-chain NFTs; just products you sell.
 * - Price is in CYBERIO token units (display), but payment logic is on-chain.
 */
const LOCAL_OFFERINGS = [
    { tier: "TIER 3", durationDays: 7, price: 5, image: TIER3, accent: "cyan" },
    { tier: "TIER 2", durationDays: 15, price: 15, image: TIER2, accent: "violet" },
    { tier: "TIER 1", durationDays: 30, price: 35, image: TIER1, accent: "fuchsia" },
];

async function safeJson(url, init) {
    const res = await fetch(url, init);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();

    // detect HTML (common when endpoint doesn't exist and returns index.html)
    if (ct.includes("text/html") || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        const preview = text.slice(0, 180).replace(/\s+/g, " ").trim();
        throw new Error(
            `Endpoint returned HTML (wrong route or API_BASE).\nURL: ${url}\nHTTP: ${res.status}\nPreview: ${preview}`
        );
    }

    let json;
    try {
        json = JSON.parse(text);
    } catch {
        const preview = text.slice(0, 180).replace(/\s+/g, " ").trim();
        throw new Error(`Invalid JSON.\nURL: ${url}\nHTTP: ${res.status}\nPreview: ${preview}`);
    }

    if (!res.ok && json?.error) throw new Error(json.error);
    return json;
}

function getPurchaseErrorMessage(error) {
    const msg = String(error?.message || error || "Purchase failed");
    const lower = msg.toLowerCase();

    if (
        lower.includes("fetch failed") ||
        lower.includes("failed to fetch") ||
        lower.includes("err_connection_timed_out") ||
        lower.includes("failed to get info about account") ||
        lower.includes("recentblockhash")
    ) {
        return "Solana RPC is currently unreachable. Please try again when the RPC endpoint is responding.";
    }

    return msg;
}

export default function DimensionPassStore() {
    const { wallet, connectWallet, walletProvider } = useContext(WalletContext);
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [activePass, setActivePass] = useState(null);
    const [notice, setNotice] = useState(null);

    const solanaConnection = useMemo(() => new Connection(SOLANA_RPC, "confirmed"), []);

    // Optional: show active pass status (won't block UI if backend route missing)
    async function fetchActivePass() {
        if (!wallet) return setActivePass(null);

        try {
            const j = await safeJson(`${API_BASE}/api/store/pass/active/${wallet}`);
            if (!j?.success) return setActivePass(null);
            setActivePass(j.active ? j.pass : null);
        } catch {
            // Ignore if endpoint doesn't exist yet
            setActivePass(null);
        }
    }

    useEffect(() => {
        fetchActivePass().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wallet]);

    async function buyPass(durationDays) {
        try {
            if (!wallet) throw new Error("Connect your wallet first.");
            if (!walletProvider) throw new Error("Wallet provider unavailable. Please reconnect your wallet.");

            setNotice(null);
            setLoading(true);

            // 1) get intent from server
            const intentJson = await safeJson(`${API_BASE}/api/store/pass/intent`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet, durationDays }),
            });

            if (!intentJson?.success) throw new Error(intentJson?.error || "Failed creating purchase intent.");
            const intent = intentJson.intent;

            const mintPk = new PublicKey(intent.mint);
            const ownerPk = new PublicKey(wallet);
            const treasuryAtaPk = new PublicKey(intent.treasuryAta);

            const tokenProgramId =
                intent.tokenProgramId === TOKEN_2022_PROGRAM_ID.toBase58()
                    ? TOKEN_2022_PROGRAM_ID
                    : TOKEN_PROGRAM_ID;

            // 2) derive user ATA
            const userAta = await getAssociatedTokenAddress(
                mintPk,
                ownerPk,
                false,
                tokenProgramId,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            const tx = new Transaction();

            // 3) check if ATA exists (your server endpoint)
            // IMPORTANT: URL-encode query params (fixes 400 from hidden characters / parsing)
            let exists = true;
            try {
                const ataUrl =
                    `${API_BASE}/api/wallet-nfts/ata-exists` +
                    `?owner=${encodeURIComponent(wallet)}` +
                    `&mint=${encodeURIComponent(intent.mint)}` +
                    `&tokenProgramId=${encodeURIComponent(intent.tokenProgramId)}`;

                const ataJson = await safeJson(ataUrl);
                exists = !!ataJson?.exists;
            } catch {
                // if check endpoint missing, assume it exists (avoids breaking UI)
                exists = true;
            }

            if (!exists) {
                tx.add(
                    createAssociatedTokenAccountInstruction(
                        ownerPk, // payer
                        userAta,
                        ownerPk,
                        mintPk,
                        tokenProgramId,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            // 4) transferChecked (payment)
            const amountRaw = BigInt(intent.amountRaw);

            tx.add(
                createTransferCheckedInstruction(
                    userAta,
                    mintPk,
                    treasuryAtaPk,
                    ownerPk,
                    amountRaw,
                    Number(intent.decimals),
                    [],
                    tokenProgramId
                )
            );

            // 5) memo
            const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
            tx.add({
                keys: [],
                programId: MEMO_PROGRAM_ID,
                data: Buffer.from(intent.memo, "utf8"),
            });

            // ✅ REQUIRED: feePayer + recentBlockhash (fixes "Transaction recentBlockhash required")
            tx.feePayer = ownerPk;
            const { blockhash } = await solanaConnection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;

            // 6) selected wallet signs & sends
            let signature = null;
            if (typeof walletProvider.signAndSendTransaction === "function") {
                const res = await walletProvider.signAndSendTransaction(tx, {
                    skipPreflight: false,
                    preflightCommitment: "confirmed",
                    maxRetries: 3,
                });
                signature = res?.signature || res;
            } else if (typeof walletProvider.signTransaction === "function") {
                const signed = await walletProvider.signTransaction(tx);
                signature = await solanaConnection.sendRawTransaction(signed.serialize(), {
                    skipPreflight: false,
                    preflightCommitment: "confirmed",
                    maxRetries: 3,
                });
            } else {
                throw new Error("Selected wallet does not support transaction signing.");
            }
            if (!signature) throw new Error("No signature returned by wallet.");

            // 7) confirm with server
            const confirmJson = await safeJson(`${API_BASE}/api/store/pass/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wallet,
                    durationDays,
                    txid: signature,
                    escrowId: intent.escrowId,
                    amountRaw: intent.amountRaw,
                }),
            });

            if (!confirmJson?.success) throw new Error(confirmJson?.error || "Pass confirmation failed.");

            setNotice(`Success! Pass active until ${new Date(confirmJson.pass.expiresAt).toLocaleString()}`);
            await fetchActivePass();
        } catch (e) {
            console.error("Pass purchase failed:", e);
            setNotice(getPurchaseErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-full text-white font-silkscreen relative overflow-hidden">
            {/* cyberpunk HUD background */}
            <div className="absolute inset-0 bg-black" />
            <div
                className="absolute inset-0 opacity-80"
                style={{
                    background:
                        "radial-gradient(circle at 20% 10%, rgba(0,255,255,.14), transparent 45%)," +
                        "radial-gradient(circle at 75% 55%, rgba(180,0,255,.16), transparent 55%)," +
                        "radial-gradient(circle at 40% 90%, rgba(255,43,214,.10), transparent 50%)",
                }}
            />
            <div
                className="absolute inset-0 opacity-[0.08] pointer-events-none"
                style={{
                    backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,.6) 1px, transparent 1px)",
                    backgroundSize: "100% 4px",
                }}
            />

            <div className="relative z-10 p-6">
                <div className="max-w-6xl mx-auto">
                    {/* header */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <Ticket size={20} />
                                <div className="text-3xl font-extrabold tracking-wide">DIMENSION PASS STORE</div>
                            </div>

                        </div>

                        <button
                            onClick={() => navigate(-1)}
                            className="rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase inline-flex items-center gap-2"
                        >
                            <ChevronLeft size={18} />
                            BACK
                        </button>
                    </div>

                    {/* wallet + pass status */}
                    <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <div className="text-xs uppercase tracking-widest opacity-70">Wallet</div>
                                <div className="mt-1 break-all">{wallet || "Not connected"}</div>

                                <div className="mt-4 text-xs uppercase tracking-widest opacity-70">Active Pass</div>
                                <div className="mt-1">
                                    {activePass ? (
                                        <div className="space-y-1">
                                            <div>Duration: {activePass.durationDays} days</div>
                                            <div>Expires: {new Date(activePass.expiresAt).toLocaleString()}</div>
                                        </div>
                                    ) : (
                                        <div className="opacity-80">No active pass</div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 justify-start">
                                {!wallet ? (
                                    <button
                                        type="button"
                                        onClick={() => connectWallet({ forceSelect: true })}
                                        className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                                    >
                                        CONNECT WALLET
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fetchActivePass().catch(() => { })}
                                        className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                                    >
                                        REFRESH STATUS
                                    </button>
                                )}

                                {wallet && !walletProvider ? (
                                    <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm opacity-85">
                                        Wallet provider unavailable. Reconnect to continue.
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    {/* OFF-CHAIN CARDS (always visible) */}
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {LOCAL_OFFERINGS.map((o) => {
                            const glow =
                                o.accent === "cyan"
                                    ? "inset 0 0 0 1px rgba(0,255,255,.22), 0 0 30px rgba(0,255,255,.10)"
                                    : o.accent === "violet"
                                        ? "inset 0 0 0 1px rgba(180,0,255,.22), 0 0 30px rgba(180,0,255,.10)"
                                        : "inset 0 0 0 1px rgba(255,43,214,.22), 0 0 30px rgba(255,43,214,.10)";

                            return (
                                <div
                                    key={o.tier}
                                    className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4"
                                >
                                    <div className="pointer-events-none absolute inset-0 opacity-70" style={{ boxShadow: glow }} />

                                    <div
                                        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        style={{
                                            background:
                                                "linear-gradient(120deg, transparent 0%, rgba(255,255,255,.12) 45%, transparent 60%)",
                                            transform: "translateX(-30%)",
                                            animation: "dpScan 1.8s linear infinite",
                                        }}
                                    />

                                    <div className="relative">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs uppercase tracking-widest opacity-70">PASS</div>
                                            <div className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border border-white/15 bg-white/10">
                                                {o.tier}
                                            </div>
                                        </div>

                                        <div className="mt-3 text-center">
                                            <div className="text-2xl font-extrabold">{o.durationDays} DAYS</div>
                                            <div className="mt-1 opacity-85">
                                                PRICE: <span className="font-extrabold">{o.price}</span> CYBERIO
                                            </div>
                                        </div>

                                        <div className="mt-4 flex justify-center">
                                            <div className="relative w-full max-w-[240px] aspect-[4/5] rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
                                                <img
                                                    src={o.image}
                                                    alt={`${o.tier} Dimension Pass`}
                                                    className="w-full h-full object-contain p-3"
                                                    draggable={false}
                                                />
                                            </div>
                                        </div>

                                        <button
                                            disabled={loading}
                                            onClick={() => buyPass(o.durationDays)}
                                            className="mt-4 w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase disabled:opacity-60"
                                        >
                                            {loading ? "PROCESSING…" : "BUY"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Notice */}
                    {notice ? (
                        <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4 whitespace-pre-wrap">
                            <div className="flex items-center gap-2">
                                <Lock size={16} />
                                <span className="text-xs uppercase tracking-widest opacity-70">System Message</span>
                            </div>
                            <div className="mt-2 opacity-90">{notice}</div>
                        </div>
                    ) : null}
                </div>
            </div>

            <style>{`
        @keyframes dpScan {
          0% { transform: translateX(-60%); }
          100% { transform: translateX(120%); }
        }
      `}</style>
        </div>
    );
}
