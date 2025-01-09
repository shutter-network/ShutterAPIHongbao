# Shutterized Hongbao DApp Documentation

![image](https://github.com/user-attachments/assets/8a18a818-532f-4384-9e96-018ef362507f)


## Overview
The Shutterized Hongbao DApp is a decentralized application designed for secure gifting of cryptocurrency (e.g., xDai) on the Gnosis Chain. Leveraging Shutter encryption technology, this app ensures that funds in the Hongbao (red envelope) are locked and can only be redeemed after a specified time. The app generates one-time-use private keys for secure gifting and uses Shutter Keypers to encrypt and later decrypt these keys at the specified time.

Currently it's using NanoShutter, which is a highly simplified and centralized version of Shutter. Also this is extremely early alpha software, use at your own risk, assume you'll lose all funds in the wallet that is connected to the dapp.

## Features
1. **Secure Gifting**: Send cryptocurrency in a time-locked envelope.
2. **Shutter Encryption**: Ensures funds are protected until the specified unlock time.
3. **One-Time Private Key**: Each Hongbao uses a unique private key for added security.
4. **User-Friendly Interface**: Simple setup and usage for both senders and recipients.

## How It Works

### Sending a Hongbao
1. **Create a One-Time Private Key**:
   - A new Ethereum account is generated with a unique private key.
   - This key is encrypted using Shutter's encryption service and is time-locked until a specified timestamp.

2. **Encrypt the Private Key**:
   - The private key is sent to Shutter's encryption service, which generates an encrypted version of the key.

3. **Fund the Hongbao**:
   - The sender transfers the specified amount of xDai to the new Ethereum account linked to the Hongbao.

4. **Generate a Redemption Link**:
   - A link containing the encrypted private key, unlock timestamp, and amount is generated for the recipient.

### Redeeming a Hongbao
1. **Check the Status**:
   - The recipient uses the link to access the DApp.
   - The app verifies the balance of the Hongbao account and displays its availability.

2. **Request Decryption**:
   - Once the unlock time is reached, the recipient requests the decryption key from Shutter.

3. **Transfer Funds**:
   - The decrypted private key is used to transfer the funds from the Hongbao account to the recipient's wallet.

---

## Shutter Encryption

Shutter encryption is a cryptographic technique designed for secure, time-locked transactions. It leverages a network of "Shutter Keypers" who collectively encrypt and decrypt data. In the Hongbao DApp:

1. **Encryption**:
   - The private key of the one-time-use account is encrypted by the Shutter Keypers. This ensures the key remains inaccessible until the specified unlock time.

2. **Decryption**:
   - At the unlock time, the Shutter Keypers provide the decryption key to reveal the private key, allowing the recipient to access the funds.

### Why is Shutter Encryption Secure?
- The encryption process is decentralized, ensuring no single entity controls the encryption or decryption process.
- The encrypted private key cannot be accessed until the unlock time, preventing premature access.

---

## One-Time Private Key: Why It's Safe

### What is a One-Time Private Key?
The one-time private key is a unique Ethereum private key generated for each Hongbao. It is used solely for the purpose of holding the gifted funds until redemption.

### Benefits of One-Time Private Keys
1. **Isolation**:
   - The private key is specific to a single transaction, reducing risk.
2. **Encryption**:
   - The key is encrypted and stored securely until the unlock time.
3. **Minimized Exposure**:
   - Even if the private key is compromised, only the funds in that specific Hongbao are at risk.

### Security Practices
- The private key is never directly exposed to the sender or recipient during the gifting process.
- Shutter's encryption ensures the key cannot be decrypted until the designated time.

---

## Key Components

### Frontend
The DApp frontend:
- Interacts with MetaMask for wallet connectivity.
- Displays the Hongbao status and countdown to unlock.
- Provides a seamless user experience for creating and redeeming Hongbaos.

### Backend
The backend:
- Handles requests to Shutter’s encryption and decryption APIs.
- Validates transaction details and ensures secure communication.

---

## Usage Instructions

### Sending a Hongbao
1. **Connect MetaMask**:
   - Ensure MetaMask is installed and connected to the Gnosis Chain.
2. **Enter Amount**:
   - Specify the amount of xDai to gift.
3. **Create Hongbao**:
   - Click “Create Hongbao” to generate a unique link.
4. **Share the Link**:
   - Copy and share the redemption link with the recipient.

### Redeeming a Hongbao
1. **Open the Link**:
   - Use the provided link to access the DApp.
2. **Check Status**:
   - Ensure the Hongbao is available and funds are unlocked.
3. **Redeem Funds**:
   - Click “Redeem Hongbao” to transfer funds to your wallet.

---

## FAQ

### 1. What happens if the Hongbao is redeemed early?
Funds cannot be accessed until the unlock time. The DApp ensures this by verifying the current time against the specified timestamp.

### 2. Is the private key secure?
Yes. The private key is encrypted using Shutter’s decentralized encryption system and is inaccessible until the unlock time.

### 3. What if the recipient loses the redemption link?
The link contains the encrypted private key and timestamp. Without the link, the Hongbao cannot be redeemed.

---

## Technical Dependencies
- **Web3.js**: For blockchain interactions.
- **Axios**: For API communication with Shutter.
- **Shutter Network**: Provides encryption and decryption services.
- **MetaMask**: For wallet integration.

---

## Conclusion
The Shutterized Hongbao DApp combines the tradition of gifting with the security of blockchain technology. By leveraging Shutter’s decentralized encryption and one-time private keys, it ensures a secure, user-friendly, and tamper-proof gifting experience.

