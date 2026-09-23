/**
 * End-to-end journey test.
 *
 * Walks the full happy path a real user takes, in order, against a running app
 * and a real MongoDB:
 *
 *   register -> dashboard -> create workspace -> generate workflow with AI
 *   -> save -> edit and rename -> publish -> run -> complete a step -> see progress
 *
 * Each step asserts the state the *next* step depends on, so a failure points at
 * the stage that broke rather than at a distant assertion. Unique emails per run
 * keep the suite repeatable against a database that is not wiped between runs.
 */
import { expect, test } from '@playwright/test';

/** Unique per run so re-running never collides on the unique email index. */
function uniqueEmail(prefix: string): string {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  return `${prefix}-${stamp}@example.test`;
}

const PASSWORD = 'flowforge-test-1';

test.describe('new user journey', () => {
  test('register, build a workspace, generate, edit, run and track a workflow', async ({
    page,
  }) => {
    const email = uniqueEmail('e2e');

    // ---------------------------------------------------------- register
    await page.goto('/register');
    await page.getByLabel('Name').fill('E2E Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // autoSignIn is on, so registration lands straight on the dashboard.
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Create your first workspace' })).toBeVisible();

    // ------------------------------------------------------ workspace
    const workspaceName = `E2E Workspace ${Date.now()}`;
    await page.getByLabel('Workspace name').fill(workspaceName);
    await page.getByRole('button', { name: 'Create workspace' }).click();

    // The dashboard switches from the first-run prompt to the workspace view.
    await expect(page.getByRole('heading', { name: workspaceName })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create your first workspace' })).toBeHidden();

    // ------------------------------------------------- AI generation
    await page.goto('/dashboard/workflows');
    // Exact match on purpose: the empty state renders an "No workflows yet"
    // heading, which a substring match on 'Workflows' also resolves to. Which
    // one is on screen depends on how fast the first query settles, so a loose
    // match makes this assertion flaky rather than wrong.
    await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Generate with AI' }).first().click();

    // Two-phase dialog: describe, generate a draft, then save.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Generate a workflow')).toBeVisible();

    await dialog
      .getByLabel('What process do you want to run?')
      .fill('I want to launch a website for a client');

    await dialog.getByRole('button', { name: 'Generate workflow' }).click();

    // A draft arrives as a preview; "Save workflow" is what persists it.
    await expect(dialog.getByRole('button', { name: 'Save workflow' })).toBeVisible({
      timeout: 30_000,
    });
    await dialog.getByRole('button', { name: 'Save workflow' }).click();

    // Saving redirects into the builder for the new workflow.
    await page.waitForURL(/\/workflow\/[a-f0-9]{24}/, { timeout: 30_000 });
    const builderUrl = page.url();
    const workflowId = new URL(builderUrl).pathname.split('/').pop()!;
    expect(workflowId).toMatch(/^[a-f0-9]{24}$/);

    // The builder renders the generated graph rather than an empty canvas.
    const canvasNodes = page.locator('.react-flow__node');
    await expect(canvasNodes.first()).toBeVisible({ timeout: 20_000 });
    const nodeCount = await canvasNodes.count();
    expect(nodeCount).toBeGreaterThanOrEqual(3);

    // ------------------------------------------------- edit and save
    // Renaming is the cheapest real edit that exercises the save path; the graph
    // itself is already persisted and versioned at v1.
    await page.getByRole('button', { name: 'Workflow settings' }).click();
    const settingsDialog = page.getByRole('dialog');
    const renamed = `E2E Website Launch ${Date.now()}`;
    const nameField = settingsDialog.getByLabel('Name');
    await nameField.fill(renamed);
    await settingsDialog.getByRole('button', { name: /save/i }).click();

    await expect(page.getByText(renamed)).toBeVisible({ timeout: 15_000 });

    // ------------------------------------------------------ publish
    // Only a DRAFT can be published, and only an ACTIVE workflow can be run.
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Run' })).toBeVisible();

    // ---------------------------------------------------------- run
    await page.getByRole('button', { name: 'Run' }).click();
    const runDialog = page.getByRole('dialog');
    await runDialog.getByLabel('Label (optional)').fill('E2E Client');
    await runDialog.getByRole('button', { name: 'Start execution' }).click();

    // Starting a run navigates to the execution monitor.
    await page.waitForURL(/\/execution\?/, { timeout: 30_000 });

    // ------------------------------------------------------ complete
    // The engine stops at the first task step, so a task must be waiting.
    const completeButton = page.getByRole('button', { name: 'Complete' }).first();
    await expect(completeButton).toBeVisible({ timeout: 20_000 });
    await completeButton.click();

    // Completing the task moves the run forward; the completed step is listed.
    await expect(page.getByText('Completed steps')).toBeVisible({ timeout: 20_000 });

    // The monitor reports the run's own progress, not a static label.
    await expect(page.getByText(/\d+\s*\/\s*\d+\s*steps|\d+%/)).toBeVisible({ timeout: 20_000 });
  });

  test('an anonymous visitor is redirected away from the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('a returning user can sign in and reach their workspace', async ({ page }) => {
    const email = uniqueEmail('returning');

    await page.goto('/register');
    await page.getByLabel('Name').fill('Returning Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/dashboard/);

    await page.getByLabel('Workspace name').fill('Returning Workspace');
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Returning Workspace' })).toBeVisible();

    // Sign out first. An authenticated visitor is bounced away from `/login`
    // back to the dashboard, so skipping this step would silently re-test the
    // dashboard rather than the sign-in form.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // Sign back in with the same credentials.

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Returning Workspace' })).toBeVisible();
  });

  test('signing in with the wrong password shows an error and does not authenticate', async ({
    page,
  }) => {
    const email = uniqueEmail('wrongpass');

    await page.goto('/register');
    await page.getByLabel('Name').fill('Wrong Password Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/dashboard/);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password-9');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
