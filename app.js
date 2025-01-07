const NANOSHUTTER_API_BASE = 'https://nanoshutter.staging.shutter.network';

if (typeof window.ethereum === 'undefined') {
  alert('Please install MetaMask to use this DApp.');
}

const web3 = new Web3(window.ethereum);

async function connectMetaMask() {
  try {
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

// Add click listener for the link
document.getElementById('hongbao-link').addEventListener('click', (event) => {
  const link = event.target.textContent.replace('Share this link: ', '');
  copyToClipboard(link);
});

async function sendHongbao(amount) {
  try {
    const senderAccount = await connectMetaMask();
    const releaseTimestamp = Math.floor(Date.now() / 1000) + 60; // Testing: 60 seconds

    const newAccount = web3.eth.accounts.create();
    const privateKey = newAccount.privateKey;
    const recipientAddress = newAccount.address;

    const detailsElement = document.getElementById('hongbao-details');
    const linkElement = document.getElementById('hongbao-link');
    const hongbaoVisual = document.getElementById('hongbao-visual');

    detailsElement.textContent = 'Requesting encryption key from Shutter...';

    const registerResponse = await axios.post(`${NANOSHUTTER_API_BASE}/encrypt/with_time`, {
      cypher_text: privateKey,
      timestamp: releaseTimestamp,
    });

    const encryptedKey = registerResponse.data.message;
    const link = `${window.location.origin}/ShutterHongbao/#redeem?key=${encodeURIComponent(encryptedKey)}&timestamp=${releaseTimestamp}&amount=${amount}`;

    detailsElement.innerHTML = `
      Identity registered successfully with Shutter!<br>
      Shutter Keypers encrypted the Hongbao.<br>
      Encryption key: <strong>${encryptedKey}</strong><br>
      Funds are locked until: <strong>${new Date(releaseTimestamp * 1000).toLocaleString()}</strong>
    `;
    linkElement.textContent = `Share this link: ${link}`;

    const hongbaoAmountWei = web3.utils.toWei(amount.toString(), 'ether');
    await web3.eth.sendTransaction({
      from: senderAccount,
      to: recipientAddress,
      value: hongbaoAmountWei,
    });

    hongbaoVisual.classList.remove('hidden');
    hongbaoVisual.classList.add('sealed');

    alert('Hongbao created successfully! Share the link with the recipient.');
  } catch (error) {
    console.error('Error creating Hongbao:', error);
    alert('Failed to create Hongbao.');
  }
}

async function redeemHongbaoAndSweep(encryptedKey, timestamp, amount) {
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < timestamp) {
      alert(`Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}`);
      return;
    }

    const detailsElement = document.getElementById('redemption-details');
    const hongbaoVisual = document.getElementById('hongbao-visual-redeem');

    detailsElement.textContent = 'Requesting decryption key from Shutter...';

    const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
      encrypted_msg: encryptedKey,
      timestamp,
    });

    const decryptedPrivateKey = decryptResponse.data.message;

    detailsElement.innerHTML = `
      Decryption successful!<br>
      Shutter Keypers generated the decryption key.<br>
      Decryption key: <strong>${decryptedPrivateKey}</strong><br>
      Amount received: <strong>${amount} ETH</strong>
    `;

    const hongbaoAccount = web3.eth.accounts.privateKeyToAccount(decryptedPrivateKey);
    web3.eth.accounts.wallet.add(hongbaoAccount);

    const balance = BigInt(await web3.eth.getBalance(hongbaoAccount.address));
    if (balance === BigInt(0)) {
      alert("No funds available to sweep.");
      return;
    }

    const receiverAccount = await connectMetaMask();
    const gasPrice = BigInt(await web3.eth.getGasPrice());
    const gasLimit = BigInt(21000);
    const gasCost = gasPrice * gasLimit;

    if (balance <= gasCost) {
      alert("Insufficient funds to cover gas fees.");
      return;
    }

    const tx = {
      from: hongbaoAccount.address,
      to: receiverAccount,
      value: (balance - gasCost).toString(),
      gas: 21000,
      gasPrice: gasPrice.toString(),
    };

    const signedTx = await hongbaoAccount.signTransaction(tx);
    await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    document.getElementById('redeem-result').textContent = `Funds swept to your wallet: ${receiverAccount}`;
    hongbaoVisual.classList.remove('hidden');
    hongbaoVisual.classList.add('opened');

    alert(`Hongbao redeemed! Funds have been transferred to your MetaMask wallet.`);
  } catch (error) {
    console.error('Error redeeming and sweeping Hongbao:', error);
    alert('Failed to redeem or sweep Hongbao.');
  }
}

function populateFieldsFromHash() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash.split('?')[1]);
  const encryptedKey = params.get('key');
  const timestamp = params.get('timestamp');
  const amount = params.get('amount');

  // Always hide the sender section
  document.getElementById('sender-section').classList.add('hidden');

  if (encryptedKey && timestamp && amount) {
    // Show the receiver section
    document.getElementById('receiver-section').classList.remove('hidden');
    document.getElementById('create-own-section').classList.remove('hidden');

    // Populate fields
    document.getElementById('hongbao-key').value = encryptedKey;
    document.getElementById('hongbao-timestamp').value = timestamp;

    // Start countdown
    startCountdown(timestamp);

    // Update title
    document.querySelector('.title').textContent = "🎉 Someone sent you a Hongbao!";

    // Store amount for later use
    document.getElementById('redeem-hongbao').setAttribute('data-amount', amount);
  } else {
    // If no valid key/timestamp in hash, show sender section
    document.getElementById('sender-section').classList.remove('hidden');
    document.getElementById('receiver-section').classList.add('hidden');
  }
}

function startCountdown(timestamp) {
  const countdownElement = document.getElementById('countdown');

  function updateCountdown() {
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
  }

  const interval = setInterval(updateCountdown, 1000);
  updateCountdown();
}

// Add listener for creating a new Hongbao
document.getElementById('create-own-hongbao').addEventListener('click', () => {
  document.getElementById('receiver-section').classList.add('hidden');
  document.getElementById('sender-section').classList.remove('hidden');
  document.querySelector('.title').textContent = "🎁 Hongbao Gifting DApp";
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

document.addEventListener('DOMContentLoaded', populateFieldsFromHash);
