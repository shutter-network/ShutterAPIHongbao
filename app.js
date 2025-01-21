import { registerPasskey } from "./wallet.js";
import { authenticateWallet } from "./wallet.js";

const NANOSHUTTER_API_BASE = 'https://nanoshutter.staging.shutter.network';

const GNOSIS_CHAIN_PARAMS = {
  chainId: '0x64', // Chain ID 100 in hexadecimal
  chainName: 'Gnosis Chain',
  rpcUrls: ['https://rpc.gnosis.gateway.fm'],
  nativeCurrency: {
    name: 'xDai',
    symbol: 'XDAI',
    decimals: 18,
  },
  blockExplorerUrls: ['https://gnosisscan.io/'],
};

const fallbackWeb3 = new Web3(GNOSIS_CHAIN_PARAMS.rpcUrls[0]);

if (typeof window.ethereum === 'undefined') {
  console.warn('MetaMask is not available. Using fallback provider for redemption.');
}

const web3 = new Web3(window.ethereum);

/*************************************************
 * HELPER: Ensure Gnosis chain
 ************************************************/
async function ensureGnosisChain() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is required to create a Hongbao.');
  }
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== GNOSIS_CHAIN_PARAMS.chainId) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: GNOSIS_CHAIN_PARAMS.chainId }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [GNOSIS_CHAIN_PARAMS],
          });
        } else {
          throw switchError;
        }
      }
    }
  } catch (error) {
    console.error('Failed to switch to Gnosis Chain:', error);
    throw error;
  }
}

/*************************************************
 * HELPER: Connect to MetaMask
 ************************************************/
async function connectMetaMask() {
  try {
    await ensureGnosisChain();
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log('MetaMask connected:', accounts[0]);
    return accounts[0];
  } catch (error) {
    console.error('MetaMask connection failed:', error);
    alert('Failed to connect MetaMask. Please try again.');
    throw error;
  }
}

/*************************************************
 * HELPER: Copy to clipboard
 ************************************************/
function copyToClipboard(text) {
  const tempInput = document.createElement('input');
  tempInput.style.position = 'absolute';
  tempInput.style.left = '-9999px';
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand('copy');
  document.body.removeChild(tempInput);
  alert('Link copied to clipboard!');
}
document.getElementById('hongbao-link').addEventListener('click', (event) => {
  const link = event.target.textContent.replace('Share this link: ', '');
  copyToClipboard(link);
});

/*************************************************
 * HELPER: AES Encrypt/Decrypt with password
 ************************************************/
async function encryptWithPassword(data, password) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("shutter_hongbao_salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encoder.encode(data)
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

async function decryptWithPassword(encryptedData, password, iv) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("shutter_hongbao_salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)) },
    derivedKey,
    Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))
  );

  return decoder.decode(decrypted);
}

/*************************************************
 * HELPER: Calculate release time
 ************************************************/
function calculateReleaseTimestamp() {
  const unlockTimeSelect = document.getElementById("unlock-time");
  const selectedOption = unlockTimeSelect.value;
  
  if (selectedOption === "custom") {
    const customTimestampInput = document.getElementById("custom-timestamp").value;
    if (!customTimestampInput) {
      alert("Please select a valid custom timestamp.");
      throw new Error("Invalid custom timestamp.");
    }
    return Math.floor(new Date(customTimestampInput).getTime() / 1000);
  }

  if (selectedOption === "lunar-new-year") {
    // Lunar New Year timestamp for 2025 in UTC
    return Math.floor(new Date("2025-01-29T12:36:00Z").getTime() / 1000);
  }

  // Predefined time options in seconds
  return Math.floor(Date.now() / 1000) + parseInt(selectedOption, 10);
}

/*************************************************
 * SENDER: Create Hongbao w/ MetaMask
 ************************************************/
