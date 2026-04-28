import { adaptGeneric } from "./generic";
import { githubAdapter } from "./github";
import { weixinAdapter } from "./weixin";
import { zhihuAdapter } from "./zhihu";
import type { AdaptedContent, DomainAdapter, ExtractionContext } from "./types";

const DOMAIN_ADAPTERS: DomainAdapter[] = [githubAdapter, weixinAdapter, zhihuAdapter];

export function adaptPage(root: HTMLElement, context: ExtractionContext): AdaptedContent {
  for (const adapter of DOMAIN_ADAPTERS) {
    if (!adapter.match(root, context)) {
      continue;
    }

    const adapted = adapter.transform(root, context);
    if (adapted) {
      return adapted;
    }
  }

  return adaptGeneric(root, context);
}
