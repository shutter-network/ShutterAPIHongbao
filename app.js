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


async function sendHongbao(amount) {
  try {
    const senderAccount = await connectMetaMask();
    const releaseTimestamp = Math.floor(Date.now() / 1000) + 20; // Lock for 10 minutes

    const newAccount = web3.eth.accounts.create();
    const privateKey = newAccount.privateKey;
    const recipientAddress = newAccount.address;

    const password = document.getElementById("hongbao-password").value.trim();

    const detailsElement = document.getElementById("hongbao-details");
    const linkElement = document.getElementById("hongbao-link");
    const hongbaoVisual = document.getElementById("hongbao-visual");

    detailsElement.textContent = "Requesting encryption key from Shutter...";
    detailsElement.classList.remove("hidden");

    // Encrypt with Shutter
    const shutterResponse = await axios.post(`${NANOSHUTTER_API_BASE}/encrypt/with_time`, {
      cypher_text: privateKey,
      timestamp: releaseTimestamp,
    });

    let shutterEncryptedKey = shutterResponse.data.message;

    // Encrypt Shutter-encrypted key with password if provided
    if (password) {
      const passwordEncrypted = await encryptWithPassword(shutterEncryptedKey, password);
      shutterEncryptedKey = JSON.stringify(passwordEncrypted); // Combine encrypted data and IV
    }

    const link = `${window.location.origin}/ShutterHongbao/#redeem?key=${encodeURIComponent(shutterEncryptedKey)}&timestamp=${releaseTimestamp}&amount=${amount}&protected=${!!password}`;

    detailsElement.innerHTML = `
      Identity registered successfully with Shutter!<br>
      One-time-use private key was created and funded.<br>
      Shutter Keypers provided the encryption key for the Hongbao.<br>
      Funds are locked until: <strong>${new Date(releaseTimestamp * 1000).toLocaleString()}</strong>
    `;
    linkElement.textContent = `Share this link: ${link}`;
    linkElement.classList.remove("hidden");

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
    const wallet = await authenticateWallet(); // Authenticate and load the passkey wallet
    console.log("Passkey Wallet Address:", wallet.address);

    const provider = new ethers.JsonRpcProvider(GNOSIS_CHAIN_PARAMS.rpcUrls[0]);
    const walletWithProvider = wallet.connect(provider);

    const releaseTimestamp = Math.floor(Date.now() / 1000) + 20; // Lock for 10 minutes

    const newAccount = ethers.Wallet.createRandom();
    const privateKey = newAccount.privateKey;
    const recipientAddress = newAccount.address;

    const password = document.getElementById("hongbao-password").value.trim();

    const detailsElement = document.getElementById("hongbao-details");
    const linkElement = document.getElementById("hongbao-link");
    const hongbaoVisual = document.getElementById("hongbao-visual");

    detailsElement.textContent = "Requesting encryption key from Shutter...";
    detailsElement.classList.remove("hidden");

    // Encrypt with Shutter
    const shutterResponse = await axios.post(`${NANOSHUTTER_API_BASE}/encrypt/with_time`, {
      cypher_text: privateKey,
      timestamp: releaseTimestamp,
    });

    let shutterEncryptedKey = shutterResponse.data.message;

    // Encrypt Shutter-encrypted key with password if provided
    if (password) {
      const passwordEncrypted = await encryptWithPassword(shutterEncryptedKey, password);
      shutterEncryptedKey = JSON.stringify(passwordEncrypted); // Combine encrypted data and IV
    }

    const link = `${window.location.origin}/ShutterHongbao/#redeem?key=${encodeURIComponent(shutterEncryptedKey)}&timestamp=${releaseTimestamp}&amount=${amount}&protected=${!!password}`;

    detailsElement.innerHTML = `
      Identity registered successfully with Shutter!<br>
      One-time-use private key was created and funded.<br>
      Shutter Keypers provided the encryption key for the Hongbao.<br>
      Funds are locked until: <strong>${new Date(releaseTimestamp * 1000).toLocaleString()}</strong>
    `;
    linkElement.textContent = `Share this link: ${link}`;
    linkElement.classList.remove("hidden");

    const hongbaoAmountWei = ethers.parseEther(amount.toString());

    // Fetch gas price
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

    // Send transaction
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
    await ensureGnosisChain(); // Ensure the user is on the correct network

    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < timestamp) {
      alert(`Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}`);
      return;
    }

    const detailsElement = document.getElementById("redemption-details");
    const hongbaoVisual = document.getElementById("hongbao-visual-redeem");
    const resultElement = document.getElementById("redeem-result");

    detailsElement.textContent = "Checking for password protection...";
    detailsElement.classList.remove("hidden");

    let decryptedKey = encryptedKey;

    // Step 1: Use updated decrypted key from UI
    const keyField = document.getElementById("hongbao-key").value;
    if (keyField.startsWith("0x") && keyField.length === 66) {
      // If the key is fully decrypted, use it
      decryptedKey = keyField;
    } else {
      // Check for optional password protection
      const isProtected = new URLSearchParams(window.location.search).get("protected") === "true";
      if (isProtected) {
        const password = document.getElementById("redeem-password").value.trim();
        if (!password) {
          alert("Password is required to decrypt this Hongbao.");
          return;
        }

        try {
          const encryptedObject = JSON.parse(decryptedKey); // Parse the stored object
          decryptedKey = await decryptWithPassword(encryptedObject.encrypted, password, encryptedObject.iv);
        } catch (error) {
          alert("Invalid password. Unable to decrypt the Hongbao.");
          return;
        }
      }

      // Step 2: Decrypt with Shutter
      const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
        encrypted_msg: decryptedKey,
        timestamp,
      });

      decryptedKey = decryptResponse.data.message;

      // Update the key field with the fully decrypted key for consistency
      document.getElementById("hongbao-key").value = decryptedKey;
    }

    // Step 3: Use the fully decrypted key for all operations
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

    detailsElement.innerHTML += "Signing transaction and sending funds...<br>";
    const signedTx = await hongbaoAccount.signTransaction(tx);
    await fallbackWeb3.eth.sendSignedTransaction(signedTx.rawTransaction);

    resultElement.textContent = `Funds swept to your wallet: ${receiverAccount}`;
    resultElement.classList.remove("hidden");
    hongbaoVisual.classList.add("opened");

    detailsElement.innerHTML += "Transaction confirmed! Funds successfully transferred.";
    alert(`Hongbao redeemed! Funds have been transferred to your wallet: ${receiverAccount}`);
  } catch (error) {
    console.error("Error redeeming and sweeping Hongbao:", error);
    alert("Failed to redeem or sweep Hongbao.");
  }
}



