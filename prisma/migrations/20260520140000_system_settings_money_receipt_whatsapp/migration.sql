-- Store money-receipt WhatsApp / delivery config on global system settings (moved from money_transfer_config.metadata)
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "moneyReceiptWhatsapp" JSONB;
