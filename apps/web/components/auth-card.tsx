import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Centered card used by sign-in, onboarding and other pre-portal pages. */
export function AuthCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-12 w-full max-w-sm px-4">
      <Card>
        {title && <CardHeader><CardTitle className="text-xl">{title}</CardTitle></CardHeader>}
        <CardContent className={`flex flex-col gap-4 ${title ? "" : "pt-6"}`}>{children}</CardContent>
      </Card>
    </div>
  );
}
