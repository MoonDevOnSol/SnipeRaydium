const TelegramBot = require('node-telegram-bot-api');
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const Buffer = require('buffer').Buffer;

const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const connection = new Connection(SOLANA_RPC_URL);
const userWallets = {};
const userStates = {};

bot.onText(/\/start(?: (.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const referrerId = match[1];

  if (referrerId && referrerId !== String(userId)) {
    bot.sendMessage(referrerId, `You referred a new user: ${msg.from.username || msg.from.first_name}`);
  }

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
        [{ text: 'FAQ', callback_data: 'faq' }, { text: 'Help', callback_data: 'help' }],
        [{ text: 'Refer', callback_data: 'refer' }]
      ]
    }
  };
  bot.sendMessage(chatId, `Welcome to the Solana Trading Bot!\nChoose an option:`, opts);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  switch (data) {
    case 'create_wallet': {
      const wallet = Keypair.generate();
      userWallets[userId] = wallet;
      const privKey = bs58.encode(Uint8Array.from(wallet.secretKey));
      const pubKey = wallet.publicKey.toString();
      bot.sendMessage(chatId, `New wallet created!\n\nPublic Key:\n${pubKey}\n\nPrivate Key (keep safe!):\n${privKey}`, goBackMenu());
      break;
    }

    case 'import_wallet':
      bot.sendMessage(chatId, 'Send your Base58 private key to import.', goBackMenu());
      userStates[userId] = 'importing';
      break;

    case 'show_wallet': {
      const wallet = userWallets[userId];
      if (!wallet) return bot.sendMessage(chatId, 'No wallet found. Please create or import one first.', goBackMenu());
      const pubKey = wallet.publicKey.toString();
      const balance = await connection.getBalance(wallet.publicKey);
      bot.sendMessage(chatId, `Wallet Address:\n${pubKey}\nSOL Balance: ${(balance / 1e9).toFixed(6)} SOL`, goBackMenu());
      break;
    }

    case 'withdraw_sol':
      if (!userWallets[userId]) return bot.sendMessage(chatId, 'No wallet found.', goBackMenu());
      bot.sendMessage(chatId, `Send:\n<recipient_address> <amount_in_SOL>\n\nExample:\n3N23... 0.5`, goBackMenu());
      userStates[userId] = 'withdrawing';
      break;

    case 'honeypot_scan':
      bot.sendMessage(chatId, 'Send the token mint address to check details and honeypot status.', goBackMenu());
      userStates[userId] = 'honeypot_scan';
      break;

    case 'buy_token':
      bot.sendMessage(chatId, `Send:\n<TOKEN_MINT> <amount_in_SOL>`, goBackMenu());
      userStates[userId] = 'buying';
      break;

    case 'sell_token':
      bot.sendMessage(chatId, `Send:\n<TOKEN_MINT> <amount_of_tokens>`, goBackMenu());
      userStates[userId] = 'selling';
      break;

    case 'faq':
      bot.sendMessage(chatId, `FAQ:\n1. Create/import wallets\n2. Buy/sell tokens\n3. Scan tokens\n4. Withdraw SOL`, goBackMenu());
      break;

    case 'help':
      bot.sendMessage(chatId, `Help:\n- Use /start for main menu\n- Use buttons to interact\n- Contact support if needed`, goBackMenu());
      break;

    case 'refer':
      const referralLink = `https://t.me/YOUR_BOT_USERNAME?start=${userId}`;
      bot.sendMessage(chatId, `Refer your friends and earn rewards!\n\nYour referral link:\n${referralLink}`, goBackMenu());
      break;
  }

  bot.answerCallbackQuery(query.id);
});

bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = userStates[userId];

  if (state === 'importing') {
    try {
      const decoded = bs58.decode(msg.text.trim());
      const wallet = Keypair.fromSecretKey(decoded);
      userWallets[userId] = wallet;
      userStates[userId] = null;
      bot.sendMessage(chatId, `Wallet imported successfully!\n\nPublic Key:\n${wallet.publicKey.toString()}`, goBackMenu());
    } catch (err) {
      bot.sendMessage(chatId, 'Invalid private key. Please try again.', goBackMenu());
    }
  } else if (state === 'honeypot_scan') {
    const tokenMint = msg.text.trim();
    try {
      const { data } = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/solana/${tokenMint}`);
      if (!data.pair) throw new Error('No data found');
      userStates[userId] = null;
      bot.sendMessage(chatId, `Token Info:\nName: ${data.pair.baseToken.name}\nSymbol: ${data.pair.baseToken.symbol}\nPrice: $${data.pair.priceUsd}\nDEX: ${data.pair.dexId}`, goBackMenu());
    } catch (e) {
      bot.sendMessage(chatId, 'Token not found or not listed on Dexscreener.', goBackMenu());
    }
  }
});

function goBackMenu() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: 'Back to Menu', callback_data: 'start' }]]
    }
  };
}
