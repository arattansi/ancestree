import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder for the canvas tree (built in Step 6 — Tree visualization).
export default function TreePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>Your family tree</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          The interactive tree canvas lands in Step 6. For now this is a
          placeholder authenticated route.
        </CardContent>
      </Card>
    </main>
  );
}
