const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const readlineSync = require('readline-sync');

const checkBalance = require('./src/checkBalance');
const displayHeader = require('./src/displayHeader');
const sleep = require('./src/sleep');
const {
  loadChains,
  selectChain,
  selectNetworkType,
} = require('./src/chainUtils');

const MAX_RETRIES = 5;
const RETRY_DELAY = 1000;

async function retry(fn, maxRetries = MAX_RETRIES, delay = RETRY_DELAY) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(
        colors.yellow(`⚠️ Error occurred. Retrying... (${i + 1}/${maxRetries})`)
      );
      await sleep(delay);
    }
  }
}

const main = async () => {
  displayHeader();

  const networkType = selectNetworkType();
  const chains = loadChains(networkType);
  const selectedChain = selectChain(chains);

  console.log(colors.green(`✅ You have selected: ${selectedChain.name}`));
  console.log(colors.green(`🛠 RPC URL: ${selectedChain.rpcUrl}`));
  console.log(colors.green(`🔗 Chain ID: ${selectedChain.chainId}`));

  const provider = new ethers.JsonRpcProvider(selectedChain.rpcUrl);

  const privateKeys = JSON.parse(fs.readFileSync('privateKeys.json'));
  const tokenAddress = readlineSync.question(
    'Enter the ERC20 token contract address: '
  );
  const tokenContract = new ethers.Contract(
    tokenAddress,
    [
      'function balanceOf(address owner) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
    ],
    provider
  );

  const transactionCount = readlineSync.questionInt(
    'Enter the number of transactions you want to send for each address: '
  );

  for (const privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const senderAddress = wallet.address;

    console.log(
      colors.cyan(`💼 Processing transactions for address: ${senderAddress}`)
    );

    let senderTokenBalance;
    try {
      senderTokenBalance = await retry(() =>
        tokenContract.balanceOf(senderAddress)
      );
    } catch (error) {
      console.log(
        colors.red(
          `❌ Failed to check token balance for ${senderAddress}. Skipping to next address.`
        )
      );
      continue;
    }

    if (BigInt(senderTokenBalance) < ethers.parseUnits('0.0001', 18)) {
      console.log(
        colors.red('❌ Insufficient or zero token balance. Skipping to next address.')
      );
      continue;
    }

    for (let i = 1; i <= transactionCount; i++) {
      const receiverWallet = ethers.Wallet.createRandom();
      const receiverAddress = receiverWallet.address;
      console.log(
        colors.white(`\n🆕 Generated address ${i}: ${receiverAddress}`)
      );

      const amountToSend = ethers.parseUnits(
        (Math.random() * (5 - 10) + 15).toFixed(6).toString(),
        18
      );

      let tx;
      try {
        tx = await retry(() =>
          tokenContract.connect(wallet).transfer(receiverAddress, amountToSend)
        );
      } catch (error) {
        console.log(
          colors.red(`❌ Failed to send transaction: ${error.message}`)
        );
        continue;
      }

      console.log(colors.white(`🔗 Transaction ${i}:`));
      console.log(colors.white(`  Hash: ${colors.green(tx.hash)}`));
      console.log(colors.white(`  From: ${colors.green(senderAddress)}`));
      console.log(colors.white(`  To: ${colors.green(receiverAddress)}`));
      console.log(
        colors.white(
          `  Amount: ${colors.green(
            ethers.formatUnits(amountToSend, 18)
          )} tokens`
        )
      );

      // Mengurangi delay menjadi 500 ms untuk transaksi berikutnya
      await sleep(10); 

      let receipt;
      try {
        receipt = await retry(() => provider.getTransactionReceipt(tx.hash));
        if (receipt) {
          if (receipt.status === 1) {
            console.log(colors.green('✅ Transaction Success!'));
            console.log(colors.green(`  Block Number: ${receipt.blockNumber}`));
          } else {
            console.log(colors.red('❌ Transaction FAILED'));
          }
        } else {
          console.log(
            colors.yellow(
              '⏳ Transaction is still pending after multiple retries.'
            )
          );
        }
      } catch (error) {
        console.log(
          colors.red(`❌ Error checking transaction status: ${error.message}`)
        );
      }
    }

    console.log(
      colors.green(`✅ Finished transactions for address: ${senderAddress}`)
    );
  }

  console.log(colors.green('All transactions completed.'));
  process.exit(0);
};

main().catch((error) => {
  console.error(colors.red('🚨 An unexpected error occurred:'), error);
  process.exit(1);
});


    
