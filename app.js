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


// Connect MetaMask wallet
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

// Copy to clipboard functionality
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


// AES Encryption using Web Crypto API
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

// AES Decryption using Web Crypto API
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

    // 1) Register or ensure your identity on Shutter
    const identityPrefixHex = "0x" + crypto
      .getRandomValues(new Uint8Array(32))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");

    const registrationData = await registerShutterIdentity(releaseTimestamp, identityPrefixHex);
    // Unwrap the real identity
    const finalIdentity = registrationData.message.identity;

    // 2) Get encryption data (eon_key, identity, etc.)
    const encryptionData = await getShutterEncryptionData(senderAccount, identityPrefixHex);
    // Unwrap the actual encryption fields
    const actualEncryptionData = encryptionData.message;

    // 3) Encrypt the privateKey with BLST
    let shutterEncryptedKey = await shutterEncryptPrivateKey(privateKey, actualEncryptionData);

    // 4) Optionally password-encrypt the BLST ciphertext
    if (password) {
      const passwordEncrypted = await encryptWithPassword(shutterEncryptedKey, password);
      shutterEncryptedKey = JSON.stringify(passwordEncrypted);
    }

    // 5) Construct the link
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

    // 6) Fund the ephemeral address
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

    // 1) Register identity with Shutter
    const identityPrefixHex = "0x" + crypto
      .getRandomValues(new Uint8Array(32))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
    const registrationData = await registerShutterIdentity(releaseTimestamp, identityPrefixHex);
    const finalIdentity = registrationData.message.identity;

    // 2) Get encryption data
    const encryptionData = await getShutterEncryptionData(wallet.address, identityPrefixHex);
    const actualEncryptionData = encryptionData.message;

    // 3) Encrypt privateKey with BLST
    let shutterEncryptedKey = await shutterEncryptPrivateKey(privateKey, actualEncryptionData);

    // 4) Optionally AES-encrypt with user password
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

    // 5) Estimate gas and send transaction
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

      alert(`Insufficient funds to fund the Hongbao. 
        Required: ${formattedRequired} xDAI (includes ${formattedGasCost} xDAI for gas). 
        Available: ${formattedBalance} xDAI.`);
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

    // 1) If user manually typed a fully decrypted key
    const keyField = document.getElementById("hongbao-key").value;
    if (keyField.startsWith("0x") && keyField.length === 66) {
      decryptedKey = keyField;
    } else {
      // 2) If link says protected=true, do password-based AES decryption first
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
          alert("Invalid password. Unable to decrypt the Hongbao.");
          return;
        }
      }

      // 3) Check if we still have BLST ciphertext (e.g., starts with "0x03").
      //    If it's clearly a normal private key already (66 chars), skip local BLST.
      if (
        decryptedKey.startsWith("0x03") && // BLST version byte
        decryptedKey.length > 66           // Enough length to be ciphertext
      ) {
        const urlParams = new URLSearchParams(window.location.hash.split("?")[1]);
        const identityParam = urlParams.get("identity");
        if (!identityParam) {
          alert("Missing Shutter identity. Cannot complete final decryption.");
          return;
        }

        const finalKey = await getShutterDecryptionKey(identityParam);

        // Locally decrypt the BLST ciphertext with finalKey
        decryptedKey = await shutterDecryptPrivateKey(decryptedKey, finalKey);

        detailsElement.innerHTML += `
          Shutter Keypers generated the decryption key.<br>
          Decryption key: <strong>${decryptedKey}</strong><br>
          Decryption successful!<br>
        `;

        document.getElementById("hongbao-key").value = decryptedKey;
      }
    }

    // 4) Use the fully decrypted key to sweep the funds
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





