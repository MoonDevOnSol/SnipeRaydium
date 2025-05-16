
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from solana.rpc.async_api import AsyncClient
from solana.keypair import Keypair
from solana.publickey import PublicKey
from solana.transaction import Transaction
from solana.system_program import TransferParams, transfer
import base58
import asyncio
import aiohttp

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"
SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com"

user_wallets = {}

async def get_sol_balance(pubkey_str: str) -> float:
    async with AsyncClient(SOLANA_RPC_URL) as client:
        resp = await client.get_balance(PublicKey(pubkey_str))
        if resp["result"]:
            return resp["result"]["value"] / 1_000_000_000
        return 0.0

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("Create New Wallet", callback_data="create_wallet")],
        [InlineKeyboardButton("Import Wallet", callback_data="import_wallet")],
        [InlineKeyboardButton("Show Wallet Address", callback_data="show_wallet")],
        [InlineKeyboardButton("Withdraw SOL", callback_data="withdraw_sol")],
        [InlineKeyboardButton("Honeypot Scan", callback_data="honeypot_scan")],
        [InlineKeyboardButton("Buy Token", callback_data="buy_token")],
        [InlineKeyboardButton("Sell Token", callback_data="sell_token")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "Welcome to Solana Trading Bot!\nChoose an option:", reply_markup=reply_markup
    )

async def button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id

    if query.data == "create_wallet":
        wallet = Keypair()
        user_wallets[user_id] = wallet
        priv_key_b58 = base58.b58encode(wallet.secret_key).decode()
        await query.message.reply_text(
            f"\ud83c\udf89 New wallet created!\n\nPublic Key:\n{str(wallet.public_key)}\n\n"
            f"Private Key (keep safe!):\n{priv_key_b58}"
        )

    elif query.data == "import_wallet":
        await query.message.reply_text(
            "Send your wallet private key (Base58 encoded) to import."
        )
        context.user_data["expecting_import"] = True

    elif query.data == "show_wallet":
        if user_id not in user_wallets:
            await query.message.reply_text(
                "❌ No wallet found. Please create or import first."
            )
            return
        wallet = user_wallets[user_id]
        balance = await get_sol_balance(str(wallet.public_key))
        await query.message.reply_text(
            f"Wallet Address:\n{str(wallet.public_key)}\nSOL Balance: {balance:.6f} SOL"
        )

    elif query.data == "withdraw_sol":
        if user_id not in user_wallets:
            await query.message.reply_text(
                "❌ No wallet found. Please create or import first."
            )
            return
        await query.message.reply_text(
            "Send withdrawal request as:\n<recipient_address> <amount_in_SOL>\nExample:\n3N23kdJS8Yz7k8HDx3QZb9v6xQZefR2xM3mgLyQkm6BX 0.5"
        )
        context.user_data["expecting_withdraw"] = True

    elif query.data == "honeypot_scan":
        await query.message.reply_text(
            "Send the token mint address to check honeypot status."
        )
        context.user_data["expecting_honeypot"] = True

    elif query.data == "buy_token":
        if user_id not in user_wallets:
            await query.message.reply_text(
                "❌ No wallet found. Please create or import first."
            )
            return
        await query.message.reply_text(
            "Send token mint address and amount of SOL to spend separated by space.\nExample:\nTOKEN_MINT_ADDRESS 0.5"
        )
        context.user_data["expecting_buy"] = True

    elif query.data == "sell_token":
        if user_id not in user_wallets:
            await query.message.reply_text(
                "❌ No wallet found. Please create or import first."
            )
            return
        await query.message.reply_text(
            "Send token mint address and amount of tokens to sell separated by space.\nExample:\nTOKEN_MINT_ADDRESS 100"
        )
        context.user_data["expecting_sell"] = True

async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.message.from_user.id
    text = update.message.text.strip()

    if context.user_data.get("expecting_import"):
        context.user_data["expecting_import"] = False
        try:
            secret_key_bytes = base58.b58decode(text)
            if len(secret_key_bytes) != 64:
                raise ValueError("Invalid private key length")
            wallet = Keypair.from_secret_key(secret_key_bytes)
            user_wallets[user_id] = wallet
            await update.message.reply_text(
                f"✅ Wallet imported!\nPublic Key:\n{str(wallet.public_key)}"
            )
        except Exception as e:
            await update.message.reply_text(f"❌ Invalid private key: {e}")
        return

    if context.user_data.get("expecting_withdraw"):
        context.user_data["expecting_withdraw"] = False
        if user_id not in user_wallets:
            await update.message.reply_text(
                "❌ No wallet found. Please create or import first."
            )
            return
        parts = text.split()
        if len(parts) != 2:
            await update.message.reply_text("❌ Wrong format. Try again.")
            return
        recipient_str, amount_str = parts
        try:
            recipient = PublicKey(recipient_str)
            amount = float(amount_str)
            if amount <= 0:
                raise ValueError("Amount must be positive.")
        except Exception as e:
            await update.message.reply_text(f"❌ Invalid input: {e}")
            return

        wallet = user_wallets[user_id]
        async with AsyncClient(SOLANA_RPC_URL) as client:
            balance_resp = await client.get_balance(wallet.public_key)
            balance_lamports = balance_resp["result"]["value"]
            amount_lamports = int(amount * 1_000_000_000)
            fee_lamports = 5000
            if balance_lamports < amount_lamports + fee_lamports:
                await update.message.reply_text(
                    f"❌ Insufficient balance. You have {balance_lamports / 1_000_000_000} SOL."
                )
                return
            tx = Transaction()
            tx.add(
                transfer(
                    TransferParams(
                        from_pubkey=wallet.public_key,
                        to_pubkey=recipient,
                        lamports=amount_lamports,
                    )
                )
            )
            try:
                resp = await client.send_transaction(tx, wallet)
                await update.message.reply_text(
                    f"✅ Withdrawal sent!\nTransaction signature:\n{resp['result']}"
                )
            except Exception as e:
                await update.message.reply_text(f"❌ Transaction failed: {e}")
        return

    if context.user_data.get("expecting_honeypot"):
        context.user_data["expecting_honeypot"] = False
        token_mint = text
        url = f"https://api.honeypotchecker.io/check?token={token_mint}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status != 200:
                        raise Exception("API request failed")
                    data = await resp.json()
            if data.get("honeypot"):
                await update.message.reply_text(
                    f"\ud83d\udea8 Warning: Token {token_mint} is a Honeypot!"
                )
            else:
                await update.message.reply_text(
                    f"✅ Token {token_mint} is NOT a Honeypot."
                )
        except Exception as e:
            await update.message.reply_text(f"❌ Error checking token: {e}")
        return

    if context.user_data.get("expecting_buy"):
        context.user_data["expecting_buy"] = False
        await update.message.reply_text(
            "Buy token feature is not implemented yet. Coming soon!"
        )
        return

    if context.user_data.get("expecting_sell"):
        context.user_data["expecting_sell"] = False
        await update.message.reply_text(
            "Sell token feature is not implemented yet. Coming soon!"
        )
        return

    await update.message.reply_text("❓ Unknown command or input. Use /start.")

def main():
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    print("Bot started...")
    app.run_polling()

if __name__ == "__main__":
    main()
