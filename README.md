# Sutterized Hongbao DApp  

![image](https://github.com/user-attachments/assets/6fd42470-50fe-473c-909b-476fc3d345ea)


---

## Overview  

The **Shutterized Hongbao DApp** is a decentralized application for secure cryptocurrency gifting on the Gnosis Chain. The DApp leverages Shutter encryption for time-locked transfers and offers features like password protection and a non-custodial, in-browser passkey wallet for enhanced security and user control.  

A **hongbao** is a traditional red envelope commonly used in Chinese culture to gift money during special occasions like Lunar New Year, symbolizing good luck and prosperity.

**Important**: This is extremely early alpha software using NanoShutter, a simplified and centralized version of Shutter. Use at your own risk—assume potential loss of all connected funds.  

---

## Features  

1. **Secure Gifting**: Send cryptocurrency with a time-locked mechanism.  
2. **Shutter Encryption**: Ensures private keys remain protected until the specified unlock time.  
3. **Password Protection**: Optionally secure Hongbao with an additional password for recipient decryption.  
4. **Non-Custodial Passkey Wallet**: Fully in-browser wallet without custodial dependency.  
5. **One-Time Private Keys**: Each Hongbao is tied to a unique private key.  
6. **User-Friendly Interface**: Simple workflows for both senders and recipients.  

---

## New Features  

### Password Protection  
- You can now protect the Hongbao with a password, adding another layer of security.  
- The recipient must enter the password to decrypt the private key before claiming funds.  

### Non-Custodial In-Browser Passkey Wallet  
- A fully non-custodial wallet created in-browser for secure fund management.  
- Operates independently of MetaMask or other external wallets.  
- Funds are swept directly into this wallet if selected during redemption.  

---

## How It Works  

### Sending a Hongbao  

1. **Create a One-Time Private Key**:  
   - Generate a unique Ethereum account with a private key.  
   - Encrypt the private key using Shutter's service, locking it until a specified timestamp.  

2. **Encrypt the Private Key**:  
   - Use Shutter encryption for time-locking.  
   - Optionally, encrypt the result with a user-defined password.  

3. **Fund the Hongbao**:  
   - Transfer xDai to the newly generated account.  

4. **Generate a Redemption Link**:  
   - Share a link containing the encrypted private key, timestamp, and amount with the recipient.  

---

### Redeeming a Hongbao  

1. **Verify the Hongbao**:  
   - Open the redemption link and check Hongbao status.  
   - If password-protected, enter the password to decrypt the key.  

2. **Request Decryption**:  
   - After the unlock time, request the final decryption key from Shutter.  

3. **Sweep Funds**:  
   - Use MetaMask or the in-browser passkey wallet to sweep funds to the recipient's wallet.  

---

## Non-Custodial In-Browser Passkey Wallet  

![image](https://github.com/user-attachments/assets/0a6df85f-2d46-4507-af62-46739d99565a)



### Key Features  
- **Decentralized**: Fully non-custodial and managed directly in the browser.  
- **Secure**: Private keys are only accessible locally, within the user's browser session.  
- **Independent**: Operates without reliance on MetaMask or other external wallets.  

### Workflow  
- Recipients can use the passkey wallet to redeem Hongbao and sweep funds securely into their locally stored wallet.  
- The wallet is ephemeral—created and managed entirely in-browser, enhancing privacy.  

---

## Password Protection  

### How It Works  
- When creating a Hongbao, senders can set an optional password.  
- Recipients must provide this password during redemption to decrypt the intermediate private key before requesting the final decryption from Shutter.  

### Benefits  
- Enhances security by ensuring only intended recipients can access the private key.  
- Combines with time-lock encryption for double-layer protection.  

---

## Technical Flow  

### Sending a Hongbao  
1. **Generate Private Key**: A one-time-use private key is generated.  
2. **Encrypt with Shutter**: The key is encrypted for time-lock protection.  
3. **Optionally Encrypt with Password**: The Shutter-encrypted key is wrapped with an additional password encryption.  
4. **Fund and Share**: Funds are transferred, and a redemption link is generated.  

### Redeeming a Hongbao  
1. **Decrypt with Password (if applicable)**: The recipient decrypts the key with the password.  
2. **Decrypt with Shutter**: The final key is retrieved from Shutter after the unlock time.  
3. **Sweep Funds**: Use the fully decrypted key to transfer funds to a MetaMask account or passkey wallet.  

---

## Usage Instructions  

### Sending a Hongbao  
1. **Choose Wallet**:  
   - Use MetaMask or the passkey wallet for funding.  

2. **Set Amount and Lock Time**:  
   - Specify the amount and unlock timestamp.  

3. **Add Password (Optional)**:  
   - Enhance security with password protection.  

4. **Create and Share**:  
   - Generate the Hongbao and share the link with the recipient.  

### Redeeming a Hongbao  
1. **Verify Details**:  
   - Open the Hongbao link and check its status.  

2. **Provide Password (if required)**:  
   - Enter the password to decrypt the key.  

3. **Sweep Funds**:  
   - Use MetaMask or the passkey wallet to claim funds.  

---

## FAQ  

### What happens if the Hongbao is redeemed early?  
Funds cannot be accessed before the unlock time.  

### What if I lose my password?  
If password-protected, losing the password makes decryption impossible.  

### What happens if I lose my redemption link?  
The link contains critical information. Losing it means the Hongbao cannot be redeemed.  

---

## Technical Dependencies  

- **Web3.js**: Blockchain interactions.  
- **Ethers.js**: Ethereum wallet integration for the passkey wallet.  
- **CryptoJS & Web Crypto API**: Encryption and decryption utilities.  
- **Shutter Network**: Encryption and decryption services.  

---

## Conclusion  

The Shutterized Hongbao DApp combines secure time-locked gifting with decentralized privacy. With added features like password protection and a non-custodial passkey wallet, it ensures maximum flexibility, security, and accessibility for users.  