async function claimToNewWallet(encryptedKey, timestamp, amount) {
  try {
    const wallet = await registerPasskey("My New Hongbao Wallet"); // Create a new passkey wallet
    console.log("New Passkey Wallet Address:", wallet.address);

    // Proceed to redeem and sweep with the new wallet
    await redeemHongbaoWithWallet(encryptedKey, timestamp, amount, wallet);
    alert(`A new wallet was created successfully, and funds were claimed to: ${wallet.address}`);
  } catch (error) {
    console.error("Error claiming to a new wallet:", error);
    alert("Failed to claim Hongbao to a new wallet.");
  }
}

async function claimToExistingWallet(encryptedKey, timestamp, amount) {
  try {
    const wallet = await authenticateWallet(); // Authenticate an existing wallet
    console.log("Existing Passkey Wallet Address:", wallet.address);

    // Proceed to redeem and sweep with the existing wallet
    await redeemHongbaoWithWallet(encryptedKey, timestamp, amount, wallet);
  } catch (error) {
    console.error("Error claiming to an existing wallet:", error);
    alert("Failed to claim Hongbao to an existing wallet.");
  }
}
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

    let fullyEncryptedKey = encryptedKey; // This is never a plain private key.

    // 1) If the link says "protected=true", do password-based AES decryption first
    const isProtected = new URLSearchParams(window.location.search).get("protected") === "true";
    if (isProtected) {
      const password = document.getElementById("redeem-password").value.trim();
      if (!password) {
        alert("Password is required to decrypt this Hongbao.");
        return;
      }

      try {
        // The key is JSON: { encrypted, iv }
        const encryptedObject = JSON.parse(fullyEncryptedKey);
        fullyEncryptedKey = await decryptWithPassword(
          encryptedObject.encrypted,
          password,
          encryptedObject.iv
        );
      } catch (error) {
        alert("Invalid password. Unable to decrypt the Hongbao.");
        return;
      }
    }

    // 2) Now `fullyEncryptedKey` should be the raw Shutter ciphertext
    //    (i.e., output from shutterEncryptPrivateKey()).
    const urlParams = new URLSearchParams(window.location.hash.split("?")[1]);
    const identityParam = urlParams.get("identity");
    if (!identityParam) {
      alert("Missing Shutter identity. Cannot complete final decryption.");
      return;
    }

    const finalKey = await getShutterDecryptionKey(identityParam);

    // 3) Locally decrypt the Shutter ciphertext with finalKey (BLST)
    //    We assume it's always Shutter-encrypted, never a plain PK.
    const decryptedPrivateKey = await shutterDecryptPrivateKey(fullyEncryptedKey, finalKey);

    detailsElement.innerHTML += `
      Shutter Keypers generated the decryption key.<br>
      Decryption key: <strong>${decryptedPrivateKey}</strong><br>
      Decryption successful!<br>
    `;

    // Update the UI field to show the final plain PK
    document.getElementById("hongbao-key").value = decryptedPrivateKey;

    // 4) Sweep to the passkey wallet
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

