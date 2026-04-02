import { AdminCollectionDetail } from "@/components/admin-collection-detail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ collectionId: string }>;
}

export default async function AdminCollectionDetailPage({ params }: PageProps) {
  const { collectionId } = await params;

  return (
    <div className="space-y-6">
      <AdminCollectionDetail collectionId={collectionId} />
    </div>
  );
}
