
const TelegramBot = require('node-telegram-bot-api');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const Buffer = require('buffer').Buffer;

const TELEGRAM_TOKEN = '8031905435:AAFsofuqzvfIV-HW-_y5W8U3cbbREO0c3Gg';
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
      const privKey = bs58.encode(Buffer.from(wallet.secretKey));
      const pubKey = wallet.publicKey.toString();
      bot.sendMessage(chatId, `ðŸŽ‰ New wallet created!

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
      if (!wallet) return bot.sendMessage(chatId, 'âŒ No wallet found. Please create or import one first.', goBackMenu());
      const pubKey = wallet.publicKey.toString();
      const balance = await connection.getBalance(wallet.publicKey);
      bot.sendMessage(chatId, `Wallet Address:
${pubKey}
SOL Balance: ${(balance / 1e9).toFixed(6)} SOL`, goBackMenu());
      break;
    }

    case 'withdraw_sol':
      if (!userWallets[userId]) return bot.sendMessage(chatId, 'âŒ No wallet found.', goBackMenu());
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
