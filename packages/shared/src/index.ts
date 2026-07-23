export type UserRole = 'reader' | 'author' | 'admin';

export type NovelStatus = 'draft' | 'reviewing' | 'rejected' | 'serializing' | 'completed' | 'hidden';

export type ChapterStatus = 'draft' | 'reviewing' | 'published' | 'rejected';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface FeaturedNovel {
  id: string;
  title: string;
  authorName: string;
  categoryName: string;
  summary: string;
  coverUrl?: string;
  wordCount: number;
  status: NovelStatus;
}

export const CHANNELS = [
  { id: 'male', name: '男频' },
  { id: 'female', name: '女频' },
  { id: 'short', name: '短篇' },
  { id: 'published', name: '出版' },
] as const;
