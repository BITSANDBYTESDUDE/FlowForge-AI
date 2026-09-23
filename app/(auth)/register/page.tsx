import type { Metadata } from 'next';
import { RegisterForm } from '@/components/shared/register-form';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a FlowForge AI account and turn a described process into a workflow.',
};

export default function RegisterPage() {
  return <RegisterForm />;
}
