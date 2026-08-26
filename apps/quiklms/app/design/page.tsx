'use client';
/**
 * Design-system styleguide — a living reference for the QuikLMS foundation:
 * tokens, typography, primitives, and the signature progress motif. Not part of
 * the product surface; kept public for review (see middleware PUBLIC_PREFIXES).
 */
import { useState } from 'react';
import { BookOpen, Users, GraduationCap, Award, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StatCard } from '@/components/DashboardScaffold';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

const swatches: { name: string; cls: string }[] = [
  { name: 'canvas', cls: 'bg-canvas' },
  { name: 'surface', cls: 'bg-surface' },
  { name: 'surface-muted', cls: 'bg-surface-muted' },
  { name: 'surface-sunken', cls: 'bg-surface-sunken' },
  { name: 'brand-primary', cls: 'bg-[var(--brand-primary)]' },
  { name: 'brand-secondary', cls: 'bg-[var(--brand-secondary)]' },
  { name: 'success', cls: 'bg-success' },
  { name: 'warning', cls: 'bg-warning' },
  { name: 'danger', cls: 'bg-danger' },
  { name: 'info', cls: 'bg-info' },
];

export default function DesignSystemPage() {
  const [dark, setDark] = useState(false);

  function toggle() {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-canvas px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-sm font-medium text-[var(--brand-primary)]">QuikLMS</p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-fg">Design System</h1>
            <p className="mt-1 max-w-prose text-sm text-fg-muted">
              Token-driven foundation — modern &amp; trustworthy, neutral for school and
              corporate, and brand-color agnostic so every tenant stays on-system.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={toggle}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {dark ? 'Light' : 'Dark'}
          </Button>
        </header>

        <Section title="Color tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {swatches.map((s) => (
              <div key={s.name} className="overflow-hidden rounded-lg border border-line">
                <div className={`h-16 ${s.cls}`} />
                <div className="bg-surface px-2 py-1.5 text-xs text-fg-muted">{s.name}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <Card>
            <CardContent className="space-y-3">
              <p className="font-display text-4xl font-bold tracking-tight text-fg">Display / Bricolage Grotesque</p>
              <p className="text-base text-fg">Body / Inter — readable in dense, data-heavy interfaces and forms.</p>
              <p className="text-sm text-fg-muted">Muted secondary text for supporting detail and metadata.</p>
              <p className="tabular text-2xl font-semibold text-fg">1,248 · 96.4% · ₹3,40,000</p>
            </CardContent>
          </Card>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">Enrolled</Badge>
            <Badge tone="success">Completed</Badge>
            <Badge tone="warning">Due soon</Badge>
            <Badge tone="danger">Overdue</Badge>
            <Badge tone="info">In review</Badge>
            <Badge tone="neutral">Draft</Badge>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-xl gap-4">
            <Input label="Full name" placeholder="Jane Cooper" required />
            <Input label="Work email" type="email" placeholder="jane@acme.com" hint="We'll send the invite here." />
            <Input label="Course code" defaultValue="QS-101" error="That code is already taken." />
          </div>
        </Section>

        <Section title="Signature — progress rings">
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing value={24} />
            <ProgressRing value={62} />
            <ProgressRing value={89} />
            <ProgressRing value={100} size={80} strokeWidth={7} />
          </div>
        </Section>

        <Section title="Stat cards">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active learners" value="1,248" icon={Users} delta={12} />
            <StatCard label="Courses live" value="34" icon={BookOpen} delta={4} />
            <StatCard label="Avg. completion" value="—" icon={GraduationCap} progress={72} />
            <StatCard label="Certificates issued" value="312" icon={Award} delta={-3} />
          </div>
        </Section>

        <Section title="Cards & loading">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Introduction to Data Analytics</CardTitle>
                  <CardDescription>12 modules · 8h 30m</CardDescription>
                </div>
                <Badge tone="success">Active</Badge>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                <ProgressRing value={62} size={56} strokeWidth={5} />
                <p className="text-sm text-fg-muted">8 of 12 modules complete. Keep going to earn your certificate.</p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Resume</Button>
                <Button size="sm" variant="ghost">Details</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardContent className="space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-9 w-28" />
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  );
}