async function sendHongbao(amount) {
  try {
    const senderAccount = await connectMetaMask();
    const releaseTimestamp = calculateReleaseTimestamp();

    const newAccount = web3.eth.accounts.create();
    const privateKey = newAccount.privateKey;
    const recipientAddress = newAccount.address;

    const password = document.getElementById("hongbao-password").value.trim();

    const detailsElement = document.getElementById("hongbao-details");
    const linkElement = document.getElementById("hongbao-link");
    const hongbaoVisual = document.getElementById("hongbao-visual");

    detailsElement.textContent = "Requesting encryption key from Shutter...";
    detailsElement.classList.remove("hidden");

    // 1) Register identity on mainnet
    const identityPrefixHex = "0x" + crypto
      .getRandomValues(new Uint8Array(32))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
    const registrationData = await registerShutterIdentity(releaseTimestamp, identityPrefixHex);
    const finalIdentity = registrationData.message.identity;

    // 2) Get encryption data
    const encryptionData = await getShutterEncryptionData(senderAccount, identityPrefixHex);
    const actualEncryptionData = encryptionData.message;

    // 3) Encrypt ephemeral privateKey with BLST
    let shutterEncryptedKey = await shutterEncryptPrivateKey(privateKey, actualEncryptionData);

    // 4) Optionally password-encrypt that
    if (password) {
      const passwordEncrypted = await encryptWithPassword(shutterEncryptedKey, password);
      shutterEncryptedKey = JSON.stringify(passwordEncrypted);
    }

    // 5) Construct link
    const link = `${window.location.origin}/ShutterAPIHongbao/#redeem?key=${encodeURIComponent(
      shutterEncryptedKey
    )}&timestamp=${releaseTimestamp}&amount=${amount}&protected=${!!password}&identity=${finalIdentity}`;

    detailsElement.innerHTML = `
      Identity registered successfully with Shutter!<br>
      One-time-use private key was created and funded.<br>
      Shutter Keypers provided the encryption key for the Hongbao.<br>
      Funds are locked until: <strong>${new Date(releaseTimestamp * 1000).toLocaleString()}</strong>
    `;
    linkElement.textContent = `Share this link: ${link}`;
    linkElement.classList.remove("hidden");

    // 6) Fund ephemeral address
    const hongbaoAmountWei = web3.utils.toWei(amount.toString(), "ether");
    await web3.eth.sendTransaction({
      from: senderAccount,
      to: recipientAddress,
      value: hongbaoAmountWei,
    });

    hongbaoVisual.classList.remove("hidden");
    hongbaoVisual.classList.add("sealed");

    alert("Hongbao created successfully! Share the link with the recipient.");
  } catch (error) {
    console.error("Error creating Hongbao:", error);
    alert("Failed to create Hongbao.");
  }
}

/*************************************************
 * SENDER: Create Hongbao w/ Passkey
 ************************************************/
async function fundHongbaoWithPasskey(amount) {
  try {
    const wallet = await authenticateWallet(); // Passkey-based wallet
    console.log("Passkey Wallet Address:", wallet.address);

    const provider = new ethers.JsonRpcProvider(GNOSIS_CHAIN_PARAMS.rpcUrls[0]);
    const walletWithProvider = wallet.connect(provider);

    const releaseTimestamp = calculateReleaseTimestamp();

    const newAccount = ethers.Wallet.createRandom();
    const privateKey = newAccount.privateKey;
    const recipientAddress = newAccount.address;

    const password = document.getElementById("hongbao-password").value.trim();

    const detailsElement = document.getElementById("hongbao-details");
    const linkElement = document.getElementById("hongbao-link");
    const hongbaoVisual = document.getElementById("hongbao-visual");

    detailsElement.textContent = "Requesting encryption key from Shutter...";
    detailsElement.classList.remove("hidden");

    // 1) Register identity on mainnet
    const identityPrefixHex = "0x" + crypto
      .getRandomValues(new Uint8Array(32))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
    const registrationData = await registerShutterIdentity(releaseTimestamp, identityPrefixHex);
    const finalIdentity = registrationData.message.identity;

    // 2) Get encryption data
    const encryptionData = await getShutterEncryptionData(wallet.address, identityPrefixHex);
    const actualEncryptionData = encryptionData.message;

    // 3) Encrypt ephemeral privateKey with BLST
    let shutterEncryptedKey = await shutterEncryptPrivateKey(privateKey, actualEncryptionData);

    // 4) Optional password encrypt
    if (password) {
      const passwordEncrypted = await encryptWithPassword(shutterEncryptedKey, password);
      shutterEncryptedKey = JSON.stringify(passwordEncrypted);
    }

    const link = `${window.location.origin}/ShutterAPIHongbao/#redeem?key=${encodeURIComponent(
      shutterEncryptedKey
    )}&timestamp=${releaseTimestamp}&amount=${amount}&protected=${!!password}&identity=${finalIdentity}`;

    detailsElement.innerHTML = `
      Identity registered successfully with Shutter!<br>
      One-time-use private key was created and funded.<br>
      Shutter Keypers provided the encryption key for the Hongbao.<br>
      Funds are locked until: <strong>${new Date(releaseTimestamp * 1000).toLocaleString()}</strong>
    `;
    linkElement.textContent = `Share this link: ${link}`;
    linkElement.classList.remove("hidden");

    // 5) Estimate gas + fund ephemeral address
    const hongbaoAmountWei = ethers.parseEther(amount.toString());
    const gasPrice = await provider.send("eth_gasPrice", []);
    const gasLimitEstimate = await provider.estimateGas({
      from: wallet.address,
      to: recipientAddress,
      value: hongbaoAmountWei,
    });
    const gasLimit = BigInt(gasLimitEstimate);
    const gasCost = BigInt(gasPrice) * gasLimit;

    const walletBalance = BigInt(await provider.getBalance(wallet.address));
    if (walletBalance < hongbaoAmountWei + gasCost) {
      const formattedGasCost = ethers.formatEther(gasCost);
      const formattedRequired = ethers.formatEther(hongbaoAmountWei + gasCost);
      const formattedBalance = ethers.formatEther(walletBalance);

      alert(`Insufficient funds. Required: ${formattedRequired} XDAI (includes ${formattedGasCost} for gas). Available: ${formattedBalance} XDAI.`);
      return;
    }

    const tx = await walletWithProvider.sendTransaction({
      to: recipientAddress,
      value: hongbaoAmountWei,
      gasLimit: gasLimit,
      gasPrice: BigInt(gasPrice),
    });

    console.log("Transaction sent:", tx.hash);

    hongbaoVisual.classList.remove("hidden");
    hongbaoVisual.classList.add("sealed");

    alert("Hongbao funded successfully! Share the link with the recipient.");
  } catch (error) {
    console.error("Error funding Hongbao with Passkey Wallet:", error);
    alert("Failed to fund Hongbao with Passkey Wallet.");
  }
}

