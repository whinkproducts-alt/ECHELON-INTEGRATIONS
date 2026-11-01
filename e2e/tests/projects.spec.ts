import { test, expect } from '@playwright/test';
import { OWNER, USER_B, loginAndWait, newSession, apiJson, unique } from './helpers';

test.describe('projects and subsidiaries', () => {
  test('create a project with a subsidiary, see the chip on the Command Center, open the report', async ({ page }) => {
    const name = unique('E2E Project');
    await loginAndWait(page, OWNER.email);

    await page.goto('/dashboard/projects');
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByPlaceholder('Project name').fill(name);
    await page.getByRole('group', { name: /Subsidiary/ }).getByText('Whink Apps', { exact: true }).click();
    const created = page.waitForResponse((r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const res = await created;
    expect(res.status()).toBe(200);
    const project = (await res.json()) as { id: string; subsidiary: string };
    expect(project.subsidiary).toBe('apps');

    await page.goto('/dashboard');
    const link = page.getByRole('link', { name: new RegExp(name) });
    await expect(link).toBeVisible();
    await expect(link.getByText('Whink Apps')).toBeVisible(); // subsidiary chip

    await link.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/subsidiaries/apps/projects/${project.id}$`));
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Progress', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Milestones').first()).toBeVisible();
  });

  test('user B gets 404 for user A project report (API and screen)', async ({ page, browser }) => {
    const name = unique('E2E Private');
    await loginAndWait(page, OWNER.email);
    const made = await apiJson<{ id: string }>(page, 'POST', '/api/projects', { name, subsidiary: 'consult' });
    expect(made.status).toBe(200);
    const id = made.json.id;
    expect((await apiJson(page, 'GET', `/api/projects/${id}/report`)).status).toBe(200);

    const b = await newSession(browser, USER_B.email);
    const api = await apiJson(b.page, 'GET', `/api/projects/${id}/report`);
    expect(api.status).toBe(404);
    expect(JSON.stringify(api.json)).not.toContain(name);

    await b.page.goto(`/dashboard/subsidiaries/consult/projects/${id}`);
    await expect(b.page.getByText('Project not found')).toBeVisible();
    await expect(b.page.getByText(name)).toHaveCount(0);

    const list = await apiJson<Array<{ id: string }>>(b.page, 'GET', '/api/projects');
    expect(list.json.some((p) => p.id === id)).toBe(false);
    await b.context.close();
  });
});
