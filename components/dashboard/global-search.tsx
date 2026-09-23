'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Loader2, FileText, ListChecks, Layers } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const TYPE_META = {
  workflow: { icon: FileText, label: 'Workflow' },
  task: { icon: ListChecks, label: 'Task' },
  template: { icon: Layers, label: 'Template' },
} as const;

/**
 * Global search.
 *
 * Opens on Cmd/Ctrl+K and debounces input before hitting `/api/search`, which is
 * scoped to the caller's workspaces server-side. Query length is gated at 2
 * characters to match the server's minimum.
 */
export function GlobalSearch() {
  const router = useRouter();
  const { activeWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(rawQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced, activeWorkspace?.id],
    queryFn: () => searchApi.query(debounced, { workspaceId: activeWorkspace?.id }),
    enabled,
  });

  const results = data?.results ?? [];

  function go(url: string) {
    setOpen(false);
    setRawQuery('');
    router.push(url);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 w-full justify-start gap-2 px-2.5 text-muted-foreground sm:w-56"
      >
        <Search className="size-3.5" />
        <span className="text-xs">Search…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline-block">
          ⌘K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogTitle className="sr-only">Search workflows, tasks and templates</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              placeholder="Search workflows, tasks and templates…"
              className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              autoFocus
              aria-label="Search query"
            />
            {isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>

          <div className="max-h-80 overflow-y-auto p-2" aria-live="polite">
            {!enabled ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Type at least two characters to search.
              </p>
            ) : results.length === 0 && !isFetching ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No matches for “{debounced}”.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {results.map((result) => {
                  const meta =
                    TYPE_META[result.type as keyof typeof TYPE_META] ?? TYPE_META.workflow;
                  const Icon = meta.icon;
                  return (
                    <li key={`${result.type}-${result.id}`}>
                      <button
                        type="button"
                        onClick={() => go(result.url)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left',
                          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        <Icon
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{result.title}</span>
                          {result.subtitle ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {result.subtitle}
                            </span>
                          ) : null}
                        </span>
                        <Badge variant="muted" className="shrink-0">
                          {meta.label}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
