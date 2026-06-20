-- CreateEnum
CREATE TYPE "VkDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "VkConversation" (
    "id" TEXT NOT NULL,
    "peerId" INTEGER NOT NULL,
    "peerType" TEXT NOT NULL DEFAULT 'user',
    "clientName" TEXT NOT NULL DEFAULT '',
    "clientAvatar" TEXT,
    "lastMessageText" TEXT NOT NULL DEFAULT '',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "crmStatus" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VkConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "vkMessageId" INTEGER NOT NULL,
    "direction" "VkDirection" NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "senderName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VkMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkClient" (
    "id" TEXT NOT NULL,
    "peerId" INTEGER NOT NULL,
    "fio" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "source" TEXT,
    "note" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "VkClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VkConversation_peerId_key" ON "VkConversation"("peerId");
CREATE INDEX "VkConversation_lastMessageAt_idx" ON "VkConversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "VkMessage_conversationId_vkMessageId_key" ON "VkMessage"("conversationId", "vkMessageId");
CREATE INDEX "VkMessage_conversationId_createdAt_idx" ON "VkMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VkClient_peerId_key" ON "VkClient"("peerId");

-- AddForeignKey
ALTER TABLE "VkMessage" ADD CONSTRAINT "VkMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "VkConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkClient" ADD CONSTRAINT "VkClient_peerId_fkey"
    FOREIGN KEY ("peerId") REFERENCES "VkConversation"("peerId") ON DELETE RESTRICT ON UPDATE CASCADE;
