import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';

export function SetupScreen({title, description, children}) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* eslint-disable-next-line @next/next/no-img-element -- küçük, sabit logo */}
          <img src="/logo.png" alt="Barbeque" width={48} height={48} className="mb-2 size-12 object-contain" />
          <CardTitle className="text-lg">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">{children}</CardContent>
      </Card>
    </main>
  );
}
