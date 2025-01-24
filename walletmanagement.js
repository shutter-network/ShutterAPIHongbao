const createWalletButton = document.getElementById("createWallet");
const loadWalletButton = document.getElementById("loadWallet");
const walletOutput = document.getElementById("walletOutput");
const recipientInput = document.getElementById("recipient");
const amountInput = document.getElementById("amount");
const sendFundsButton = document.getElementById("sendFunds");
const transactionOutput = document.getElementById("transactionOutput");
const walletBalanceDiv = document.getElementById("walletBalance");

// Gnosis Chain RPC URL
const GNOSIS_RPC_URL = "https://rpc.gnosis.gateway.fm";

// Helper function to convert ArrayBuffer to a Hexadecimal String
function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Registers a passkey using WebAuthn and derives the wallet deterministically.
 */
async function registerPasskey(walletName) {
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const uniqueUserId = new Uint8Array(16);
        window.crypto.getRandomValues(uniqueUserId);

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: "Gnosis Wallet", id: "hongbao.shutter.network" },
                user: {
                    id: uniqueUserId,
                    name: `wallet-${bufferToHex(uniqueUserId)}`,
                    displayName: walletName || "Unnamed Wallet",
                },
                pubKeyCredParams: [
                    { type: "public-key", alg: -7 },
                    { type: "public-key", alg: -257 },
                ],
                authenticatorSelection: {
                    residentKey: "required",
                    userVerification: "required",
                    authenticatorAttachment: "platform",
                },
                timeout: 120000,
            },
        });

        if (!credential || !credential.rawId) {
            throw new Error("Credential is missing required properties (rawId).");
        }

        const rawIdHex = bufferToHex(credential.rawId);
        const hashedRawId = ethers.keccak256(ethers.toUtf8Bytes(rawIdHex));
        const wallet = new ethers.Wallet(hashedRawId);

        console.log("Wallet Address:", wallet.address);
        return wallet;
    } catch (error) {
        console.error("Error during WebAuthn registration:", error);
        alert(`Failed to register passkey: ${error.message}`);
        throw error;
    }
}

/**
 * Authenticates the user with WebAuthn and derives the wallet deterministically.
 */
async function authenticateWallet() {
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        console.log("Attempting authentication with challenge:", challenge);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                userVerification: "required",
            },
        });

        if (!assertion || !assertion.rawId) {
            throw new Error("Failed to retrieve assertion or rawId.");
        }

        const rawIdHex = bufferToHex(assertion.rawId);
        const hashedRawId = ethers.keccak256(ethers.toUtf8Bytes(rawIdHex));
        const wallet = new ethers.Wallet(hashedRawId);

        console.log("Wallet authenticated successfully:", wallet.address);
        return wallet;
    } catch (error) {
        console.error("Error during WebAuthn authentication:", error);
        alert(`Failed to authenticate wallet: ${error.message}`);
        throw error;
    }
}

/**
 * Updates the wallet balance.
 */
async function updateWalletBalance(wallet) {
    try {
        const provider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
        const balance = await provider.getBalance(wallet.address);
        const formattedBalance = ethers.formatEther(balance);
        if (walletBalanceDiv) {
            walletBalanceDiv.textContent = `Balance: ${formattedBalance} xDAI`;
        }
    } catch (error) {
        console.error("Error fetching wallet balance:", error);
        if (walletBalanceDiv) {
            walletBalanceDiv.textContent = "Balance: Error fetching balance";
        }
    }
}

// Add event listeners if elements exist
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Automatically load the wallet on page load
        const wallet = await authenticateWallet();
        if (walletOutput) {
            walletOutput.value = `Wallet loaded successfully!\nAddress: ${wallet.address}`;
        }
        console.log("Wallet Address:", wallet.address);
        updateWalletBalance(wallet);
    } catch (error) {
        console.error("Error loading wallet on page load:", error);
        if (walletOutput) {
            walletOutput.value = "Failed to load wallet automatically. Please try loading it manually.";
        }
    }

    // Add event listener for Create Wallet button
    if (createWalletButton) {
        createWalletButton.addEventListener("click", async () => {
            try {
                const wallet = await registerPasskey();
                if (walletOutput) {
                    walletOutput.value = `Wallet created successfully!\nAddress: ${wallet.address}`;
                }
                console.log("Wallet Address:", wallet.address);
                updateWalletBalance(wallet);
            } catch (error) {
                console.error("Error creating wallet:", error);
                alert("Failed to create wallet. Ensure your device supports WebAuthn.");
            }
        });
    }

    // Add event listener for Load Wallet button
    if (loadWalletButton) {
        loadWalletButton.addEventListener("click", async () => {
            try {
                const wallet = await authenticateWallet();
                if (walletOutput) {
                    walletOutput.value = `Wallet loaded successfully!\nAddress: ${wallet.address}`;
                }
                console.log("Wallet Address:", wallet.address);
                updateWalletBalance(wallet);
            } catch (error) {
                console.error("Error loading wallet:", error);
                alert("Failed to load wallet. Ensure you authenticate correctly.");
            }
        });
    }

    // Add event listener for Send Funds button
    if (sendFundsButton) {
        sendFundsButton.addEventListener("click", async () => {
            const recipient = recipientInput?.value.trim();
            const amount = parseFloat(amountInput?.value);

            if (!ethers.isAddress(recipient)) {
                alert("Invalid recipient address!");
                return;
            }

            if (isNaN(amount) || amount <= 0) {
                alert("Invalid amount!");
                return;
            }

            try {
                const wallet = await authenticateWallet();
                const provider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
                const walletWithProvider = wallet.connect(provider);

                const tx = await walletWithProvider.sendTransaction({
                    to: recipient,
                    value: ethers.parseEther(amount.toString()),
                });

                if (transactionOutput) {
                    transactionOutput.value = `Transaction sent!\nHash: ${tx.hash}`;
                }
                console.log("Transaction:", tx);

                const receipt = await tx.wait();
                if (transactionOutput) {
                    transactionOutput.value += `\nTransaction confirmed in block ${receipt.blockNumber}`;
                }
            } catch (error) {
                console.error("Error sending funds:", error);
                alert("Failed to send funds. Check console for details.");
            }
        });
    }
});
