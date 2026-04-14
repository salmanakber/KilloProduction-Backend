# Prisma Schema Update Required for Auto-Parts Chat

The auto-parts chat functionality requires the following models to be added to the Prisma schema:

```prisma
model AutoPartsChat {
  id        String   @id @default(cuid())
  userId    String
  vendorId  String
  requestId String?
  offerId   String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  AutoPartsChatMessage[]
  user      User     @relation("AutoPartsChatUser", fields: [userId], references: [id], onDelete: Cascade)
  vendor    User     @relation("AutoPartsChatVendor", fields: [vendorId], references: [id], onDelete: Cascade)

  @@map("auto_parts_chats")
}

model AutoPartsChatMessage {
  id        String        @id @default(cuid())
  chatId    String
  senderId  String
  message   String
  type      MessageType   @default(TEXT)
  fileUrl   String?
  isRead    Boolean       @default(false)
  createdAt DateTime      @default(now())
  chat      AutoPartsChat @relation(fields: [chatId], references: [id], onDelete: Cascade)
  sender    User          @relation("AutoPartsChatMessageSender", fields: [senderId], references: [id])

  @@map("auto_parts_chat_messages")
}
```

And update the User model to include:
```prisma
autoPartsChatsAsUser    AutoPartsChat[]           @relation("AutoPartsChatUser")
autoPartsChatsAsVendor  AutoPartsChat[]           @relation("AutoPartsChatVendor")
autoPartsChatMessages   AutoPartsChatMessage[]    @relation("AutoPartsChatMessageSender")
```

After adding these models, run:
```bash
npx prisma migrate dev --name add_auto_parts_chat
npx prisma generate
```


