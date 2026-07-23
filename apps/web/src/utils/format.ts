export function formatWordCount(value: number) {
  const wordCount = Math.max(0, Math.round(value));
  if (wordCount >= 10000) {
    return `${Math.round(wordCount / 1000) / 10} 万字`;
  }

  return `${wordCount} 字`;
}

export function formatReadingDuration(value: number) {
  const seconds = Math.max(0, Math.round(value));
  if (seconds < 60) {
    return `${seconds} 秒`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`;
}