async function populateFieldsFromHash() {
  console.log("=== populateFieldsFromHash: Start ===");

  const hash = window.location.hash.substring(1);
  console.log("hash:", hash);

  const [_, queryString] = hash.split("?");
  const params = new URLSearchParams(queryString);
  const encryptedKey = params.get("key");
  const timestamp = params.get("timestamp");
  const amount = params.get("amount");
  const identityParam = params.get("identity");
  const isProtected = params.get("protected") === "true";

  console.log("Params found:", {
    encryptedKey,
    timestamp,
    amount,
    identityParam,
    isProtected,
  });

  const senderSection = document.getElementById("sender-section");
  const receiverSection = document.getElementById("receiver-section");
  const hongbaoVisual = document.getElementById("hongbao-visual-redeem");
  const detailsElement = document.getElementById("redemption-details");
  const claimNewWalletButton = document.getElementById("redeem-new-wallet");
  const toggleOtherOptionsButton = document.getElementById("toggle-other-options");

  // Hide both sections by default
  senderSection.classList.add("hidden");
  receiverSection.classList.add("hidden");

  // If no required params, show sender
  if (!encryptedKey || !timestamp || !amount) {
    console.log("No valid ShutterHongbao link found. Showing sender section.");
    senderSection.classList.remove("hidden");
    return;
  }

  // We have a valid link, so show receiver section
  receiverSection.classList.remove("hidden");
  document.getElementById("hongbao-key").value = encryptedKey;
  document.getElementById("hongbao-timestamp").value = timestamp;
  document.getElementById("redeem-hongbao").setAttribute("data-amount", amount);
  hongbaoVisual.classList.remove("hidden");

  // If time is already up
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime >= parseInt(timestamp, 10)) {
    console.log("Time is up, Hongbao is available immediately.");
    document.getElementById("countdown").textContent = "Hongbao is now available!";
    if (claimNewWalletButton) claimNewWalletButton.classList.remove("hidden");
    if (toggleOtherOptionsButton) toggleOtherOptionsButton.classList.remove("hidden");
  } else {
    // Otherwise start a countdown
    console.log("Time not up yet. Starting countdown...");
    startCountdown(parseInt(timestamp, 10));
  }

  detailsElement.textContent = "Checking Hongbao status...";
  detailsElement.classList.remove("hidden");

  // Proceed to attempt final or partial decryption
  try {
    console.log("Checking identityParam:", identityParam);
    if (!identityParam) {
      console.error("No identity param found. Can't fetch final key.");
      throw new Error("No identity found in URL. Cannot check or decrypt Hongbao.");
    }

    // Step A: If it's password-protected, do local AES decryption
    let possiblyShutterCipher = encryptedKey;
    if (isProtected) {
      const passwordField = document.getElementById("redeem-password");
      if (!passwordField) {
        console.warn("No password field in DOM. Can't proceed to password decrypt.");
        detailsElement.innerHTML = "This Hongbao is password-protected. Please enter a password.";
        return;
      }
      const userPassword = passwordField.value.trim();
      console.log("User typed password:", userPassword ? "[REDACTED]" : "EMPTY");

      if (!userPassword) {
        console.warn("No password typed yet. Asking user to type it first.");
        detailsElement.innerHTML = "This Hongbao is password-protected. Enter a password to decrypt.";
        return;
      }

      try {
        console.log("Attempting password-based AES decryption...");
        const encryptedObject = JSON.parse(possiblyShutterCipher);
        possiblyShutterCipher = await decryptWithPassword(
          encryptedObject.encrypted,
          userPassword,
          encryptedObject.iv
        );
        console.log("Post-password data (possibly Shutter ciphertext):", possiblyShutterCipher);
      } catch (aesErr) {
        console.error("Password AES decryption failed:", aesErr);
        detailsElement.innerHTML = "Invalid password. Unable to decrypt the Hongbao.";
        return;
      }
    } else {
      console.log("Not password-protected. Data is presumably raw Shutter ciphertext or locked.");
    }

    // Step B: If it looks like Shutter ciphertext, do Shutter BLST decrypt
    if (possiblyShutterCipher.startsWith("0x03") && possiblyShutterCipher.length > 66) {
      console.log("Looks like Shutter ciphertext. Attempting final BLST decrypt...");
      const finalKey = await getShutterDecryptionKey(identityParam);
      console.log("Final Key retrieved from Shutter:", finalKey);

      console.log("Calling shutterDecryptPrivateKey with ciphertext:", possiblyShutterCipher);
      const ephemeralPrivateKey = await shutterDecryptPrivateKey(possiblyShutterCipher, finalKey);
      console.log("BLST decrypted ephemeralPrivateKey:", ephemeralPrivateKey);

      // Step C: Check ephemeral account balance
      const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(ephemeralPrivateKey);
      fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);

      console.log("Ephemeral account address:", hongbaoAccount.address);
      await checkHongbaoBalance(hongbaoAccount.address, amount);
    } else {
      console.warn("Not pure Shutter ciphertext or too short. Possibly locked or needs password.");
      detailsElement.innerHTML =
        "Shutter ciphertext might be password-protected, or not yet available. Enter password if needed.";
    }
  } catch (error) {
    console.error("Error retrieving or decrypting key with Shutter API:", error);
    detailsElement.textContent = "The Hongbao might still be locked or password-protected.";
  }

  // Always handle optional password field
  handlePasswordVisibility();
  console.log("=== populateFieldsFromHash: End ===");
}



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