/*************************************************
 * RECEIVER: Redeem + Sweep (MetaMask)
 ************************************************/
async function redeemHongbaoAndSweep(encryptedKey, timestamp, amount) {
  try {
    await ensureGnosisChain();

    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < timestamp) {
      alert(`Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}`);
      return;
    }

    const detailsElement = document.getElementById("redemption-details");
    const hongbaoVisual = document.getElementById("hongbao-visual-redeem");
    const resultElement = document.getElementById("redeem-result");

    detailsElement.innerHTML = "Checking for password protection...<br>";
    detailsElement.classList.remove("hidden");

    let decryptedKey = encryptedKey;

    // 1) If user typed a raw privateKey
    const keyField = document.getElementById("hongbao-key").value;
    if (keyField.startsWith("0x") && keyField.length === 66) {
      decryptedKey = keyField;
    } else {
      // 2) If protected, do password decryption
      const isProtected = new URLSearchParams(window.location.search).get("protected") === "true";
      if (isProtected) {
        const password = document.getElementById("redeem-password").value.trim();
        if (!password) {
          alert("Password is required to decrypt this Hongbao.");
          return;
        }
        try {
          const encryptedObject = JSON.parse(decryptedKey);
          decryptedKey = await decryptWithPassword(
            encryptedObject.encrypted,
            password,
            encryptedObject.iv
          );
        } catch (error) {
          alert("Invalid password. Unable to decrypt Hongbao.");
          return;
        }
      }

      // 3) If it starts "0x03", do local BLST decrypt
      if (decryptedKey.startsWith("0x03") && decryptedKey.length > 66) {
        const urlParams = new URLSearchParams(window.location.hash.split("?")[1]);
        const identityParam = urlParams.get("identity");
        if (!identityParam) {
          alert("Missing Shutter identity. Cannot complete final decryption.");
          return;
        }

        const finalKey = await getShutterDecryptionKey(identityParam);
        decryptedKey = await shutterDecryptPrivateKey(decryptedKey, finalKey);

        detailsElement.innerHTML += `
          Shutter Keypers generated the decryption key.<br>
          Decryption key: <strong>${decryptedKey}</strong><br>
          Decryption successful!<br>
        `;

        document.getElementById("hongbao-key").value = decryptedKey;
      }
    }

    // 4) Use the fully decrypted key to sweep
    const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(decryptedKey);
    fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);

    const balance = BigInt(await fallbackWeb3.eth.getBalance(hongbaoAccount.address));
    if (balance === BigInt(0)) {
      alert("No funds available to sweep.");
      detailsElement.innerHTML += "No funds available to sweep.";
      return;
    }

    const gasPrice = BigInt(await fallbackWeb3.eth.getGasPrice());
    const gasLimit = BigInt(21000);
    const gasCost = gasPrice * gasLimit;

    if (balance <= gasCost) {
      alert("Insufficient funds to cover gas fees.");
      detailsElement.innerHTML += "Insufficient funds to cover gas fees.";
      return;
    }

    const receiverAccount = await connectMetaMask();
    const tx = {
      from: hongbaoAccount.address,
      to: receiverAccount,
      value: (balance - gasCost).toString(),
      gas: 21000,
      gasPrice: gasPrice.toString(),
    };

    detailsElement.innerHTML += `
      Amount gifted: <strong>${amount} XDAI</strong><br>
      Signing transaction and sending funds...<br>
      Pending transaction confirmation...<br>
    `;
    const signedTx = await hongbaoAccount.signTransaction(tx);
    await fallbackWeb3.eth.sendSignedTransaction(signedTx.rawTransaction);

    resultElement.innerHTML = `
      Funds swept to your wallet: <strong>${receiverAccount}</strong><br>
      <a href="wallet.html" target="_blank">Manage Wallet</a>
    `;
    resultElement.classList.remove("hidden");
    hongbaoVisual.classList.add("opened");

    detailsElement.innerHTML += "Transaction confirmed! Funds successfully transferred.";
    alert(`Hongbao redeemed! Funds have been transferred to your wallet: ${receiverAccount}`);
  } catch (error) {
    console.error("Error redeeming and sweeping Hongbao:", error);
    alert("Failed to redeem or sweep Hongbao.");
  }
}

