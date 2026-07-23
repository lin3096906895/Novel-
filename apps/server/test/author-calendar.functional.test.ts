import assert from 'node:assert/strict';
import { AuthorCalendarEventType, PrismaClient } from '@prisma/client';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const novelId = 'seed_novel_star_pact';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

const prisma = new PrismaClient();
let token = '';
let sessionId = '';
let eventId = '';

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

function testDate() {
  const now = new Date();
  const eventAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.min(now.getDate() + 1, 28),
    10,
    0,
    0,
  );
  return {
    eventAt: eventAt.toISOString(),
    month: `${eventAt.getFullYear()}-${String(eventAt.getMonth() + 1).padStart(2, '0')}`,
  };
}

describe('author creation calendar HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const login = await request<{ accessToken: string; sessionId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(login.response.status, 201);
    assert.ok(login.payload?.data.accessToken);
    token = login.payload.data.accessToken;
    sessionId = login.payload.data.sessionId;
  });

  after(async () => {
    if (eventId) {
      await prisma.authorCalendarEvent.deleteMany({ where: { id: eventId } });
    }
    await prisma.authorCalendarEvent.deleteMany({
      where: { title: { startsWith: '创作日历功能测试' } },
    });
    if (sessionId) {
      await prisma.authSession.deleteMany({ where: { id: sessionId } });
    }
    await prisma.$disconnect();
  });

  it('creates, lists, completes, and deletes a writing plan', async () => {
    const { eventAt, month } = testDate();
    const title = `创作日历功能测试${Date.now()}`;
    const created = await request<{ id: string; isCompleted: boolean }>(
      `/author/novels/${novelId}/calendar-events`,
      {
        method: 'POST',
        body: JSON.stringify({
          title,
          note: '完成一千字初稿',
          eventAt,
          type: AuthorCalendarEventType.WRITING,
        }),
      },
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.payload?.data.isCompleted, false);
    eventId = created.payload?.data.id ?? '';
    assert.ok(eventId);

    const calendar = await request<{
      month: string;
      summary: { plans: number };
      events: Array<{ id: string; source: string; title: string }>;
    }>(`/author/calendar?month=${month}`);
    assert.equal(calendar.response.status, 200);
    assert.equal(calendar.payload?.data.month, month);
    assert.ok((calendar.payload?.data.summary.plans ?? 0) >= 1);
    assert.equal(
      calendar.payload?.data.events.some(
        (event) => event.id === eventId && event.source === 'PLAN' && event.title === title,
      ),
      true,
    );

    const completed = await request<{ isCompleted: boolean; title: string }>(
      `/author/calendar-events/${eventId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isCompleted: true, title: `${title}已完成` }),
      },
    );
    assert.equal(completed.response.status, 200);
    assert.equal(completed.payload?.data.isCompleted, true);
    assert.equal(completed.payload?.data.title, `${title}已完成`);

    const updatedCalendar = await request<{
      events: Array<{ id: string; isCompleted: boolean }>;
    }>(`/author/calendar?month=${month}`);
    assert.equal(
      updatedCalendar.payload?.data.events.find((event) => event.id === eventId)?.isCompleted,
      true,
    );

    const deleted = await request<{ deletedId: string }>(`/author/calendar-events/${eventId}`, {
      method: 'DELETE',
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.payload?.data.deletedId, eventId);
    eventId = '';
  });
});