async function checkHongbaoBalance(hongbaoAccountAddress, expectedAmount) {
  const detailsElement = document.getElementById("redemption-details");

  try {
    // Use fallbackWeb3 for the balance check
    const balance = BigInt(await fallbackWeb3.eth.getBalance(hongbaoAccountAddress));

    if (balance === BigInt(0)) {
      detailsElement.innerHTML = "<strong>Status:</strong> This Hongbao has already been claimed.";
    } else {
      const formattedBalance = fallbackWeb3.utils.fromWei(balance.toString(), "ether");
      detailsElement.innerHTML = `<strong>Status:</strong> Hongbao available! Current balance: ${formattedBalance} XDAI (Expected: ${expectedAmount} XDAI)`;
    }
  } catch (error) {
    console.error("Error checking Hongbao balance:", error);
    detailsElement.textContent = "Error retrieving balance. Please try again later.";
  }
}

function isWeChatBrowser() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("micromessenger");
}

// Countdown timer
function startCountdown(timestamp) {
  const countdownElement = document.getElementById("countdown");
  const claimNewWalletButton = document.getElementById("redeem-new-wallet");
  const toggleOtherOptionsButton = document.getElementById("toggle-other-options");
  const otherClaimOptionsDiv = document.getElementById("other-claim-options");

  // Initially hide claim buttons
  if (claimNewWalletButton) claimNewWalletButton.classList.add("hidden");
  if (toggleOtherOptionsButton) toggleOtherOptionsButton.classList.add("hidden");
  if (otherClaimOptionsDiv) otherClaimOptionsDiv.classList.add("hidden");

  const interval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = timestamp - now;

    if (secondsLeft <= 0) {
      clearInterval(interval);

      // Update the countdown text
      countdownElement.textContent = "Hongbao is now available!";

      // Show claim buttons
      if (claimNewWalletButton) claimNewWalletButton.classList.remove("hidden");
      if (toggleOtherOptionsButton) toggleOtherOptionsButton.classList.remove("hidden");
      return;
    }

    // Calculate time remaining
    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;

    countdownElement.textContent = `${hours}h ${minutes}m ${seconds}s remaining.`;
  }, 1000);
}


