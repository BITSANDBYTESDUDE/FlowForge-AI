import { PageHeader } from '@/components/shared/page-header';
import { WorkspaceSettings } from '@/components/settings/workspace-settings';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata = { title: 'Settings' };

/**
 * Settings page.
 *
 * Split into workspace settings (scoped to the active workspace, permission
 * gated) and profile settings (account-level, always available to the signed-in
 * user). Keeping them in one tabbed page avoids a separate top-level nav item
 * for a rarely used screen.
 */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage this workspace and your account." />

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="mt-4">
          <WorkspaceSettings />
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          <ProfileSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