async function redeemHongbaoWithPasskey(encryptedKey, timestamp, amount) {
  try {
    const wallet = await authenticateWallet(); // Load the existing passkey wallet
    console.log("Passkey Wallet Address:", wallet.address);

    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < timestamp) {
      alert(`Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}`);
      return;
    }

    const detailsElement = document.getElementById("redemption-details");
    const hongbaoVisual = document.getElementById("hongbao-visual-redeem");
    const resultElement = document.getElementById("redeem-result");

    detailsElement.textContent = "Checking for password protection...";
    detailsElement.classList.remove("hidden");

    let decryptedKey = encryptedKey;

    // Step 1: Use updated decrypted key from UI
    const keyField = document.getElementById("hongbao-key").value;
    if (keyField.startsWith("0x") && keyField.length === 66) {
      // If the key is fully decrypted, use it
      decryptedKey = keyField;
    } else {
      // Check for optional password protection
      const isProtected = new URLSearchParams(window.location.search).get("protected") === "true";
      if (isProtected) {
        const password = document.getElementById("redeem-password").value.trim();
        if (!password) {
          alert("Password is required to decrypt this Hongbao.");
          return;
        }

        try {
          const encryptedObject = JSON.parse(decryptedKey); // Parse the stored object
          decryptedKey = await decryptWithPassword(encryptedObject.encrypted, password, encryptedObject.iv);
        } catch (error) {
          alert("Invalid password. Unable to decrypt the Hongbao.");
          return;
        }
      }

      // Step 2: Decrypt with Shutter
      const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
        encrypted_msg: decryptedKey,
        timestamp,
      });

      decryptedKey = decryptResponse.data.message;

      // Update the key field with the fully decrypted key for consistency
      document.getElementById("hongbao-key").value = decryptedKey;
    }

    // Step 3: Use the fully decrypted key for all operations
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

    const tx = {
      from: hongbaoAccount.address,
      to: wallet.address,
      value: (balance - gasCost).toString(),
      gas: 21000,
      gasPrice: gasPrice.toString(),
      chainId: parseInt(GNOSIS_CHAIN_PARAMS.chainId, 16),
    };

    detailsElement.innerHTML += "Signing transaction and sending funds...<br>";
    const signedTx = await hongbaoAccount.signTransaction(tx);
    await fallbackWeb3.eth.sendSignedTransaction(signedTx.rawTransaction);

    resultElement.textContent = `Funds swept to your wallet: ${wallet.address}`;
    resultElement.classList.remove("hidden");
    hongbaoVisual.classList.add("opened");

    detailsElement.innerHTML += "Transaction confirmed! Funds successfully transferred.";
    alert(`Hongbao redeemed! Funds have been transferred to your wallet: ${wallet.address}`);
  } catch (error) {
    console.error("Error redeeming Hongbao with Passkey Wallet:", error);
    alert("Failed to redeem Hongbao with Passkey Wallet.");
  }
}


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

  senderSection.classList.add("hidden");
  receiverSection.classList.add("hidden");

  if (encryptedKey && timestamp && amount) {
    receiverSection.classList.remove("hidden");
    document.getElementById("hongbao-key").value = encryptedKey;
    document.getElementById("hongbao-timestamp").value = timestamp;
    document.getElementById("redeem-hongbao").setAttribute("data-amount", amount);
    hongbaoVisual.classList.remove("hidden");

    startCountdown(parseInt(timestamp, 10));

    detailsElement.textContent = "Checking Hongbao status...";
    detailsElement.classList.remove("hidden");

    try {
      const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
        encrypted_msg: encryptedKey,
        timestamp: parseInt(timestamp, 10),
      });

      const decryptedPrivateKey = decryptResponse.data.message;

      const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(decryptedPrivateKey);
      fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);

      await checkHongbaoBalance(hongbaoAccount.address, amount);
    } catch (error) {
      console.error("Error retrieving decryption key:", error);
      detailsElement.textContent = "Error retrieving decryption key. The Hongbao might still be locked.";
    }
  } else {
    senderSection.classList.remove("hidden");
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




// Countdown timer
function startCountdown(timestamp) {
  const countdownElement = document.getElementById('countdown');
  const interval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = timestamp - now;

    if (secondsLeft <= 0) {
      countdownElement.textContent = 'Hongbao is now available!';
      clearInterval(interval);
      return;
    }

    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;

    countdownElement.textContent = `${hours}h ${minutes}m ${seconds}s remaining.`;
  }, 1000);
}

