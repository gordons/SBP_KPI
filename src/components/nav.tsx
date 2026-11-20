'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Periode', match: (p: string) => p === '/' || p.startsWith('/periode') },
  { href: '/setting', label: 'Setting', match: (p: string) => p.startsWith('/setting') },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Menu utama">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.match(path) ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
