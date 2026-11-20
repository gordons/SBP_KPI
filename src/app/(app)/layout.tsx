import { Nav } from '@/components/nav';
import { getSession } from '@/lib/data';
import { ROLE_LABEL } from '@/lib/labels';
import { signOut } from '../login/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          KPI &amp; Insentif
          <span>SBP Group</span>
        </div>
        <Nav />
        <div className="who">
          <strong>{s.name}</strong>
          {s.role ? ROLE_LABEL[s.role] : 'Belum punya peran'}
          <form action={signOut}>
            <button type="submit">Keluar</button>
          </form>
        </div>
      </aside>
      <main className="main">
        {s.role ? (
          children
        ) : (
          <div className="panel stack">
            <h1>Akun Anda belum punya peran</h1>
            <p className="muted">
              Minta HR Manager menambahkan akun {s.email} ke tabel profiles dengan peran HR Admin, HR Manager, atau Viewer.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