/*************************************************
 * RECEIVER: Redeem w/ New or Existing Passkey
 ************************************************/
async function claimToNewWallet(encryptedKey, timestamp, amount) {
  try {
    const wallet = await registerPasskey("My New Hongbao Wallet");
    console.log("New Passkey Wallet Address:", wallet.address);

    await redeemHongbaoWithWallet(encryptedKey, timestamp, amount, wallet);
    alert(`A new wallet was created, funds claimed to: ${wallet.address}`);
  } catch (error) {
    console.error("Error claiming to a new wallet:", error);
    alert("Failed to claim Hongbao to a new wallet.");
  }
}

async function claimToExistingWallet(encryptedKey, timestamp, amount) {
  try {
    const wallet = await authenticateWallet();
    console.log("Existing Passkey Wallet Address:", wallet.address);

    await redeemHongbaoWithWallet(encryptedKey, timestamp, amount, wallet);
  } catch (error) {
    console.error("Error claiming to an existing wallet:", error);
    alert("Failed to claim Hongbao to an existing wallet.");
  }
}

/*************************************************
 * RECEIVER: Redeem + Sweep to Passkey
 ************************************************/
async function redeemHongbaoWithWallet(encryptedKey, timestamp, amount, wallet) {
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < timestamp) {
      alert(`Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}`);
      return;
    }

    const detailsElement = document.getElementById("redemption-details");
    const hongbaoVisual = document.getElementById("hongbao-visual-redeem");
    const resultElement = document.getElementById("redeem-result");

    detailsElement.innerHTML = "Checking for password protection...<br>";
    detailsElement.classList.remove("hidden");

    let fullyEncryptedKey = encryptedKey; // never a plain PK

    // 1) If link says protected=true, do AES decrypt
    const isProtected = new URLSearchParams(window.location.search).get("protected") === "true";
    if (isProtected) {
      const password = document.getElementById("redeem-password").value.trim();
      if (!password) {
        alert("Password is required to decrypt this Hongbao.");
        return;
      }
      try {
        const encryptedObject = JSON.parse(fullyEncryptedKey);
        fullyEncryptedKey = await decryptWithPassword(
          encryptedObject.encrypted,
          password,
          encryptedObject.iv
        );
      } catch (error) {
        alert("Invalid password. Unable to decrypt Hongbao.");
        return;
      }
    }

    // 2) Now we should have the raw BLST ciphertext
    const urlParams = new URLSearchParams(window.location.hash.split("?")[1]);
    const identityParam = urlParams.get("identity");
    if (!identityParam) {
      alert("Missing Shutter identity. Cannot complete final decryption.");
      return;
    }

    const finalKey = await getShutterDecryptionKey(identityParam);

    // 3) Locally BLST-decrypt
    const decryptedPrivateKey = await shutterDecryptPrivateKey(fullyEncryptedKey, finalKey);

    detailsElement.innerHTML += `
      Shutter Keypers generated the decryption key.<br>
      Decryption key: <strong>${decryptedPrivateKey}</strong><br>
      Decryption successful!<br>
    `;
    document.getElementById("hongbao-key").value = decryptedPrivateKey;

    // 4) Sweep to passkey wallet
    const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(decryptedPrivateKey);
    fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);

    const balance = BigInt(await fallbackWeb3.eth.getBalance(hongbaoAccount.address));
    if (balance === BigInt(0)) {
      alert("No funds available to sweep.");
      detailsElement.innerHTML += "No funds available to sweep.";
      return;
    }

    const gasPrice = BigInt(await fallbackWeb3.eth.getGasPrice());
    const gasLimit = BigInt(21000);
    const gasCost = gasPrice * gasLimit;
    if (balance <= gasCost) {
      alert("Insufficient funds to cover gas fees.");
      detailsElement.innerHTML += "Insufficient funds to cover gas fees.";
      return;
    }

    const tx = {
      from: hongbaoAccount.address,
      to: wallet.address,
      value: (balance - gasCost).toString(),
      gas: 21000,
      gasPrice: gasPrice.toString(),
      chainId: parseInt(GNOSIS_CHAIN_PARAMS.chainId, 16),
    };

    detailsElement.innerHTML += `
      Amount gifted: <strong>${amount} XDAI</strong><br>
      Signing transaction and sending funds...<br>
      Pending transaction confirmation...<br>
    `;
    const signedTx = await hongbaoAccount.signTransaction(tx);
    await fallbackWeb3.eth.sendSignedTransaction(signedTx.rawTransaction);

    resultElement.innerHTML = `
      Funds swept to your wallet: <strong>${wallet.address}</strong><br>
      <a href="wallet.html" target="_blank">Manage Wallet</a>
    `;
    resultElement.classList.remove("hidden");
    hongbaoVisual.classList.add("opened");

    detailsElement.innerHTML += "Transaction confirmed! Funds successfully transferred.";
    alert(`Hongbao redeemed! Funds have been transferred to your wallet: ${wallet.address}`);
  } catch (error) {
    console.error("Error redeeming Hongbao with Passkey Wallet:", error);
    alert("Failed to redeem Hongbao with the specified wallet.");
  }
}