document.addEventListener('DOMContentLoaded', () => {
  // Event listeners for sender section

  if (isWeChatBrowser()) {
    document.body.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h2>Shutterized Hongbao - Unsupported Browser</h2>
        <p>Please press the 3 dots in the upper right and open it in your browser. Someone has gifted you a shutterized, threshold encrypted Hongbao! But this page works best in a real browser like Chrome or Safari.</p>
      </div>
    `;
  }


  const createOwnHongbaoButton = document.getElementById('create-own-hongbao');
  if (createOwnHongbaoButton) {
    createOwnHongbaoButton.addEventListener('click', () => {
      document.getElementById('receiver-section').classList.add('hidden');
      document.getElementById('sender-section').classList.remove('hidden');
      document.querySelector('.title').textContent = '🎁 Hongbao Gifting DApp';
    });
  }

  const createHongbaoButton = document.getElementById('create-hongbao');
  if (createHongbaoButton) {
    createHongbaoButton.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('hongbao-amount').value);
      await sendHongbao(amount);
    });
  }

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

  // Event listeners for receiver section
  const redeemHongbaoButton = document.getElementById('redeem-hongbao');
  if (redeemHongbaoButton) {
    redeemHongbaoButton.addEventListener('click', () => {
      const encryptedKey = document.getElementById('hongbao-key').value;
      const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
      const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
      redeemHongbaoAndSweep(encryptedKey, timestamp, amount);
    });
  }

  const redeemNewWalletButton = document.getElementById('redeem-new-wallet');
  if (redeemNewWalletButton) {
    redeemNewWalletButton.addEventListener('click', () => {
      const encryptedKey = document.getElementById('hongbao-key').value;
      const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
      const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
      claimToNewWallet(encryptedKey, timestamp, amount);
    });
  }

  const redeemExistingWalletButton = document.getElementById('redeem-existing-wallet');
  if (redeemExistingWalletButton) {
    redeemExistingWalletButton.addEventListener('click', () => {
      const encryptedKey = document.getElementById('hongbao-key').value;
      const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
      const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
      claimToExistingWallet(encryptedKey, timestamp, amount);
    });
  }




  // Toggle Other Claiming Options
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
        alert(`The Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}. Please wait until the unlock time.`);
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
  
        // Decrypt with Shutter
        const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
          encrypted_msg: passwordDecryptedKey,
          timestamp,
        });
  
        const finalDecryptedKey = decryptResponse.data.message;
        const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(finalDecryptedKey);
        fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);
  
        const amount = document.getElementById("redeem-hongbao").getAttribute("data-amount");
        await checkHongbaoBalance(hongbaoAccount.address, amount);
  
        // Update the "Encrypted Key" field with the decrypted private key
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
  

  populateFieldsFromHash();
});
document.getElementById("unlock-time").addEventListener("change", (event) => {
  const customTimestampContainer = document.getElementById("custom-timestamp-container");
  customTimestampContainer.classList.toggle("hidden", event.target.value !== "custom");
});
/*********************************************************************
 * NEW SHUTTER API FUNCTIONS (Gnosis Mainnet)
 *
 * These functions help you:
 *   - Register an identity/time-based trigger (with mainnet registry)
 *   - Get encryption data (with mainnet registry)
 *   - Locally encrypt using BLST (encryptDataBlst.js)
 *   - Retrieve the final decryption key (with mainnet registry)
 *   - Locally decrypt your private key (BLST-based)
 *
 * They call the new Shutter mainnet endpoint:
 *   https://shutter.api.staging.shutter.network/api
 *********************************************************************/

/**
 * Register a Shutter identity with a time-based decryption trigger
 * on the mainnet registry (0x228DefCF37Da29475F0EE2B9E4dfAeDc3b0746bc).
 *
 * @param {number} decryptionTimestamp - Unix timestamp for key release
 * @param {string} identityPrefixHex   - 32-byte prefix (0x...) for uniqueness
 * @returns {Promise<Object>}          - { message: { eon, eon_key, identity, ... } }
 */
async function registerShutterIdentity(decryptionTimestamp, identityPrefixHex) {
  try {
    // Provide the registry param in the request body
    const response = await axios.post(
      'https://shutter.api.staging.shutter.network/api/register_identity',
      {
        decryptionTimestamp,
        identityPrefix: identityPrefixHex,
        registry: "0x228DefCF37Da29475F0EE2B9E4dfAeDc3b0746bc"
      }
    );
    console.log('Shutter Identity Registration:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error registering Shutter identity:', error);
    throw error;
  }
}

/**
 * Fetch encryption info (eon public key, identity, etc.) from the mainnet registry.
 *
 * @param {string} userAddress        - (Unused now, we force the mainnet registry address)
 * @param {string} identityPrefixHex  - Same prefix from registration
 * @returns {Promise<Object>}         - { message: { eon_key, identity, ... } }
 */
async function getShutterEncryptionData(userAddress, identityPrefixHex) {
  try {
    // Force usage of the mainnet registry address
    const url =
      `https://shutter.api.staging.shutter.network/api/get_data_for_encryption?` +
      `address=0x228DefCF37Da29475F0EE2B9E4dfAeDc3b0746bc&identityPrefix=${identityPrefixHex}`;

    const response = await axios.get(url);
    console.log('Encryption Data:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching Shutter encryption data:', error);
    throw error;
  }
}

