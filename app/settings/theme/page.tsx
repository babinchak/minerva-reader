import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeSettingsContent } from "@/components/settings-theme-content";

export default function ThemeSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Theme</h1>
        <p className="text-muted-foreground mt-1">
          Choose how Minerva Reader looks
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Select light, dark, or match your system preference
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSettingsContent />
        </CardContent>
      </Card>
    </div>
  );
}
