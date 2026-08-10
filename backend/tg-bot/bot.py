import asyncio
import logging
import os
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message
from aiogram.filters import BaseFilter, Command
from aiogram.enums import ChatType

load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

message_map = {}


class ServiceMessageFilter(BaseFilter):
    async def __call__(self, message: Message) -> bool:
        service_fields = [
            'new_chat_members', 'left_chat_member', 'new_chat_title',
            'new_chat_photo', 'delete_chat_photo', 'pinned_message',
            'video_chat_started', 'video_chat_ended', 'video_chat_participants_invited',
            'video_chat_scheduled', 'group_chat_created', 'supergroup_chat_created',
            'channel_chat_created', 'migrate_to_chat_id', 'migrate_from_chat_id',
            'message_auto_delete_timer_changed', 'forum_topic_created',
            'forum_topic_closed', 'forum_topic_reopened', 'forum_topic_edited',
            'general_forum_topic_hidden', 'general_forum_topic_unhidden',
            'write_access_allowed', 'proximity_alert_triggered',
            'chat_shared', 'user_shared', 'web_app_data'
        ]

        return any(getattr(message, field, None) is not None for field in service_fields)


@dp.channel_post(ServiceMessageFilter())
async def handle_channel_service_message(message: Message):
    try:
        await message.delete()
        logger.info(f"Deleted channel service message in chat {message.chat.id}")
    except Exception as e:
        logger.error(f"Error deleting channel message: {e}")


@dp.message(ServiceMessageFilter())
async def handle_service_message(message: Message):
    try:
        await message.delete()
        logger.info(f"Deleted service message in chat {message.chat.id}")
    except Exception as e:
        logger.error(f"Error deleting message: {e}")


@dp.message(F.chat.type == ChatType.PRIVATE, Command("start"))
async def handle_start(message: Message):
    await message.answer("Hello! Send your message and it will be forwarded to the administrator.")


@dp.message(F.chat.type == ChatType.PRIVATE)
async def handle_user_message(message: Message):
    if message.from_user.id == ADMIN_ID:
        if message.reply_to_message:
            reply_msg_id = message.reply_to_message.message_id
            logger.info(f"Admin replied to message_id={reply_msg_id}, map keys: {list(message_map.keys())}")

            if reply_msg_id in message_map:
                original_user_id = message_map[reply_msg_id]
                try:
                    await bot.copy_message(
                        chat_id=original_user_id,
                        from_chat_id=message.chat.id,
                        message_id=message.message_id
                    )
                    logger.info(f"Admin replied to user {original_user_id}")
                except Exception as e:
                    logger.error(f"Error sending reply to user: {e}")
                    await message.answer(f"Error: {e}")
            else:
                logger.warning(f"Message ID {reply_msg_id} not found in map")
                await message.answer("Reply to the user's message, not the info message")
        else:
            logger.info("Admin sent message without reply")
        return

    try:
        user_info = f"From: {message.from_user.full_name}"
        if message.from_user.username:
            user_info += f" (@{message.from_user.username})"
        user_info += f"\nID: {message.from_user.id}"

        info_msg = await bot.send_message(
            chat_id=ADMIN_ID,
            text=user_info
        )

        copied = await bot.copy_message(
            chat_id=ADMIN_ID,
            from_chat_id=message.chat.id,
            message_id=message.message_id
        )

        message_map[info_msg.message_id] = message.from_user.id
        message_map[copied.message_id] = message.from_user.id

        logger.info(f"Forwarded message from {message.from_user.id} to admin, stored IDs: {info_msg.message_id}, {copied.message_id}")
    except Exception as e:
        logger.error(f"Error forwarding message to admin: {e}")


async def main():
    logger.info("Bot started")
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot, allowed_updates=["message", "channel_post", "edited_channel_post"])


if __name__ == '__main__':
    asyncio.run(main())