/*************************************************
 * HELPER: Populate fields from URL
 ************************************************/
async function populateFieldsFromHash() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash.split("?")[1]);
  const encryptedKey = params.get("key");
  const timestamp = params.get("timestamp");
  const amount = params.get("amount");

  const senderSection = document.getElementById("sender-section");
  const receiverSection = document.getElementById("receiver-section");
  const hongbaoVisual = document.getElementById("hongbao-visual-redeem");
  const detailsElement = document.getElementById("redemption-details");
  const claimNewWalletButton = document.getElementById("redeem-new-wallet");
  const toggleOtherOptionsButton = document.getElementById("toggle-other-options");

  senderSection.classList.add("hidden");
  receiverSection.classList.add("hidden");

  if (encryptedKey && timestamp && amount) {
    receiverSection.classList.remove("hidden");
    document.getElementById("hongbao-key").value = encryptedKey;
    document.getElementById("hongbao-timestamp").value = timestamp;
    document.getElementById("redeem-hongbao").setAttribute("data-amount", amount);
    hongbaoVisual.classList.remove("hidden");

    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime >= parseInt(timestamp, 10)) {
      document.getElementById("countdown").textContent = "Hongbao is now available!";
      if (claimNewWalletButton) claimNewWalletButton.classList.remove("hidden");
      if (toggleOtherOptionsButton) toggleOtherOptionsButton.classList.remove("hidden");
    } else {
      startCountdown(parseInt(timestamp, 10));
    }

    detailsElement.textContent = "Checking Hongbao status...";
    detailsElement.classList.remove("hidden");

    try {
      const identityParam = params.get("identity");
      if (!identityParam) {
        throw new Error("No identity found in URL. Cannot check or decrypt Hongbao.");
      }

      // If "pure" Shutter ciphertext
      if (encryptedKey.startsWith("0x03") && encryptedKey.length > 66) {
        const finalKey = await getShutterDecryptionKey(identityParam);
        const ephemeralPrivateKey = await shutterDecryptPrivateKey(encryptedKey, finalKey);

        const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(ephemeralPrivateKey);
        fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);

        await checkHongbaoBalance(hongbaoAccount.address, amount);
      } else {
        detailsElement.innerHTML = "Shutter ciphertext might be password-protected, or still locked.";
      }
    } catch (error) {
      console.error("Error retrieving or decrypting key with Shutter API:", error);
      detailsElement.textContent = "The Hongbao might still be locked or password-protected.";
    }
  } else {
    senderSection.classList.remove("hidden");
  }

  handlePasswordVisibility();
}

