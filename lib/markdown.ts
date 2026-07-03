// رندرِ Markdown سادهٔ بدون وابستگی. ورودی اول escape می‌شود (ضدِ XSS)، سپس
// چند الگوی محدود اعمال می‌گردد: تیتر، بولد/ایتالیک، لینکِ http(s)، لیست،
// و پاراگراف. برای پیش‌نمایشِ ادمین و کارتِ کاربر استفاده می‌شود.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  // لینک — فقط http/https مجاز
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
  });
  // بولد سپس ایتالیک
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // کدِ درون‌خطی
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

/** Markdown سادهٔ امن → HTML. برای dangerouslySetInnerHTML. */
export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md ?? "").split(/\r?\n/);
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      closeList();
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length + 2; // # → h3, ## → h4, ### → h5
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}

/** نسخهٔ متنِ خام برای تلگرام (بدون HTML؛ فقط پاک‌سازیِ نشانه‌های ساده). */
export function markdownToPlain(md: string): string {
  return (md ?? "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .trim();
}
