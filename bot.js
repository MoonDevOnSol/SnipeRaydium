
const TelegramBot = require('node-telegram-bot-api');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const Buffer = require('buffer').Buffer;

const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
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
        [{ text: 'FAQ', callback_data: 'faq' }, { text: 'Help', callback_data: 'help' }],
        [{ text: 'Refer', callback_data: 'refer' }]
      ]
    }
  };
  bot.sendMessage(chatId, `Welcome to the Solana Trading Bot!
Choose an option:`, opts);
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
      bot.sendMessage(chatId, `New wallet created!

Public Key:
${pubKey}

Private Key (keep safe!):
${privKey}`, goBackMenu());
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
      bot.sendMessage(chatId, `Wallet Address:
${pubKey}
SOL Balance: ${(balance / 1e9).toFixed(6)} SOL`, goBackMenu());
      break;
    }

    case 'withdraw_sol':
      if (!userWallets[userId]) return bot.sendMessage(chatId, 'No wallet found.', goBackMenu());
      bot.sendMessage(chatId, `Send:
<recipient_address> <amount_in_SOL>

Example:
3N23... 0.5`, goBackMenu());
      userStates[userId] = 'withdrawing';
      break;

    case 'honeypot_scan':
      bot.sendMessage(chatId, 'Send the token mint address to check details and honeypot status.', goBackMenu());
      userStates[userId] = 'honeypot_scan';
      break;

    case 'buy_token':
      bot.sendMessage(chatId, `Send:
<TOKEN_MINT> <amount_in_SOL>`, goBackMenu());
      userStates[userId] = 'buying';
      break;

    case 'sell_token':
      bot.sendMessage(chatId, `Send:
<TOKEN_MINT> <amount_of_tokens>`, goBackMenu());
      userStates[userId] = 'selling';
      break;

    case 'faq':
      bot.sendMessage(chatId, `FAQ:
1. Create/import wallets
2. Buy/sell tokens
3. Scan tokens
4. Withdraw SOL`, goBackMenu());
      break;

    case 'help':
      bot.sendMessage(chatId, `Help:
- Use /start for main menu
- Use buttons to interact
- Contact support if needed`, goBackMenu());
      break;

    case 'refer':
      bot.sendMessage(chatId, `Refer:
Share the bot link with your friends: https://t.me/YOUR_BOT_USERNAME`, goBackMenu());
      break;
  }

  bot.answerCallbackQuery(query.id);
});

function goBackMenu() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: 'Back to Menu', callback_data: 'start' }]]
    }
  };
}
