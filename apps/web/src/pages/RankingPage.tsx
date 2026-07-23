import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookMarked, MessageCircle, Sparkles, TrendingUp } from 'lucide-react';
import { api } from '../api/client';
import type { RankingPeriod, RankingResponse, RankingType } from '../api/types';
import { NovelCover } from '../components/NovelCover';

const rankingTypes: Array<{
  id: RankingType;
  label: string;
  description: string;
  icon: typeof TrendingUp;
}> = [
  { id: 'popular', label: '热读榜', description: '按读者完成章节的次数排序', icon: TrendingUp },
  { id: 'bookshelf', label: '收藏榜', description: '按周期内新增书架收藏排序', icon: BookMarked },
  { id: 'comments', label: '讨论榜', description: '按周期内新增评论数量排序', icon: MessageCircle },
  { id: 'new', label: '新书榜', description: '按上架时间排序', icon: Sparkles },
];

const rankingPeriods: Array<{ id: RankingPeriod; label: string }> = [
  { id: 'day', label: '日榜' },
  { id: 'week', label: '周榜' },
  { id: 'month', label: '月榜' },
  { id: 'all', label: '总榜' },
];

const channels = [
  { id: '', label: '全部频道' },
  { id: 'male', label: '男频' },
  { id: 'female', label: '女频' },
  { id: 'short', label: '短篇' },
  { id: 'published', label: '出版' },
];

export function RankingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const query = useMemo(
    () => ({
      type: (searchParams.get('type') as RankingType | null) ?? 'popular',
      period: parseRankingPeriod(searchParams.get('period')),
      channel: searchParams.get('channel') ?? undefined,
      limit: 20,
    }),
    [searchParams],
  );

  const activeType = rankingTypes.find((item) => item.id === query.type) ?? rankingTypes[0];

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(undefined);
      try {
        const data = await api.listRankings(query);
        if (isMounted) {
          setRanking(data);
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

  function updateQuery(next: { type?: RankingType; period?: RankingPeriod; channel?: string }) {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    navigate({ pathname: '/rankings', search: params.toString() });
  }

  return (
    <section className="ranking-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">榜单中心</p>
          <h1>找到正在被阅读的作品</h1>
        </div>
      </header>

      <section className="ranking-tabs" aria-label="榜单类型">
        {rankingTypes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={query.type === item.id ? 'active' : ''}
              key={item.id}
              type="button"
              aria-pressed={query.type === item.id}
              onClick={() => updateQuery({ type: item.id })}
            >
              <Icon size={18} aria-hidden />
              <span>{item.label}</span>
            </button>
          );
        })}
      </section>

      <div className="filter-group">
        <span>周期</span>
        <div className="filter-row" role="group" aria-label="榜单周期">
          {rankingPeriods.map((period) => (
            <button
              className={query.period === period.id ? 'active' : ''}
              key={period.id}
              type="button"
              aria-pressed={query.period === period.id}
              onClick={() => updateQuery({ period: period.id })}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span>频道</span>
        <div className="filter-row" role="group" aria-label="频道筛选">
          {channels.map((channel) => (
            <button
              className={(query.channel ?? '') === channel.id ? 'active' : ''}
              key={channel.id || 'all'}
              type="button"
              aria-pressed={(query.channel ?? '') === channel.id}
              onClick={() => updateQuery({ channel: channel.id || undefined })}
            >
              {channel.label}
            </button>
          ))}
        </div>
      </div>

      <section className="layout-grid">
        <div className="main-column">
          <section className="panel">
            <div className="section-title">
              <h2>
                {ranking?.periodLabel ??
                  rankingPeriods.find((item) => item.id === query.period)?.label}
                {' · '}
                {ranking?.title ?? activeType.label}
              </h2>
              <span className="muted">{ranking?.items.length ?? 0} 本</span>
            </div>

            {isLoading && <p className="state-line">加载中...</p>}
            {error && <p className="state-line">无法加载榜单：{error}</p>}
            {!isLoading && !error && ranking?.items.length === 0 && (
              <p className="state-line">暂无上榜作品</p>
            )}

            <div className="ranking-list">
              {(ranking?.items ?? []).map((item) => (
                <Link className="ranking-row" key={item.novel.id} to={`/novels/${item.novel.id}`}>
                  <span className={`ranking-number ${item.rank <= 3 ? 'top' : ''}`}>
                    {item.rank}
                  </span>
                  <NovelCover novel={item.novel} size="mini" />
                  <div className="ranking-info">
                    <h3>{item.novel.title}</h3>
                    <p>{item.novel.summary}</p>
                    <small>
                      {item.novel.category.name} · {item.novel.author.nickname} ·{' '}
                      {item.novel._count?.chapters ?? 0} 章
                    </small>
                  </div>
                  <strong>{formatScore(ranking?.type ?? query.type, item.score)}</strong>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="panel compact">
            <h2>{activeType.label}</h2>
            <p>{activeType.description}</p>
          </section>
          <section className="panel compact">
            <h2>收录规则</h2>
            <p>仅展示已上架或已完结作品，草稿、待审和隐藏作品不会进入公开榜单。</p>
          </section>
        </aside>
      </section>
    </section>
  );
}

function formatScore(type: RankingType, score: number | string) {
  if (type === 'new') {
    return new Date(score).toLocaleDateString('zh-CN');
  }

  if (type === 'popular') {
    return `${Number(score).toLocaleString('zh-CN')} 次`;
  }

  if (type === 'bookshelf') {
    return `${Number(score).toLocaleString('zh-CN')} 收藏`;
  }

  return `${Number(score).toLocaleString('zh-CN')} 条`;
}

function parseRankingPeriod(value: string | null): RankingPeriod {
  return value === 'day' || value === 'month' || value === 'all' ? value : 'week';
}
