'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, Save } from 'lucide-react';
import { usersApi } from '@/lib/api/endpoints';
import { signOut, updateUser } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * Profile settings.
 *
 * Name and avatar are updated through Better Auth's own user endpoint rather
 * than a bespoke route: the auth provider owns the user record, and duplicating
 * that write path would risk the two diverging.
 *
 * Email is displayed read-only. Changing it requires a verification flow, which
 * is not implemented — showing an editable field that cannot work would be a
 * fake control.
 */
export function ProfileSettings() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['me'], queryFn: () => usersApi.me() });

  const [name, setName] = useState('');
  const [image, setImage] = useState('');

  useEffect(() => {
    setName(data?.user.name ?? '');
    setImage(data?.user.image ?? '');
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const result = await updateUser({
        name: name.trim(),
        image: image.trim() || null,
      });
      if (result.error) throw new Error(result.error.message ?? 'Could not update profile');
      return result;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const signOutAll = useMutation({
    mutationFn: async () => {
      await signOut();
      // Full navigation so the server session cookie is definitely cleared from
      // any cached server component tree.
      window.location.href = '/login';
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const { user, workspaceIds } = data;
  const initials = user.name.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>How you appear to other members of your workspaces.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {user.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <Badge variant="muted" className="mt-1.5">
                {user.plan.toLowerCase()} plan
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-image">Avatar URL</Label>
            <Input
              id="profile-image"
              type="url"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder="https://example.com/avatar.png"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              File uploads are not enabled; paste a URL for now.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={user.email} readOnly disabled />
            <p className="text-xs text-muted-foreground">
              Changing your email requires verification, which is not implemented yet.
            </p>
          </div>

          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={name.trim().length < 2 || name.trim() === user.name && (image || '') === (user.image || '')}
          >
            <Save className="size-4" />
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspaces</CardTitle>
          <CardDescription>
            You are a member of {workspaceIds.length} workspace
            {workspaceIds.length === 1 ? '' : 's'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => signOutAll.mutate()} loading={signOutAll.isPending}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
