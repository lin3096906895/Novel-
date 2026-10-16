# -*- coding: utf-8 -*-
"""
顶点小说 (www.xsbook.org) 分类列表爬虫
绕过 JS Cookie 挑战：第一次请求 set cookie，第二次带 cookie 请求真实页面
"""
import time
import json
import re
import requests
from bs4 import BeautifulSoup

BASE = "http://www.xsbook.org"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
}


def get_page(url):
    """带 cookie 挑战绕过的请求，返回 BeautifulSoup 对象"""
    session = requests.Session()
    session.headers.update(HEADERS)
    # 第一次请求：触发 JS 挑战，set cookie 并跳转
    r1 = session.get(url, timeout=20)
    # 第二次请求：带上 cookie 和 Referer，拿到真实内容
    time.sleep(0.5)
    r2 = session.get(url, headers={"Referer": url}, timeout=20)
    r2.encoding = "utf-8"
    return BeautifulSoup(r2.text, "lxml")


def parse_list(url):
    """解析分类列表页，返回该页所有书籍信息"""
    soup = get_page(url)
    books = []
    for item in soup.select(".item"):
        book = {}
        # 书名 + 链接
        dt = item.select_one("dt a")
        if dt:
            book["title"] = dt.get("title") or dt.get_text(strip=True)
            book["url"] = BASE + dt.get("href", "")
        # 封面
        img = item.select_one(".image img")
        book["cover"] = img.get("data-original") or img.get("src", "") if img else ""
        # 简介
        dd = item.select_one("dd")
        book["intro"] = dd.get_text(strip=True) if dd else ""
        # 作者 / 字数 / 更新日期
        btm = item.select_one(".btm")
        if btm:
            author_a = btm.select_one("a")
            book["author"] = author_a.get_text(strip=True) if author_a else ""
            ems = btm.select("em")
            for em in ems:
                txt = em.get_text(strip=True)
                if "万字" in txt:
                    book["word_count"] = txt
                elif re.match(r"\d{2}-\d{2}", txt):
                    book["update_date"] = txt
        books.append(book)
    return books


def get_total_pages(url):
    """从分页栏解析总页数"""
    soup = get_page(url)
    last = soup.select_one(".pagination .last a")
    if last:
        href = last.get("href", "")
        m = re.search(r"/(\d+)\.html$", href)
        if m:
            return int(m.group(1))
    return 1


def crawl_category(cat_id, max_pages=None, delay=1.0):
    """抓取整个分类（可限制页数），返回书籍列表"""
    first_url = f"{BASE}/xclass/{cat_id}/1.html"
    total = get_total_pages(first_url)
    if max_pages:
        total = min(total, max_pages)
    print(f"分类 {cat_id} 共 {total} 页，开始抓取...")

    all_books = []
    for page in range(1, total + 1):
        url = f"{BASE}/xclass/{cat_id}/{page}.html"
        try:
            books = parse_list(url)
            all_books.extend(books)
            print(f"  第 {page}/{total} 页：{len(books)} 本，累计 {len(all_books)} 本")
        except Exception as e:
            print(f"  第 {page} 页抓取失败：{e}")
        time.sleep(delay)
    return all_books


if __name__ == "__main__":
    # 玄幻 = 1，可改成其他分类：2武侠 3女频 4现代 5历史 6游戏 7科幻 8美文 9其他
    CAT_ID = 1
    MAX_PAGES = 3  # 先抓 3 页测试，改成 None 抓全站 815 页
    DELAY = 1.0

    books = crawl_category(CAT_ID, max_pages=MAX_PAGES, delay=DELAY)

    out_file = f"F:/爬虫/xclass_{CAT_ID}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(books, f, ensure_ascii=False, indent=2)

    print(f"\n完成！共 {len(books)} 本，已保存到 {out_file}")
