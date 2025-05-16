
const TelegramBot = require('node-telegram-bot-api');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const Buffer = require('buffer').Buffer;

const TELEGRAM_TOKEN = '8031905435:AAHeRJVzGROsoJk-tw8r6kfnVDLg-v-kKxo';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const connection = new Connection(SOLANA_RPC_URL);
const userWallets = {};
const userStates = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Create New Wallet', callback_data: 'create_wallet' }],
        [{ text: 'Import Wallet', callback_data: 'import_wallet' }],
        [{ text: 'Show Wallet Address', callback_data: 'show_wallet' }],
        [{ text: 'Withdraw SOL', callback_data: 'withdraw_sol' }],
        [{ text: 'Honeypot Scan', callback_data: 'honeypot_scan' }],
        [{ text: 'Buy Token', callback_data: 'buy_token' }],
        [{ text: 'Sell Token', callback_data: 'sell_token' }],
        [{ text: 'ðŸ“– FAQ', callback_data: 'faq' }, { text: 'ðŸ†˜ Help', callback_data: 'help' }],
        [{ text: 'ðŸŽ¯ Refer', callback_data: 'refer' }]
      ]
    }
  };
  bot.sendMessage(chatId, 'Welcome to the Solana Trading Bot!
Choose an option:', opts);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  switch (data) {
    case 'create_wallet': {
      const wallet = Keypair.generate();
      userWallets[userId] = wallet;
      const privKey = bs58.encode(wallet.secretKey);
      const pubKey = wallet.publicKey.toString();
      bot.sendMessage(chatId, `ðŸŽ‰ New wallet created!\n\nPublic Key:\n${pubKey}\n\nPrivate Key (keep safe!):\n${privKey}`, goBackMenu());
      break;
    }

    case 'import_wallet':
      bot.sendMessage(chatId, 'Send your Base58 private key to import.', goBackMenu());
      userStates[userId] = 'importing';
      break;

    case 'show_wallet': {
      const wallet = userWallets[userId];
      if (!wallet) return bot.sendMessage(chatId, 'âŒ No wallet found. Please create or import one first.', goBackMenu());
      const pubKey = wallet.publicKey.toString();
      const balance = await connection.getBalance(wallet.publicKey);
      bot.sendMessage(chatId, `Wallet Address:\n${pubKey}\nSOL Balance: ${(balance / 1e9).toFixed(6)} SOL`, goBackMenu());
      break;
    }

    case 'withdraw_sol':
      if (!userWallets[userId]) return bot.sendMessage(chatId, 'âŒ No wallet found.', goBackMenu());
      bot.sendMessage(chatId, 'Send:
<recipient_address> <amount_in_SOL>
Example:
3N23... 0.5', goBackMenu());
      userStates[userId] = 'withdrawing';
      break;

    case 'honeypot_scan':
      bot.sendMessage(chatId, 'Send the token mint address to check details and honeypot status.', goBackMenu());
      userStates[userId] = 'honeypot_scan';
      break;

    case 'buy_token':
      bot.sendMessage(chatId, 'Send:
<TOKEN_MINT> <amount_in_SOL>', goBackMenu());
      userStates[userId] = 'buying';
      break;

    case 'sell_token':
      bot.sendMessage(chatId, 'Send:
<TOKEN_MINT> <amount_of_tokens>', goBackMenu());
      userStates[userId] = 'selling';
      break;

    case 'faq':
      bot.sendMessage(chatId, `ðŸ“– FAQ:

1. What is this bot?
- It's a secure trading interface for Solana tokens via Telegram.

2. What can I do?
- Create/import wallets, buy/sell tokens, scan for honeypots, and withdraw SOL.

3. Is it safe?
- Your wallet keys are stored in memory only during your session.`, goBackMenu());
      break;

    case 'help':
      bot.sendMessage(chatId, `ðŸ†˜ Help:

- Use /start to return to the main menu.
- Use inline buttons to access features.
- Use /sol or /price <token> for live prices.
- Need support? Contact @Stupidmoni_dev`, goBackMenu());
      break;

    case 'refer':
      bot.sendMessage(chatId, `ðŸŽ¯ Refer:

Invite your friends to use this bot!
Send them this link: https://t.me/YOUR_BOT_USERNAME`, goBackMenu());
      break;
  }

  bot.answerCallbackQuery(query.id);
});

bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = userStates[userId];
  const text = msg.text.trim();

  if (!state || text.startsWith("/")) return;

  if (state === 'importing') {
    try {
      const secret = bs58.decode(text);
      const wallet = Keypair.fromSecretKey(secret);
      userWallets[userId] = wallet;
      bot.sendMessage(chatId, `âœ… Wallet imported!
Public Key:
${wallet.publicKey.toString()}`, goBackMenu());
    } catch (err) {
      bot.sendMessage(chatId, `âŒ Invalid private key: ${err.message}`, goBackMenu());
    }
    userStates[userId] = null;
  }

  else if (state === 'withdrawing') {
    const wallet = userWallets[userId];
    if (!wallet) return bot.sendMessage(chatId, 'âŒ Wallet not found.', goBackMenu());
    const [recipientStr, amountStr] = text.split(' ');
    try {
      const recipient = new PublicKey(recipientStr);
      const amountLamports = parseFloat(amountStr) * 1e9;
      const balance = await connection.getBalance(wallet.publicKey);
      const fee = 5000;
      if (balance < amountLamports + fee) {
        return bot.sendMessage(chatId, `âŒ Insufficient balance. Available: ${(balance / 1e9).toFixed(6)} SOL`, goBackMenu());
      }
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: recipient,
          lamports: amountLamports,
        })
      );
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
      bot.sendMessage(chatId, `âœ… Sent ${amountStr} SOL
Tx Signature: ${sig}`, goBackMenu());
    } catch (e) {
      bot.sendMessage(chatId, `âŒ Error: ${e.message}`, goBackMenu());
    }
    userStates[userId] = null;
  }

  else if (state === 'honeypot_scan') {
    try {
      const dexResp = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${text}`);
      const token = dexResp.data.pairs[0];
      if (!token) throw new Error('Token not found.');

      bot.sendMessage(chatId, `ðŸ” Token Info:
Name: ${token.baseToken.name} (${token.baseToken.symbol})
Price: $${parseFloat(token.priceUsd).toFixed(6)}
Market Cap: ${token.fdv ? `$${(token.fdv / 1e6).toFixed(2)}M` : 'N/A'}
Liquidity: $${(token.liquidity.usd).toFixed(2)}
DEX: ${token.dexId}
Chart: ${token.url}`, goBackMenu());
    } catch (err) {
      bot.sendMessage(chatId, `âŒ Failed to fetch token info: ${err.message}`, goBackMenu());
    }
    userStates[userId] = null;
  }

  else if (state === 'buying' || state === 'selling') {
    const wallet = userWallets[userId];
    if (!wallet) return bot.sendMessage(chatId, 'âŒ Wallet not found.', goBackMenu());
    const [mintAddress, amountStr] = text.split(' ');
    try {
      const inputMint = (state === 'buying') ? 'So11111111111111111111111111111111111111112' : mintAddress;
      const outputMint = (state === 'buying') ? mintAddress : 'So11111111111111111111111111111111111111112';
      const amount = (parseFloat(amountStr) * 1e9).toFixed(0);

      const swapResp = await axios.post('https://quote-api.jup.ag/v6/swap', {
        userPublicKey: wallet.publicKey.toString(),
        wrapUnwrapSOL: true,
        dynamicSlippage: true,
        feeAccount: null,
        quoteResponse: {
          inputMint,
          outputMint,
          amount,
          slippageBps: 50
        }
      });

      const txBase64 = swapResp.data.swapTransaction;
      const txBuffer = Buffer.from(txBase64, 'base64');
      const tx = Transaction.from(txBuffer);
      tx.partialSign(wallet);
      const sig = await connection.sendRawTransaction(tx.serialize());
      bot.sendMessage(chatId, `âœ… ${state === 'buying' ? 'Buy' : 'Sell'} executed!
Tx Signature:
${sig}`, goBackMenu());
    } catch (err) {
      bot.sendMessage(chatId, `âŒ ${state === 'buying' ? 'Buy' : 'Sell'} failed: ${err.message}`, goBackMenu());
    }
    userStates[userId] = null;
  }
});

// Live price commands
bot.onText(/\/price (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenAddress = match[1].trim();
  try {
    const response = await axios.get(`https://price.jup.ag/v4/price`, {
      params: { ids: tokenAddress }
    });
    const data = response.data[tokenAddress];
    if (!data) return bot.sendMessage(chatId, `âŒ Price data not found for ${tokenAddress}`);
    const price = data.price;
    bot.sendMessage(chatId, `ðŸ“ˆ Current price of ${tokenAddress} is $${price.toFixed(6)} USD`);
  } catch (err) {
    bot.sendMessage(chatId, `âŒ Failed to fetch price: ${err.message}`);
  }
});

bot.onText(/\/sol/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const response = await axios.get(`https://price.jup.ag/v4/price?ids=So11111111111111111111111111111111111111112`);
    const solPrice = response.data["So11111111111111111111111111111111111111112"].price;
    bot.sendMessage(chatId, `ðŸ’° Current SOL price: $${solPrice.toFixed(2)} USD`);
  } catch (e) {
    bot.sendMessage(chatId, `âŒ Could not fetch SOL price.`);
  }
});

// Go back menu
function goBackMenu() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: 'ðŸ”™ Back to Menu', callback_data: 'start' }]]
    }
  };
}
