import { Invite } from '@/components/invite';
export default async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  return <Invite token={(await params).token} />;
}
