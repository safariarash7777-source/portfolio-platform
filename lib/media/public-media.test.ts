import assert from "node:assert/strict";
import test from "node:test";
import type { ContentItem } from "../content-hub";
import { latestPublicArticle, publicMediaItems } from "./public-media";

const post: ContentItem = {
  id: "11111111-1111-4111-8111-111111111111", platform: "telegram", kind: "post",
  title: "متن منتشرشده", description: "شرح و استدلال روشن دربارهٔ بازار. ".repeat(12),
  content_url: "https://t.me/arashsafariiiiiiii/3267", published_at: "2026-11-10T10:00:00Z",
};
test("the reading lead needs a substantial standalone body; a caption and a podcast chapter list stay in the archive", () => {
  const teaser = { ...post, description: null, content_url:"https://t.me/arashsafariiiiiiii/3291" };
  const podcast = { ...post, description:"00:44 انتخابات\n04:18 تحلیل\n"+post.description };
  assert.equal(latestPublicArticle([teaser, podcast, post]), post);
  assert.equal(latestPublicArticle([teaser]), null);
});
test("archive and deep links accept only publicly published rows from the public Telegram channel", () => {
  const denied = [{ is_private:true }, { visibility:"paid" }, { audience:"members" },
    { deleted_at:"2026-11-11" }, { published_at:"2099-11-11T12:00:00Z" },
    { content_url:"https://t.me/c/1111/29" }, { content_url:"https://t.me/course_channel/29" }];
  for(const patch of denied) assert.deepEqual(publicMediaItems([{...post,...patch}]),[]);
  assert.equal(publicMediaItems([post])[0]?.id,post.id);
});
