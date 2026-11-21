import type { HomeMediaRead } from "../public-design/home-media";
import { latestPublicArticle } from "./public-media";

// Keep only the last identifier. A second anonymous read must still permit
// this item before any title, excerpt or source link can be shown.
export function createHomeArticleReader() {
  let lastPublicId: string | null = null;
  return async (list: HomeMediaRead, readOne: (id: string) => Promise<HomeMediaRead>) => {
    if (list.state !== "unavailable") {
      const article = latestPublicArticle(list.items);
      lastPublicId = article?.id ?? null;
      return { article, recovered: false };
    }
    const id = lastPublicId;
    if (!id) return { article: null, recovered: false };
    const lookup = await readOne(id);
    const article = lookup.state === "ready" ? latestPublicArticle(lookup.items.filter(item => item.id === id)) : null;
    if (lookup.state !== "unavailable" && !article && lastPublicId === id) lastPublicId = null;
    return { article, recovered: article !== null };
  };
}