/**
 * Encrypt a private key using BLST-based encryption (encryptDataBlst.js).
 * Includes debug logs for argument validation.
 *
 * @param {string} privateKeyHex  - e.g. "0xabcdef1234..."
 * @param {Object} encryptionData - from getShutterEncryptionData().message -> { eon_key, identity, ... }
 * @param {string} [sigmaHex]     - Optional 32-byte "sigma" in hex
 * @returns {Promise<string>}     - Hex-encoded ciphertext from BLST
 */
async function shutterEncryptPrivateKey(privateKeyHex, encryptionData, sigmaHex) {
  console.log("=== shutterEncryptPrivateKey Debug ===");
  console.log("privateKeyHex:", privateKeyHex, "length:", privateKeyHex?.length);
  console.log("encryptionData.identity:", encryptionData?.identity, "length:", encryptionData?.identity?.length);
  console.log("encryptionData.eon_key:", encryptionData?.eon_key, "length:", encryptionData?.eon_key?.length);

  // Optionally generate a random 32-byte sigma if none provided
  const randomSigma = sigmaHex || "0x" + crypto
    .getRandomValues(new Uint8Array(32))
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');

  console.log("randomSigma:", randomSigma, "length:", randomSigma.length);

  if (!privateKeyHex || privateKeyHex.length < 66) {
    console.error("Private key is too short. Must be '0x' + 64 hex chars.");
  }
  if (!encryptionData.identity || encryptionData.identity.length < 66) {
    console.error("encryptionData.identity is missing or too short.");
  }
  if (!encryptionData.eon_key || encryptionData.eon_key.length < 66) {
    console.error("encryptionData.eon_key is missing or too short.");
  }

  try {
    const ciphertextHex = await window.shutter.encryptData(
      privateKeyHex,
      encryptionData.identity,
      encryptionData.eon_key,
      randomSigma
    );

    console.log("Shutter Encrypted PrivateKey (result):", ciphertextHex, "length:", ciphertextHex?.length);
    return ciphertextHex;
  } catch (e) {
    console.error("Error in BLST encryption:", e);
    throw e;
  }
}

/**
 * Retrieve the final epoch secret key from the mainnet registry after the time lock passes.
 *
 * @param {string} identityHex - The "identity" returned when registering
 * @returns {Promise<string>}   - Shutter's final "decryption_key" (0x...)
 */
async function getShutterDecryptionKey(identityHex) {
  try {
    // Also specify the registry param in the query string
    const url =
      `https://shutter.api.staging.shutter.network/api/get_decryption_key?` +
      `identity=${identityHex}&registry=0x228DefCF37Da29475F0EE2B9E4dfAeDc3b0746bc`;
    const response = await axios.get(url);
    console.log('Shutter Decryption Key:', response.data.message.decryption_key);
    return response.data.message.decryption_key;
  } catch (error) {
    console.error('Error retrieving Shutter decryption key:', error);
    throw error;
  }
}

/**
 * Locally decrypt the BLST-encrypted private key using the final epoch secret key.
 *
 * @param {string} encryptedHex       - The ciphertext from shutterEncryptPrivateKey()
 * @param {string} finalDecryptionKey - The epoch secret key from getShutterDecryptionKey()
 * @returns {Promise<string>}         - The decrypted privateKey (0x...)
 */
async function shutterDecryptPrivateKey(encryptedHex, finalDecryptionKey) {
  try {
    // Validate the BLST ciphertext starts with "0x03" and is long enough
    if (!encryptedHex || !encryptedHex.startsWith("0x03") || encryptedHex.length < 100) {
      console.error("shutterDecryptPrivateKey: Invalid BLST ciphertext:", encryptedHex);
      throw new Error("Expected valid BLST ciphertext (0x03...). Cannot decrypt.");
    }

    // Call your local BLST decryption from encryptDataBlst.js
    const decryptedHex = await window.shutter.decrypt(encryptedHex, finalDecryptionKey);
    console.log("Locally decrypted BLST private key:", decryptedHex);
    return decryptedHex;
  } catch (error) {
    console.error("Error decrypting private key:", error);
    throw error;
  }
}

