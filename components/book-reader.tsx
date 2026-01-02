"use client";

import { StatefulReader, StatefulPreferencesProvider, ThStoreProvider, ThI18nProvider } from "@edrlab/thorium-web/epub";
import { useEffect, useState } from "react";

interface BookReaderProps {
  rawManifest: any;
  selfHref: string;
}

export function BookReader({ rawManifest, selfHref }: BookReaderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading reader...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen">
      <ThStoreProvider>
        <StatefulPreferencesProvider>
          <ThI18nProvider>
            <StatefulReader
              rawManifest={rawManifest}
              selfHref={selfHref}
            />
          </ThI18nProvider>
        </StatefulPreferencesProvider>
      </ThStoreProvider>
    </div>
  );
}
