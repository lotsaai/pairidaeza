// What a chat's screen keeps while the user looks elsewhere: unsent text, the message being replied to, which reply is "spoken".
import { signal } from "nsh";
import { botById, type Message, type Reply } from "../../store";

/** Each chat's unsent text. */
const drafts = signal<Record<string, string>>({});
export const draftOf = (chatId: string) => drafts()[chatId] ?? "";
export const setDraft = (chatId: string, text: string) => drafts.update((all) => ({ ...all, [chatId]: text }));

/** The message each chat's composer is replying to. */
const replies = signal<Record<string, Reply | undefined>>({});
export const replyOf = (chatId: string) => replies()[chatId];
export const setReply = (chatId: string, reply: Reply | undefined) => replies.update((all) => ({ ...all, [chatId]: reply }));

/** A message's words with markdown's marks dropped: what Copy puts on the clipboard for a card, and what a reply quotes. */
export function plainText(message: Message) {
  switch (message.kind) {
    case "user":
      return message.text;
    case "bot":
      return message.markdown;
    case "ask":
      return message.text;
    default:
      return "";
  }
}

const quoteOf = (text: string) =>
  text
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Starts a reply to `message` in its chat's composer. */
export function replyTo(chatId: string, message: Message) {
  const author = message.kind === "user" ? "You" : message.kind === "date" ? "" : (botById(message.botId)?.name ?? "Bot");
  setReply(chatId, { author, text: quoteOf(plainText(message)) });
}

/** The reply being read aloud, or null. No audio plays: Speak only shows the state a voice would. */
export const speakingId = signal<string | null>(null);
let speakRun = 0;

/** Starts or stops reading a reply; a long one takes longer to finish. */
export function toggleSpeak(message: Message) {
  const run = ++speakRun;
  if (speakingId() === message.id) return speakingId.set(null);
  speakingId.set(message.id);
  setTimeout(() => speakRun === run && speakingId.set(null), Math.min(8000, 1500 + plainText(message).length * 25));
}