// Add event listeners
document.getElementById('create-own-hongbao').addEventListener('click', () => {
  document.getElementById('receiver-section').classList.add('hidden');
  document.getElementById('sender-section').classList.remove('hidden');
  document.querySelector('.title').textContent = '🎁 Hongbao Gifting DApp';
});

document.getElementById('create-hongbao').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('hongbao-amount').value);
  sendHongbao(amount);
});

document.getElementById('redeem-hongbao').addEventListener('click', () => {
  const encryptedKey = document.getElementById('hongbao-key').value;
  const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
  const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
  redeemHongbaoAndSweep(encryptedKey, timestamp, amount);
});

document.getElementById('redeem-passkey-wallet').addEventListener('click', () => {
  const encryptedKey = document.getElementById('hongbao-key').value;
  const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
  const amount = document.getElementById('redeem-hongbao').getAttribute('data-amount');
  redeemHongbaoWithPasskey(encryptedKey, timestamp, amount);
});

document.getElementById("create-hongbao-with-passkey").addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("hongbao-amount").value);
  if (!amount || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }
  await fundHongbaoWithPasskey(amount);
});

document.getElementById("decrypt-password").addEventListener("click", async () => {
  const encryptedKey = document.getElementById("hongbao-key").value;
  const password = document.getElementById("redeem-password").value;
  const timestamp = parseInt(document.getElementById("hongbao-timestamp").value, 10);

  if (!password) {
    alert("Please enter a password.");
    return;
  }

  try {
    // Step 1: Decrypt with password
    const encryptedObject = JSON.parse(encryptedKey); // Parse the stored object
    const passwordDecryptedKey = await decryptWithPassword(
      encryptedObject.encrypted,
      password,
      encryptedObject.iv
    );

    if (!passwordDecryptedKey) {
      throw new Error("Failed to decrypt with the provided password.");
    }

    // Step 2: Decrypt with Shutter
    const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
      encrypted_msg: passwordDecryptedKey,
      timestamp,
    });

    const finalDecryptedKey = decryptResponse.data.message;

    // Step 3: Check balance using the fully decrypted key
    const hongbaoAccount = fallbackWeb3.eth.accounts.privateKeyToAccount(finalDecryptedKey);
    fallbackWeb3.eth.accounts.wallet.add(hongbaoAccount);

    const amount = document.getElementById("redeem-hongbao").getAttribute("data-amount");
    await checkHongbaoBalance(hongbaoAccount.address, amount);

    // Update the "Encrypted Key" field with the final decrypted key
    document.getElementById("hongbao-key").value = finalDecryptedKey;

    alert("Successfully decrypted, checked balance, and updated the key!");
  } catch (error) {
    console.error("Error during decryption or balance check:", error);
    alert("Failed to decrypt or check balance. Please ensure the password and key are correct.");
  }
});





document.addEventListener('DOMContentLoaded', populateFieldsFromHash);