/*************************************************
 * HELPER: Show/hide password field if needed
 ************************************************/
function handlePasswordVisibility() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash.split("?")[1]);
  const isProtected = params.get("protected") === "true";

  const passwordContainer = document.getElementById("password-container");
  if (isProtected) {
    passwordContainer.classList.remove("hidden");
  } else {
    passwordContainer.classList.add("hidden");
  }
}

/*************************************************
 * HELPER: Check ephemeral address balance
 ************************************************/
async function checkHongbaoBalance(hongbaoAccountAddress, expectedAmount) {
  const detailsElement = document.getElementById("redemption-details");
  try {
    const balance = BigInt(await fallbackWeb3.eth.getBalance(hongbaoAccountAddress));
    if (balance === BigInt(0)) {
      detailsElement.innerHTML = "<strong>Status:</strong> This Hongbao has already been claimed.";
    } else {
      const formattedBalance = fallbackWeb3.utils.fromWei(balance.toString(), "ether");
      detailsElement.innerHTML = `<strong>Status:</strong> Hongbao available! Balance: ${formattedBalance} XDAI (Expected: ${expectedAmount} XDAI)`;
    }
  } catch (error) {
    console.error("Error checking Hongbao balance:", error);
    detailsElement.textContent = "Error retrieving balance. Please try again later.";
  }
}

/*************************************************
 * HELPER: Check if WeChat
 ************************************************/
function isWeChatBrowser() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("micromessenger");
}

/*************************************************
 * HELPER: Countdown for locked Hongbao
 ************************************************/
function startCountdown(timestamp) {
  const countdownElement = document.getElementById("countdown");
  const claimNewWalletButton = document.getElementById("redeem-new-wallet");
  const toggleOtherOptionsButton = document.getElementById("toggle-other-options");
  const otherClaimOptionsDiv = document.getElementById("other-claim-options");

  if (claimNewWalletButton) claimNewWalletButton.classList.add("hidden");
  if (toggleOtherOptionsButton) toggleOtherOptionsButton.classList.add("hidden");
  if (otherClaimOptionsDiv) otherClaimOptionsDiv.classList.add("hidden");

  const interval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = timestamp - now;

    if (secondsLeft <= 0) {
      clearInterval(interval);
      countdownElement.textContent = "Hongbao is now available!";
      if (claimNewWalletButton) claimNewWalletButton.classList.remove("hidden");
      if (toggleOtherOptionsButton) toggleOtherOptionsButton.classList.remove("hidden");
      return;
    }

    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;

    countdownElement.textContent = `${hours}h ${minutes}m ${seconds}s remaining.`;
  }, 1000);
}

/*************************************************
 * DOM Loaded: run populateFieldsFromHash + events
 ************************************************/
