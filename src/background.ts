import type { ExtractResult, RuntimeMessage } from "./lib/types";

const lastResultByTab = new Map<number, ExtractResult>();

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void handleMessage(message, sender?.tab?.id)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  return true;
});

async function handleMessage(message: RuntimeMessage, senderTabId?: number): Promise<unknown> {
  switch (message.type) {
    case "selection-complete":
      if (senderTabId !== undefined) {
        lastResultByTab.set(senderTabId, message.payload);
      }
      return { ok: true };
    case "store-result":
      lastResultByTab.set(message.tabId, message.payload);
      return { ok: true };
    case "get-last-result":
      return { result: lastResultByTab.get(message.tabId) ?? null };
    default:
      return { ok: false, error: "Unsupported message." };
  }
}
