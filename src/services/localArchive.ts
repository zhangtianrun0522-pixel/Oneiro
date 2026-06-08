import type { DreamArchiveItem, DreamResult, UserInfo } from '../types';

const ARCHIVE_KEY = 'oneiro:dream-archive';
const USER_KEY = 'oneiro:last-user';
const MAX_ARCHIVE_ITEMS = 5;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getLastUser(): UserInfo | null {
  return readJson<UserInfo | null>(USER_KEY, null);
}

export function saveLastUser(userInfo: UserInfo): void {
  writeJson(USER_KEY, userInfo);
}

export function getDreamArchive(): DreamArchiveItem[] {
  return readJson<DreamArchiveItem[]>(ARCHIVE_KEY, []);
}

export function saveDreamArchiveItem(params: {
  id?: string;
  dreamText: string;
  imageUrl?: string;
  result: DreamResult;
  userInfo: UserInfo;
}): DreamArchiveItem {
  const existingItem = params.id
    ? getDreamArchive().find(item => item.id === params.id)
    : undefined;
  const item: DreamArchiveItem = {
    id: params.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: existingItem?.createdAt || new Date().toISOString(),
    dreamText: params.dreamText,
    imageUrl: params.imageUrl,
    result: { ...params.result, imageUrl: params.imageUrl || params.result.imageUrl },
    userInfo: params.userInfo,
  };
  const nextArchive = [item, ...getDreamArchive().filter(existing => existing.id !== item.id)]
    .slice(0, MAX_ARCHIVE_ITEMS);

  writeJson(ARCHIVE_KEY, nextArchive);
  saveLastUser(params.userInfo);
  return item;
}
