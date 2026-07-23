import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock3, Flame, RefreshCcw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { api, type NovelListQuery } from '../api/client';
import type {
  Category,
  HotSearchItem,
  Novel,
  PaginatedNovels,
  PersonalizedRecommendationResponse,
  RecommendSlot,
  SearchHistoryItem,
  SearchSuggestion,
  Tag,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { NovelCover } from '../components/NovelCover';
import { formatWordCount } from '../utils/format';

const channels = [
  { id: '', name: '全部' },
  { id: 'male', name: '男频' },
  { id: 'female', name: '女频' },
  { id: 'short', name: '短篇' },
  { id: 'published', name: '出版' },
];

const statuses = [
  { id: '', name: '全部' },
  { id: 'SERIALIZING', name: '连载' },
  { id: 'COMPLETED', name: '完结' },
] as const;

const sorts = [
  { id: 'latest', name: '最新' },
  { id: 'popular', name: '热读' },
  { id: 'comments', name: '评论' },
  { id: 'bookshelf', name: '收藏' },
] as const;

type NovelStatusFilter = NonNullable<NovelListQuery['status']>;
type NovelSortFilter = NonNullable<NovelListQuery['sort']>;

export function CatalogPage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [novels, setNovels] = useState<PaginatedNovels>();
  const [recommendSlot, setRecommendSlot] = useState<RecommendSlot>();
  const [personalizedRecommendations, setPersonalizedRecommendations] =
    useState<PersonalizedRecommendationResponse>();
  const [keywordInput, setKeywordInput] = useState(searchParams.get('keyword') ?? '');
  const [hotSearches, setHotSearches] = useState<HotSearchItem[]>([]);
  const [searchHistories, setSearchHistories] = useState<SearchHistoryItem[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const query = useMemo<NovelListQuery>(
    () => ({
      page: Number(searchParams.get('page') ?? '1'),
      pageSize: 12,
      keyword: searchParams.get('keyword') ?? undefined,
      channel: searchParams.get('channel') ?? undefined,
      categoryId: searchParams.get('categoryId') ?? undefined,
      tagId: searchParams.get('tagId') ?? undefined,
      status: (searchParams.get('status') as NovelStatusFilter | null) ?? undefined,
      sort: (searchParams.get('sort') as NovelSortFilter | null) ?? 'latest',
    }),
    [searchParams],
  );

  const hasFilters = Boolean(
    query.keyword ||
    query.channel ||
    query.categoryId ||
    query.tagId ||
    query.status ||
    (query.sort && query.sort !== 'latest'),
  );

  useEffect(() => {
    setKeywordInput(searchParams.get('keyword') ?? '');
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    async function loadSearchDiscovery() {
      const [hot, histories] = await Promise.all([
        api.listHotSearches(8).catch(() => []),
        token ? api.listSearchHistories(token, 8).catch(() => []) : Promise.resolve([]),
      ]);
      if (isMounted) {
        setHotSearches(hot);
        setSearchHistories(histories);
      }
    }

    void loadSearchDiscovery();
    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    let isMounted = true;
    if (!token) {
      setPersonalizedRecommendations(undefined);
      return;
    }

    api
      .getPersonalizedRecommendations(token, 6)
      .then((result) => {
        if (isMounted) {
          setPersonalizedRecommendations(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPersonalizedRecommendations(undefined);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    const keyword = keywordInput.trim();
    if (!isSearchOpen || keyword.length === 0) {
      setSearchSuggestions([]);
      setIsSuggestionLoading(false);
      return;
    }

    let isMounted = true;
    setIsSuggestionLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const suggestions = await api.listSearchSuggestions(keyword, 8);
        if (isMounted) {
          setSearchSuggestions(suggestions);
        }
      } catch {
        if (isMounted) {
          setSearchSuggestions([]);
        }
      } finally {
        if (isMounted) {
          setIsSuggestionLoading(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [isSearchOpen, keywordInput]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(undefined);
      try {
        const [categoryList, tagList, novelList, slot] = await Promise.all([
          api.listCategories(query.channel),
          api.listTags(),
          api.listNovels(query),
          api.getRecommendSlot('home_featured').catch(() => undefined),
        ]);

        if (isMounted) {
          setCategories(categoryList);
          setTags(tagList);
          setNovels(novelList);
          setRecommendSlot(slot);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '加载失败');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [query]);

  function updateQuery(
    next: Record<string, string | undefined>,
    options: { resetPage?: boolean } = {},
  ) {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    if (options.resetPage ?? true) {
      params.delete('page');
    }
    navigate({ pathname: '/', search: params.toString() });
  }

  function goToPage(page: number) {
    updateQuery({ page: String(page) }, { resetPage: false });
  }

  function resetFilters() {
    setKeywordInput('');
    navigate({ pathname: '/', search: '' });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    performSearch(keywordInput);
  }

  function performSearch(value: string) {
    const keyword = value.trim();
    setKeywordInput(keyword);
    setIsSearchOpen(false);
    setSearchSuggestions([]);
    updateQuery({ keyword: keyword || undefined });

    if (!keyword) {
      return;
    }

    void api
      .recordSearch(keyword, token)
      .then((recorded) => {
        if (recorded.history) {
          setSearchHistories((current) =>
            [
              recorded.history as SearchHistoryItem,
              ...current.filter((item) => item.id !== recorded.history?.id),
            ].slice(0, 8),
          );
        }
        setHotSearches((current) => {
          const existing = current.find((item) => item.keyword === recorded.keyword);
          const next = existing
            ? current.map((item) =>
                item.keyword === recorded.keyword
                  ? { ...item, searchCount: recorded.searchCount }
                  : item,
              )
            : [
                {
                  id: recorded.keyword,
                  keyword: recorded.keyword,
                  searchCount: recorded.searchCount,
                  lastSearchedAt: new Date().toISOString(),
                },
                ...current,
              ];
          return [...next].sort((a, b) => b.searchCount - a.searchCount).slice(0, 8);
        });
      })
      .catch(() => undefined);
  }

  function selectSuggestion(suggestion: SearchSuggestion) {
    setIsSearchOpen(false);
    setSearchSuggestions([]);
    if (suggestion.novelId) {
      navigate(`/novels/${suggestion.novelId}`);
      return;
    }
    if (suggestion.authorId) {
      navigate(`/authors/${suggestion.authorId}`);
      return;
    }
    performSearch(suggestion.keyword);
  }

  async function removeHistory(historyId: string) {
    if (!token) {
      return;
    }
    try {
      await api.removeSearchHistory(token, historyId);
      setSearchHistories((current) => current.filter((item) => item.id !== historyId));
    } catch {
      return;
    }
  }

  async function clearHistories() {
    if (!token) {
      return;
    }
    try {
      await api.clearSearchHistories(token);
      setSearchHistories([]);
    } catch {
      return;
    }
  }

  const personalizedFeatured = !hasFilters
    ? (personalizedRecommendations?.items.slice(0, 3) ?? [])
    : [];
  const featured: Array<{ novel: Novel; reason?: string }> =
    personalizedFeatured.length > 0
      ? personalizedFeatured
      : !hasFilters && recommendSlot?.items.length
        ? recommendSlot.items.slice(0, 3).map((item) => ({ novel: item.novel }))
        : (novels?.items.slice(0, 3).map((novel) => ({ novel })) ?? []);
  const featuredTitle = hasFilters
    ? '搜索与筛选结果'
    : personalizedFeatured.length > 0
      ? '为你推荐'
      : recommendSlot?.name || '编辑推荐';
  const ranking = [...(novels?.items ?? [])].sort((a, b) => b.wordCount - a.wordCount).slice(0, 5);
  const total = novels?.pagination.total ?? 0;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">原创小说平台 MVP</p>
          <h1>发现下一本想追的故事</h1>
        </div>
        <div
          className="search-area"
          onFocus={() => setIsSearchOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsSearchOpen(false);
            }
          }}
        >
          <form className="search-box" onSubmit={submitSearch}>
            <Search size={18} aria-hidden />
            <input
              aria-label="搜索书名、作者或关键词"
              aria-autocomplete="list"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setIsSearchOpen(false);
                }
              }}
              placeholder="搜索书名、作者或关键词"
              aria-expanded={isSearchOpen}
              aria-controls="search-discovery-popover"
              role="combobox"
            />
          </form>

          {isSearchOpen && (
            <div
              className="search-discovery-popover"
              id="search-discovery-popover"
              role="dialog"
              aria-label="搜索建议"
            >
              {keywordInput.trim() ? (
                <SearchSuggestionList
                  isLoading={isSuggestionLoading}
                  suggestions={searchSuggestions}
                  onSelect={selectSuggestion}
                />
              ) : (
                <>
                  {searchHistories.length > 0 && (
                    <SearchHistoryList
                      histories={searchHistories}
                      onClear={() => void clearHistories()}
                      onRemove={(historyId) => void removeHistory(historyId)}
                      onSelect={performSearch}
                    />
                  )}
                  <HotSearchList items={hotSearches} onSelect={performSearch} />
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <FilterGroup label="频道">
        {channels.map((channel) => (
          <button
            className={
              query.channel === channel.id || (!query.channel && channel.id === '') ? 'active' : ''
            }
            key={channel.id || 'all'}
            type="button"
            aria-pressed={
              query.channel === channel.id || (!query.channel && channel.id === '')
            }
            onClick={() => updateQuery({ channel: channel.id || undefined, categoryId: undefined })}
          >
            {channel.name}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="分类">
        <button
          className={!query.categoryId ? 'active' : ''}
          type="button"
          aria-pressed={!query.categoryId}
          onClick={() => updateQuery({ categoryId: undefined })}
        >
          全部
        </button>
        {categories.map((category) => (
          <button
            className={query.categoryId === category.id ? 'active' : ''}
            key={category.id}
            type="button"
            aria-pressed={query.categoryId === category.id}
            onClick={() => updateQuery({ categoryId: category.id })}
          >
            {category.name}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="标签">
        <button
          className={!query.tagId ? 'active' : ''}
          type="button"
          aria-pressed={!query.tagId}
          onClick={() => updateQuery({ tagId: undefined })}
        >
          全部
        </button>
        {tags.map((tag) => (
          <button
            className={query.tagId === tag.id ? 'active' : ''}
            key={tag.id}
            type="button"
            aria-pressed={query.tagId === tag.id}
            onClick={() => updateQuery({ tagId: tag.id })}
          >
            {tag.name}
          </button>
        ))}
      </FilterGroup>

      <section className="filter-toolbar" aria-label="状态和排序">
        <FilterGroup label="状态" compact>
          {statuses.map((status) => (
            <button
              className={
                query.status === status.id || (!query.status && status.id === '') ? 'active' : ''
              }
              key={status.id || 'all'}
              type="button"
              aria-pressed={
                query.status === status.id || (!query.status && status.id === '')
              }
              onClick={() => updateQuery({ status: status.id || undefined })}
            >
              {status.name}
            </button>
          ))}
        </FilterGroup>

        <FilterGroup label="排序" compact>
          {sorts.map((sort) => (
            <button
              className={query.sort === sort.id ? 'active' : ''}
              key={sort.id}
              type="button"
              aria-pressed={query.sort === sort.id}
              onClick={() => updateQuery({ sort: sort.id === 'latest' ? undefined : sort.id })}
            >
              {sort.name}
            </button>
          ))}
        </FilterGroup>
      </section>

      {hasFilters && (
        <div className="search-summary">
          <span>已筛选出 {total} 本作品</span>
          <button type="button" onClick={resetFilters}>
            <X size={16} aria-hidden />
            清空筛选
          </button>
        </div>
      )}

      <section className="layout-grid">
        <div className="main-column">
          <section className="panel">
            <div className="section-title">
              <h2>{featuredTitle}</h2>
              <button
                type="button"
                onClick={() =>
                  updateQuery({ sort: query.sort === 'popular' ? undefined : 'popular' })
                }
              >
                <RefreshCcw size={16} aria-hidden />
                {query.sort === 'popular' ? '最新' : '热读'}
              </button>
            </div>

            {isLoading && <StateLine text="加载中..." />}
            {error && <StateLine text={`无法连接数据服务：${error}`} />}
            {!isLoading && !error && featured.length === 0 && <StateLine text="暂无作品" />}

            <div className="novel-grid">
              {featured.map((item) => (
                <NovelCard key={item.novel.id} novel={item.novel} reason={item.reason} />
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <h2>书库</h2>
              <span className="muted">{total} 本</span>
            </div>
            <div className="list-stack">
              {(novels?.items ?? []).map((novel) => (
                <NovelRow key={novel.id} novel={novel} />
              ))}
            </div>
            {novels && novels.pagination.totalPages > 1 && (
              <PaginationControls
                page={novels.pagination.page}
                totalPages={novels.pagination.totalPages}
                onPageChange={goToPage}
              />
            )}
          </section>
        </div>

        <aside className="side-column">
          <section className="panel">
            <h2>热读榜</h2>
            <ol className="rank-list">
              {ranking.map((novel, index) => (
                <li key={novel.id}>
                  <span>{index + 1}</span>
                  <Link to={`/novels/${novel.id}`}>{novel.title}</Link>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel compact">
            <h2>最近更新</h2>
            <p>{novels?.items[0]?.title ?? '暂无更新'}</p>
          </section>
        </aside>
      </section>
    </>
  );
}

function SearchSuggestionList({
  isLoading,
  suggestions,
  onSelect,
}: {
  isLoading: boolean;
  suggestions: SearchSuggestion[];
  onSelect: (suggestion: SearchSuggestion) => void;
}) {
  return (
    <section className="search-discovery-section" aria-label="搜索联想">
      <div className="search-discovery-heading">
        <span>搜索联想</span>
      </div>
      {isLoading && <p className="search-discovery-empty">正在查找...</p>}
      {!isLoading && suggestions.length === 0 && (
        <p className="search-discovery-empty">没有匹配的作品、作者或标签</p>
      )}
      <div className="search-discovery-list">
        {suggestions.map((suggestion) => (
          <button
            className="search-discovery-option"
            key={`${suggestion.type}:${suggestion.label}`}
            type="button"
            onClick={() => onSelect(suggestion)}
          >
            <Search size={15} aria-hidden />
            <span>
              <strong>{suggestion.label}</strong>
              <small>{suggestion.description}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SearchHistoryList({
  histories,
  onClear,
  onRemove,
  onSelect,
}: {
  histories: SearchHistoryItem[];
  onClear: () => void;
  onRemove: (historyId: string) => void;
  onSelect: (keyword: string) => void;
}) {
  return (
    <section className="search-discovery-section" aria-label="搜索历史">
      <div className="search-discovery-heading">
        <span>
          <Clock3 size={15} aria-hidden />
          搜索历史
        </span>
        <button type="button" onClick={onClear} aria-label="清空搜索历史" title="清空搜索历史">
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
      <div className="search-discovery-list">
        {histories.map((history) => (
          <div className="search-history-row" key={history.id}>
            <button
              className="search-discovery-option"
              type="button"
              onClick={() => onSelect(history.keyword)}
            >
              <span>{history.keyword}</span>
            </button>
            <button
              className="search-history-remove"
              type="button"
              onClick={() => onRemove(history.id)}
              aria-label={`删除搜索记录 ${history.keyword}`}
              title="删除这条记录"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HotSearchList({
  items,
  onSelect,
}: {
  items: HotSearchItem[];
  onSelect: (keyword: string) => void;
}) {
  return (
    <section className="search-discovery-section" aria-label="热门搜索">
      <div className="search-discovery-heading">
        <span>
          <Flame size={15} aria-hidden />
          热门搜索
        </span>
      </div>
      {items.length === 0 && <p className="search-discovery-empty">还没有热门搜索</p>}
      <div className="search-hot-list">
        {items.map((item, index) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.keyword)}>
            <span>{index + 1}</span>
            {item.keyword}
          </button>
        ))}
      </div>
    </section>
  );
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="pagination-bar" aria-label="书库分页">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        上一页
      </button>
      <span>
        第 {page} / {totalPages} 页
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        下一页
      </button>
    </nav>
  );
}

function FilterGroup({
  label,
  compact = false,
  children,
}: {
  label: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`filter-group${compact ? ' compact-filter' : ''}`} aria-label={label}>
      <span>{label}</span>
      <div className="filter-row">{children}</div>
    </section>
  );
}

function NovelCard({ novel, reason }: { novel: Novel; reason?: string }) {
  return (
    <Link className="novel-card" to={`/novels/${novel.id}`}>
      <NovelCover novel={novel} />
      <div className="novel-info">
        <div className="novel-card-badges">
          <span>{novel.category.name}</span>
          {reason && (
            <span className="recommendation-reason">
              <Sparkles size={12} aria-hidden />
              {reason}
            </span>
          )}
        </div>
        <h3>{novel.title}</h3>
        <p>{novel.summary}</p>
        <small>
          {authorDisplayName(novel)} · {formatWordCount(novel.wordCount)}
        </small>
      </div>
    </Link>
  );
}

function NovelRow({ novel }: { novel: Novel }) {
  return (
    <Link className="novel-row" to={`/novels/${novel.id}`}>
      <NovelCover novel={novel} size="mini" />
      <div>
        <h3>{novel.title}</h3>
        <p>{novel.summary}</p>
        <small>
          {novel.category.name} · {authorDisplayName(novel)} · {novel._count?.chapters ?? 0} 章 ·{' '}
          {novel._count?.comments ?? 0} 评
        </small>
      </div>
    </Link>
  );
}

function StateLine({ text }: { text: string }) {
  return <p className="state-line">{text}</p>;
}

function authorDisplayName(novel: Novel) {
  return novel.author.authorProfile?.penName ?? novel.author.nickname;
}
