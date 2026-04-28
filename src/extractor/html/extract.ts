export function extractPageHtml(document: Document): HTMLElement {
  return document.body.cloneNode(true) as HTMLElement;
}

export function extractSelectionHtml(element: HTMLElement): HTMLElement {
  return element.cloneNode(true) as HTMLElement;
}
