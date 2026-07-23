import type { Novel } from '../api/types';

export function NovelCover({ novel, size = 'default' }: { novel: Pick<Novel, 'title' | 'coverUrl'>; size?: 'default' | 'mini' | 'large' }) {
  const className = `cover${size === 'default' ? '' : ` ${size}`}`;

  if (novel.coverUrl) {
    return <img className={`${className} cover-image`} src={novel.coverUrl} alt={novel.title} />;
  }

  return <div className={className}>{novel.title.slice(0, 2)}</div>;
}
