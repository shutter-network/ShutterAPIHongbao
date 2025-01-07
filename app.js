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
    detailsElement.classList.remove('hidden');

    const registerResponse = await axios.post(`${NANOSHUTTER_API_BASE}/encrypt/with_time`, {
      cypher_text: privateKey,
      timestamp: releaseTimestamp,
    });

    const encryptedKey = registerResponse.data.message;
    const link = `${window.location.origin}/#redeem?key=${encodeURIComponent(encryptedKey)}&timestamp=${releaseTimestamp}`;

    detailsElement.innerHTML = `
      Identity registered successfully with Shutter!<br>
      Shutter Keypers encrypted the Hongbao.<br>
      Encryption key: <strong>${encryptedKey}</strong><br>
      Funds are locked until: <strong>${new Date(releaseTimestamp * 1000).toLocaleString()}</strong>
    `;
    linkElement.textContent = `Share this link: ${link}`;
    linkElement.classList.remove('hidden');

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

async function redeemHongbaoAndSweep(encryptedKey, timestamp) {
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < timestamp) {
      alert(`Hongbao is locked until ${new Date(timestamp * 1000).toLocaleString()}`);
      return;
    }

    const detailsElement = document.getElementById('redemption-details');
    const hongbaoVisual = document.getElementById('hongbao-visual-redeem');

    detailsElement.textContent = 'Requesting decryption key from Shutter...';
    detailsElement.classList.remove('hidden');

    const decryptResponse = await axios.post(`${NANOSHUTTER_API_BASE}/decrypt/with_time`, {
      encrypted_msg: encryptedKey,
      timestamp,
    });

    const decryptedPrivateKey = decryptResponse.data.message;

    detailsElement.innerHTML = `
      Decryption successful!<br>
      Shutter Keypers generated the decryption key.<br>
      Decryption key: <strong>${decryptedPrivateKey}</strong>
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

  if (encryptedKey && timestamp) {
    document.getElementById('hongbao-key').value = encryptedKey;
    document.getElementById('hongbao-timestamp').value = timestamp;
    startCountdown(timestamp);

    const hongbaoVisual = document.getElementById('hongbao-visual-redeem');
    hongbaoVisual.classList.remove('hidden');
    hongbaoVisual.classList.add('sealed');
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

document.getElementById('create-hongbao').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('hongbao-amount').value);
  sendHongbao(amount);
});

document.getElementById('redeem-hongbao').addEventListener('click', () => {
  const encryptedKey = document.getElementById('hongbao-key').value;
  const timestamp = parseInt(document.getElementById('hongbao-timestamp').value, 10);
  redeemHongbaoAndSweep(encryptedKey, timestamp);
});

document.addEventListener('DOMContentLoaded', populateFieldsFromHash);
