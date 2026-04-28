import type { ExtractResult } from "../../contracts/extract-result";
import type { RuntimeMessage } from "../../contracts/runtime";

function storageKey(tabId: number): string {
  return `last-result:${tabId}`;
}

async function setLastResult(tabId: number, result: ExtractResult): Promise<void> {
  await chrome.storage.session.set({
    [storageKey(tabId)]: result
  });
}

async function getLastResult(tabId: number): Promise<ExtractResult | null> {
  const stored = await chrome.storage.session.get(storageKey(tabId));
  return (stored[storageKey(tabId)] as ExtractResult | undefined) ?? null;
}

async function clearLastResult(tabId: number): Promise<void> {
  await chrome.storage.session.remove(storageKey(tabId));
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearLastResult(tabId);
});

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
        await setLastResult(senderTabId, message.payload);
      }
      return { ok: true };
    case "store-result":
      await setLastResult(message.tabId, message.payload);
      return { ok: true };
    case "get-last-result":
      return { result: await getLastResult(message.tabId) };
    default:
      return { ok: false, error: "Unsupported message." };
  }
}