document.addEventListener('DOMContentLoaded', () => {
  if (isWeChatBrowser()) {
    document.body.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h2>Shutterized Hongbao - Unsupported Browser</h2>
        <p>Open in a real browser. WeChat isn't supported.</p>
      </div>
    `;
  }

  // Switch from "receiver" to "sender"
  const createOwnHongbaoButton = document.getElementById('create-own-hongbao');
  if (createOwnHongbaoButton) {
    createOwnHongbaoButton.addEventListener('click', () => {
      document.getElementById('receiver-section').classList.add('hidden');
      document.getElementById('sender-section').classList.remove('hidden');
      document.querySelector('.title').textContent = '🎁 Hongbao Gifting DApp';
    });
  }

  // Create Hongbao w/ MetaMask
  const createHongbaoButton = document.getElementById('create-hongbao');
  if (createHongbaoButton) {
    createHongbaoButton.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('hongbao-amount').value);
      await sendHongbao(amount);
    });
  }

  // Create Hongbao w/ Passkey
  const createHongbaoWithPasskeyButton = document.getElementById('create-hongbao-with-passkey');
  if (createHongbaoWithPasskeyButton) {
    createHongbaoWithPasskeyButton.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('hongbao-amount').value);
      if (!amount || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
      }
      await fundHongbaoWithPasskey(amount);
    });
  }

  // Redeem w/ MetaMask
  const redeemHongbaoButton = document.getElementById('redeem-hongbao');
  if (redeemHongbaoButton) {
    redeemHongbaoButton.addEventListener('click', () => {
      const encryptedKey = document.getElementById('hongbao-key').value;
      const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
      const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
      redeemHongbaoAndSweep(encryptedKey, timestamp, amount);
    });
  }

  // Redeem -> New Passkey
  const redeemNewWalletButton = document.getElementById('redeem-new-wallet');
  if (redeemNewWalletButton) {
    redeemNewWalletButton.addEventListener('click', () => {
      const encryptedKey = document.getElementById('hongbao-key').value;
      const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
      const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
      claimToNewWallet(encryptedKey, timestamp, amount);
    });
  }

  // Redeem -> Existing Passkey
  const redeemExistingWalletButton = document.getElementById('redeem-existing-wallet');
  if (redeemExistingWalletButton) {
    redeemExistingWalletButton.addEventListener('click', () => {
      const encryptedKey = document.getElementById('hongbao-key').value;
      const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
      const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
      claimToExistingWallet(encryptedKey, timestamp, amount);
    });
  }

  // Toggle other claim options
  const toggleOtherOptionsButton = document.getElementById("toggle-other-options");
  const otherClaimOptions = document.getElementById("other-claim-options");
  toggleOtherOptionsButton.addEventListener("click", () => {
    if (otherClaimOptions.classList.contains("hidden")) {
      otherClaimOptions.classList.remove("hidden");
      toggleOtherOptionsButton.textContent = "Hide Claiming Options";
    } else {
      otherClaimOptions.classList.add("hidden");
      toggleOtherOptionsButton.textContent = "Other Claiming Options";
    }
  });

  // Decrypt Password Button
  const decryptPasswordButton = document.getElementById('decrypt-password');
  if (decryptPasswordButton) {
    decryptPasswordButton.addEventListener('click', async () => {
      const encryptedKey = document.getElementById('hongbao-key').value;
      const password = document.getElementById('redeem-password').value.trim();
      const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);

      if (!password) {
        alert("Please enter a password.");
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime < timestamp) {
        alert(`The Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}.`);
        return;
      }

      try {
        const encryptedObject = JSON.parse(encryptedKey);
        const passwordDecryptedKey = await decryptWithPassword(
          encryptedObject.encrypted,
          password,
          encryptedObject.iv
        );

        if (!passwordDecryptedKey) {
          throw new Error("Decryption with the provided password failed.");
        }

        // Decrypt w/ Nanoshutter (you can ignore or remove if using local BLST only)
        const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
          encrypted_msg: passwordDecryptedKey,
          timestamp,
        });

        const finalDecryptedKey = decryptResponse.data.message;
        const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(finalDecryptedKey);
        fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);

        const amount = document.getElementById("redeem-hongbao").getAttribute("data-amount");
        await checkHongbaoBalance(hongbaoAccount.address, amount);

        // Update the "Encrypted Key" field w/ final PK
        document.getElementById("hongbao-key").value = finalDecryptedKey;

        alert("Successfully decrypted, checked balance, and updated the key!");
      } catch (error) {
        console.error("Error during decryption or balance check:", error);
        if (error.response && error.response.status === 403) {
          alert("The decryption key is not yet available. Please try again after the unlock time.");
        } else {
          alert("Failed to decrypt or check balance. Ensure the password and key are correct.");
        }
      }
    });
  }

  // Populate from URL
  populateFieldsFromHash();
});

// Make custom-timestamp visible if user chooses “custom”
document.getElementById("unlock-time").addEventListener("change", (event) => {
  const customTimestampContainer = document.getElementById("custom-timestamp-container");
  customTimestampContainer.classList.toggle("hidden", event.target.value !== "custom");
});
