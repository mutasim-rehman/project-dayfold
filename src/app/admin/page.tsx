import AdminPanel from "@/components/admin-panel";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminPanel/>;
}
