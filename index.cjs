require("dotenv").config();
const { ethers } = require("ethers");
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseConfig.json");

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Set up blockchain provider
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

// USDT contract ABI (simplified)
const usdtAbi = [
  "function balanceOf(address) view returns (uint)",
  "function transfer(address to, uint amount) returns (bool)"
];

const usdtAddress = process.env.USDT_CONTRACT;
const adminWallet = process.env.ADMIN_WALLET;

// Function to check and forward balances
async function checkBalances() {
  const usersSnapshot = await db.collection("users").get();

  for (const doc of usersSnapshot.docs) {
    const user = doc.data();
    const address = user.address;
    const privateKey = user.privateKey;

    if (!address || !privateKey) {
      console.log(`Skipping user ${doc.id}, missing address or private key`);
      continue;
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(usdtAddress, usdtAbi, wallet);
    
    try {
      const balance = await contract.balanceOf(address);

      if (balance.gt(0)) {
        const readableAmount = ethers.formatUnits(balance, 18);
        console.log(`User ${doc.id} has USDT: ${readableAmount}`);

        const tx = await contract.transfer(adminWallet, balance);
        await tx.wait();

        console.log(`✅ Forwarded ${readableAmount} USDT from ${address} to admin wallet`);

        await db.collection("users").doc(doc.id).update({
          lastDeposit: readableAmount,
          lastChecked: new Date().toISOString(),
          lastForwardedTx: tx.hash
        });
      } else {
        console.log(`User ${doc.id}: No USDT.`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${doc.id}:`, err.message);
    }
  }
}

// Run every 30 seconds
setInterval(checkBalances, 30000);
