# -*- coding: utf-8 -*-
"""
顶点小说 (www.xsbook.org) 指定小说正文爬虫（并发版）
流程：搜索书名 → 选择 → 抓前 N 章 → 合并 TXT
"""
import time
import re
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "http://www.xsbook.org"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
}

# 全局 cookie jar，所有线程共享
_COOKIE_JAR = None


def _new_session():
    """创建已过 cookie 挑战的 session"""
    s = requests.Session()
    s.headers.update(HEADERS)
    s.cookies.update(_COOKIE_JAR or {})
    return s


def _init_cookies():
    """首次调用时完成 cookie 挑战，拿到 cookie 后所有线程复用"""
    global _COOKIE_JAR
    if _COOKIE_JAR is not None:
        return
    s = requests.Session()
    s.headers.update(HEADERS)
    s.get(BASE + "/xclass/1/1.html", timeout=30)
    time.sleep(1)
    s.get(BASE + "/xclass/1/1.html", headers={"Referer": BASE + "/xclass/1/1.html"}, timeout=30)
    _COOKIE_JAR = s.cookies


def get(url):
    """带重试的 GET，返回 BeautifulSoup"""
    _init_cookies()
    s = _new_session()
    for attempt in range(3):
        try:
            r = s.get(url, headers={"Referer": url}, timeout=30)
            if r.status_code == 200 and len(r.text) > 500:
                r.encoding = "utf-8"
                return BeautifulSoup(r.text, "lxml")
        except Exception:
            pass
        time.sleep(1)
    raise Exception(f"无法访问 {url}")


def search(keyword):
    """搜索小说，返回 [(书名, 作者, 链接), ...]"""
    url = f"{BASE}/searchf0.html?searchkey={requests.utils.quote(keyword)}"
    soup = get(url)
    results = []
    for item in soup.select(".item"):
        dt = item.select_one("dt a")
        if not dt:
            continue
        title = dt.get("title") or dt.get_text(strip=True)
        href = dt.get("href", "")
        author = ""
        btm = item.select_one(".btm a")
        if btm:
            author = btm.get_text(strip=True)
        results.append((title, author, href))
    return results


def get_chapters(book_url, max_chapters=None):
    """从书籍详情页获取章节列表，返回 [(标题, 链接), ...]"""
    soup = get(BASE + book_url)
    dts = soup.select("#list dt")
    if len(dts) < 2:
        return []
    start = dts[1]
    chapters = []
    for sib in start.find_next_siblings():
        if sib.name == "dt":
            break
        if sib.name == "a" and sib.get("rel") == ["chapter"]:
            title = sib.get("title") or sib.get_text(strip=True)
            href = sib.get("href", "")
            chapters.append((title, href))
    if max_chapters:
        chapters = chapters[:max_chapters]
    return chapters


def _fetch_one_chapter(args):
    """抓取单章（供线程池调用），返回 (索引, 章节标题, 正文)"""
    i, ch_title, ch_url = args
    _init_cookies()
    s = _new_session()

    parts = []
    url = BASE + ch_url
    while True:
        try:
            r = s.get(url, headers={"Referer": url}, timeout=30)
            r.encoding = "utf-8"
            soup = BeautifulSoup(r.text, "lxml")
            content = soup.select_one("#chaptercontent")
            if content:
                parts.append(content.get_text("\n", strip=True))
            nxt = soup.select_one("a#next_url")
            if nxt and nxt.get("href") and not nxt["href"].startswith("javascript"):
                url = BASE + nxt["href"]
            else:
                break
        except Exception:
            break
    return (i, ch_title, "\n".join(parts))


def crawl_chapters(chapters, workers=8):
    """并发抓取所有章节，保持原始顺序"""
    tasks = [(i, title, url) for i, (title, url) in enumerate(chapters)]
    results = {}
    done = 0
    total = len(tasks)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_one_chapter, t): t for t in tasks}
        for fut in as_completed(futures):
            i, ch_title, text = fut.result()
            results[i] = (ch_title, text)
            done += 1
            print(f"\r  抓取进度: {done}/{total}", end="", flush=True)

    print()
    return [results[i] for i in range(total)]


if __name__ == "__main__":
    keyword = input("输入要搜索的书名关键词：").strip()
    if not keyword:
        print("未输入关键词，退出。")
        exit(1)

    results = search(keyword)
    if not results:
        print("未找到匹配结果。")
        exit(1)

    print(f"\n找到 {len(results)} 个结果：")
    for i, (title, author, href) in enumerate(results, 1):
        print(f"  [{i}] {title}（{author}）")

    idx = input("\n输入序号选择（默认 1）：").strip()
    idx = int(idx) - 1 if idx.isdigit() else 0

    title, author, book_url = results[idx]
    print(f"\n已选择：{title}")

    n = input("抓取前几章？（默认 5）：").strip()
    n = int(n) if n.isdigit() else 5

    workers = input("并发线程数（默认 8，网好可开 15）：").strip()
    workers = int(workers) if workers.isdigit() else 8

    print("正在获取章节列表...")
    chapters = get_chapters(book_url, max_chapters=n)
    print(f"共 {len(chapters)} 章，{workers} 线程并发抓取...\n")

    t0 = time.time()
    results = crawl_chapters(chapters, workers=workers)
    elapsed = time.time() - t0

    lines = [title, f"作者：{author}", "=" * 50, ""]
    for i, (ch_title, text) in enumerate(results, 1):
        lines.append(f"\n第{i}章  {ch_title}\n\n")
        lines.append(text)

    fname = re.sub(r'[\\/*?:"<>|]', "_", title) + ".txt"
    out_path = f"F:/爬虫/{fname}"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("".join(lines))

    print(f"完成！{len(results)} 章耗时 {elapsed:.1f} 秒，已保存到 {out_path}")